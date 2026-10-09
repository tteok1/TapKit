import { spawn } from 'node:child_process';
import { lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { GitInspectSchema } from '@tapkit/contracts';

export type GitSnapshot = ReadonlyArray<{ path: string; content: Uint8Array }>;
export class GitBrokerError extends Error {}

function snapshot(files: GitSnapshot) {
  if (files.length > 1000) throw new GitBrokerError('GIT_SNAPSHOT_LIMIT');
  let size = 0;
  const seen = new Set<string>();
  return files.map(({ path, content }) => {
    const parts = path.split('/');
    if (
      path.length > 240 ||
      parts.some(
        (part) =>
          !part ||
          part === '.' ||
          part === '..' ||
          /[\\:<>"|?*\x00-\x1f~]/u.test(part) ||
          /[. ]$/.test(part) ||
          part.toLowerCase() === '.git' ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      ) ||
      seen.has(path.toLowerCase())
    )
      throw new GitBrokerError('GIT_SNAPSHOT_PATH');
    seen.add(path.toLowerCase());
    size += content.byteLength;
    if (size > 16 * 1024 * 1024) throw new GitBrokerError('GIT_SNAPSHOT_LIMIT');
    // Freeze the authorized bytes before any async work; never follow user filesystem paths.
    return { path, content: Buffer.from(content) };
  });
}

async function rejectLinks(path: string) {
  for (let current = resolve(path); ; current = dirname(current)) {
    if ((await lstat(current)).isSymbolicLink()) throw new GitBrokerError('GIT_PRIVATE_REPARSE');
    if (dirname(current) === current) break;
  }
}

/** Internal P00 fixture broker. Core supplies authorized bytes and a host-private root.
 * No renderer/model input may supply these constructor arguments or snapshot contents.
 * Persistent project mirrors, commits and remotes belong to P09.
 */
export class GitBroker {
  constructor(
    private readonly executable: string,
    private readonly privateRoot: string,
  ) {
    if (!isAbsolute(executable) || !isAbsolute(privateRoot))
      throw new GitBrokerError('GIT_BROKER_PATH');
  }

  async inspect(raw: unknown, baseline: GitSnapshot, current: GitSnapshot) {
    const request = GitInspectSchema.parse(raw);
    const before = snapshot(baseline),
      after = snapshot(current);
    await rejectLinks(this.privateRoot);
    await rejectLinks(this.executable);
    const lease = await mkdtemp(join(this.privateRoot, 'git-inspect-'));
    const metadata = join(lease, 'metadata.git'),
      worktree = join(lease, 'worktree');
    const home = join(lease, 'home'),
      empty = join(lease, 'empty');
    // The root is host-private, never granted to execution accounts. Every invocation owns
    // a new lease, so untrusted .git/config/index/alternates can never become authority.
    const env: NodeJS.ProcessEnv = {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: home,
      TEMP: home,
      TMP: home,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: 'NUL',
      GIT_CONFIG_GLOBAL: 'NUL',
      GIT_ATTR_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_PAGER: '',
      LC_ALL: 'C',
    };
    const prefix = [
      '--no-pager',
      '--literal-pathspecs',
      '-c',
      'core.hooksPath=' + empty,
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.attributesFile=NUL',
      '-c',
      'core.autocrlf=false',
      '-c',
      'core.quotePath=false',
      '-c',
      'credential.helper=',
      '-c',
      'protocol.allow=never',
      '-c',
      'submodule.recurse=false',
      '-c',
      'diff.ignoreSubmodules=all',
      '-c',
      'core.untrackedCache=false',
    ];
    const run = (args: string[]) =>
      new Promise<string>((resolveResult, reject) => {
        const child = spawn(this.executable, [...prefix, ...args], {
          cwd: lease,
          env,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        const stdout: Buffer[] = [];
        let bytes = 0,
          failure: string | undefined;
        const timer = setTimeout(() => {
          failure = 'GIT_TIMEOUT';
          child.kill();
        }, 15_000);
        for (const stream of [child.stdout, child.stderr])
          stream.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > 1024 * 1024) {
              failure = 'GIT_OUTPUT_LIMIT';
              child.kill();
            } else if (stream === child.stdout) stdout.push(chunk);
          });
        child.on('error', () => {
          clearTimeout(timer);
          reject(new GitBrokerError('GIT_START_FAILED'));
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          if (failure || code !== 0) reject(new GitBrokerError(failure ?? 'GIT_EXIT_' + code));
          else resolveResult(Buffer.concat(stdout).toString('utf8'));
        });
      });
    const context = ['--git-dir=' + metadata, '--work-tree=' + worktree];
    const materialize = async (files: ReturnType<typeof snapshot>) => {
      await mkdir(worktree);
      for (const file of files) {
        const target = join(worktree, file.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.content, { flag: 'wx' });
      }
    };
    try {
      await Promise.all([mkdir(home), mkdir(empty)]);
      await run(['init', '--bare', '--quiet', '--template=' + empty, metadata]);
      // This is the entire repository configuration; no include, filters or remotes.
      await writeFile(
        join(metadata, 'config'),
        '[core]\nrepositoryformatversion = 0\nbare = false\n',
      );
      await materialize(before);
      await run([...context, 'add', '--force', '--all', '--', '.']);
      // Exact generated child path, below our exclusive lease; never a caller-supplied deletion.
      if (relative(lease, worktree) !== 'worktree') throw new GitBrokerError('GIT_LEASE_SCOPE');
      await rm(worktree, { recursive: true });
      await materialize(after);
      const args =
        request.kind === 'status'
          ? ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all']
          : [
              'diff',
              '--no-ext-diff',
              '--no-textconv',
              '--no-renames',
              '--ignore-submodules=all',
              '--',
              '.',
            ];
      return { kind: request.kind, output: await run([...context, ...args]) };
    } finally {
      const child = relative(this.privateRoot, lease);
      if (isAbsolute(child) || !/^git-inspect-[^/\\]+$/.test(child))
        throw new GitBrokerError('GIT_LEASE_SCOPE');
      await rm(lease, { recursive: true, force: true });
    }
  }
}
