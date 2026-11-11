import { spawn } from 'node:child_process';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  writeFile,
  unlink,
  rm,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  CodePathSchema,
  GitHubBranchSchema,
  GitHubRepoSchema,
  GitHubShaSchema,
  GitHubTokenSchema,
} from '@tapkit/contracts';

export const codeHash = (value: string | Uint8Array | null) =>
  value === null ? null : createHash('sha256').update(value).digest('hex');
export async function codeCanonical(path: string, directory = false) {
  const absolute = resolve(path),
    stat = await lstat(absolute);
  if (
    stat.isSymbolicLink() ||
    (directory ? !stat.isDirectory() : !stat.isFile()) ||
    (await realpath(absolute)).toLowerCase() !== absolute.toLowerCase()
  )
    throw Error('PERMISSION_DENIED');
  for (let current = absolute; dirname(current) !== current; current = dirname(current))
    if ((await lstat(current)).isSymbolicLink()) throw Error('PERMISSION_DENIED');
  return stat;
}
export async function codeRead(root: string, path: string): Promise<string | null> {
  CodePathSchema.parse(path);
  await codeCanonical(root, true);
  const target = join(root, path);
  try {
    let parent = root;
    for (const part of path.split('/')) {
      const names = await readdir(parent);
      if (!names.includes(part)) return null;
      parent = join(parent, part);
      if (parent !== target) await codeCanonical(parent, true);
    }
    const before = await codeCanonical(target);
    if (before.nlink > 1) throw Error('PERMISSION_DENIED');
    if (before.size > 1024 * 1024) throw Error('OUTPUT_LIMIT_REACHED');
    const handle = await open(target, 'r');
    try {
      const opened = await handle.stat(),
        bytes = await handle.readFile(),
        after = await codeCanonical(target);
      if (
        opened.ino !== before.ino ||
        before.ino !== after.ino ||
        before.mtimeMs !== after.mtimeMs ||
        before.ctimeMs !== after.ctimeMs ||
        bytes.length !== after.size
      )
        throw Error('CONFLICT');
      if (bytes.includes(0)) throw Error('FEATURE_NOT_AVAILABLE');
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } finally {
      await handle.close();
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}
export async function codeTree(root: string) {
  const files: string[] = [];
  let directories = 0;
  const walk = async (at: string, prefix: string) => {
    if (++directories > 2000) throw Error('OUTPUT_LIMIT_REACHED');
    await codeCanonical(at, true);
    for (const item of await readdir(at, { withFileTypes: true })) {
      const path = prefix + item.name;
      if (!CodePathSchema.safeParse(path).success) continue;
      if (item.isSymbolicLink()) throw Error('PERMISSION_DENIED');
      if (item.isDirectory()) await walk(join(at, item.name), path + '/');
      else if (item.isFile()) files.push(path);
      else throw Error('PERMISSION_DENIED');
      if (files.length > 1000) throw Error('OUTPUT_LIMIT_REACHED');
    }
  };
  await walk(root, '');
  return files.sort();
}

type GitHubTransport = { repo: string; token: string; proxy: string; address: string };

/** Trusted fixed-argument broker. Network is available only to the GitHub operations below. */
export class CodeGitBroker {
  constructor(
    readonly executable: string,
    readonly root: string,
  ) {}
  async run(
    args: string[],
    directory = this.root,
    input?: string,
    indexFile?: string,
  ): Promise<Buffer> {
    return this.spawnGit(args, directory, { input, indexFile });
  }
  private async spawnGit(
    args: string[],
    directory: string,
    options: {
      input?: string | undefined;
      indexFile?: string | undefined;
      github?: GitHubTransport;
    },
  ): Promise<Buffer> {
    await codeCanonical(this.executable);
    await codeCanonical(directory, true);
    const empty = join(this.root, 'empty');
    await mkdir(empty, { recursive: true });
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
      'core.untrackedCache=false',
    ];
    const network = options.github;
    const config: [string, string][] = network
      ? [
          ['protocol.https.allow', 'always'],
          ['http.followRedirects', 'false'],
          ['http.sslVerify', 'true'],
          ['http.proxy', network.proxy],
          [
            'http.curloptResolve',
            `github.com:443:${network.address.includes(':') ? `[${network.address}]` : network.address}`,
          ],
          ['http.lowSpeedLimit', '1'],
          ['http.lowSpeedTime', '15'],
          [
            'http.https://github.com/.extraHeader',
            'Authorization: Basic ' +
              Buffer.from('x-access-token:' + network.token).toString('base64'),
          ],
        ]
      : [];
    const gitEnv: Record<string, string> = { GIT_CONFIG_COUNT: String(config.length) };
    config.forEach(([key, value], i) => {
      gitEnv[`GIT_CONFIG_KEY_${i}`] = key;
      gitEnv[`GIT_CONFIG_VALUE_${i}`] = value;
    });
    return new Promise((yes, no) => {
      const child = spawn(this.executable, [...prefix, ...args], {
        cwd: directory,
        windowsHide: true,
        env: {
          SystemRoot: process.env.SystemRoot,
          WINDIR: process.env.WINDIR,
          HOME: empty,
          USERPROFILE: empty,
          XDG_CONFIG_HOME: empty,
          TEMP: empty,
          TMP: empty,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_SYSTEM: 'NUL',
          GIT_CONFIG_GLOBAL: 'NUL',
          GIT_ATTR_NOSYSTEM: '1',
          GIT_TERMINAL_PROMPT: '0',
          GIT_OPTIONAL_LOCKS: '0',
          LC_ALL: 'C',
          ...gitEnv,
          ...(options.indexFile ? { GIT_INDEX_FILE: options.indexFile } : {}),
        },
        stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      });
      child.stdin?.on('error', () => {});
      child.stdin?.end(options.input, 'utf8');
      let size = 0,
        failure = '';
      const out: Buffer[] = [];
      let diagnostic = '';
      const timer = setTimeout(() => {
        failure = 'TIMEOUT';
        child.kill();
      }, 30000);
      for (const stream of [child.stdout, child.stderr])
        stream?.on('data', (b: Buffer) => {
          size += b.length;
          if (size > 4 * 1024 * 1024) {
            failure = 'OUTPUT_LIMIT_REACHED';
            child.kill();
          } else if (stream === child.stdout) out.push(b);
          else if (network && diagnostic.length < 8192)
            diagnostic += b.toString('utf8').slice(0, 8192);
        });
      child.on('error', () => {
        clearTimeout(timer);
        no(Error('FEATURE_NOT_AVAILABLE'));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (failure || code !== 0)
          no(
            Error(
              failure === 'TIMEOUT'
                ? 'TOOL_TIMEOUT'
                : failure ||
                    (!network
                      ? 'CONFLICT'
                      : /authentication failed|returned error: 401/i.test(diagnostic)
                        ? 'AUTH_EXPIRED'
                        : /protected branch|permission.*denied|returned error: 403|repository not found/i.test(
                              diagnostic,
                            )
                          ? 'PERMISSION_DENIED'
                          : /non-fast-forward|\[rejected\]/i.test(diagnostic)
                            ? 'CONFLICT'
                            : 'NETWORK_ERROR'),
            ),
          );
        else yes(Buffer.concat(out));
      });
    });
  }
  private githubUrl(network: GitHubTransport) {
    GitHubTokenSchema.parse(network.token);
    return 'https://github.com/' + GitHubRepoSchema.parse(network.repo) + '.git';
  }
  private async assertPrivateMirror(mirror: string) {
    if (!/^[a-f0-9-]{36}\.git$/.test(relative(this.root, mirror))) throw Error('PERMISSION_DENIED');
    await codeCanonical(mirror, true);
    await codeCanonical(join(mirror, 'config'));
    const config = await readFile(join(mirror, 'config'), 'utf8');
    if (
      config
        .split(/\r?\n/)
        .some(
          (line) =>
            !/^\s*(?:\[core\]|(?:repositoryformatversion|filemode|bare|symlinks|ignorecase|logallrefupdates)\s*=\s*(?:0|true|false))?\s*$/i.test(
              line,
            ),
        )
    )
      throw Error('PERMISSION_DENIED');
  }
  async removeGithubMirror(mirror: string) {
    if (!/^[a-f0-9-]{36}\.git$/.test(relative(this.root, mirror))) throw Error('PERMISSION_DENIED');
    await codeCanonical(mirror, true);
    await rm(mirror, { recursive: true, force: true, maxRetries: 2 });
  }
  async githubLocalHead(mirror: string, branch: string) {
    await this.assertPrivateMirror(mirror);
    return GitHubShaSchema.parse(
      (
        await this.run([
          '--git-dir=' + mirror,
          'rev-parse',
          '--verify',
          'refs/heads/' + GitHubBranchSchema.parse(branch),
        ])
      )
        .toString()
        .trim(),
    );
  }
  async fetchGithub(id: string, branch: string, network: GitHubTransport) {
    const ref = 'refs/heads/' + GitHubBranchSchema.parse(branch);
    if (!/^[a-f0-9-]{36}$/.test(id)) throw Error('VALIDATION_ERROR');
    const mirror = join(this.root, id + '.git');
    await mkdir(mirror);
    try {
      await this.run(['init', '--bare', '--quiet', '--template=', mirror]);
      await this.assertPrivateMirror(mirror);
      await this.spawnGit(
        [
          '--git-dir=' + mirror,
          '-c',
          'fetch.fsckObjects=true',
          'fetch',
          '--no-tags',
          '--no-recurse-submodules',
          '--no-auto-maintenance',
          '--depth=1',
          this.githubUrl(network),
          '+' + ref + ':' + ref,
        ],
        this.root,
        { github: network },
      );
      await this.run(['--git-dir=' + mirror, 'symbolic-ref', 'HEAD', ref]);
      return { mirror, ...(await this.snapshot(mirror, ref)) };
    } catch (error) {
      // The destination was created exclusively for this attempt under code-private.
      await this.removeGithubMirror(mirror).catch(() => {});
      throw error;
    }
  }
  async githubHead(branch: string, network: GitHubTransport) {
    const ref = 'refs/heads/' + GitHubBranchSchema.parse(branch);
    const output = (
      await this.spawnGit(['ls-remote', '--refs', this.githubUrl(network), ref], this.root, {
        github: network,
      })
    )
      .toString()
      .trim();
    if (!output) return null;
    const [sha, actual] = output.split('\t');
    if (actual !== ref) throw Error('CONFLICT');
    return GitHubShaSchema.parse(sha);
  }
  async pushGithub(
    mirror: string,
    sha: string,
    branch: string,
    previous: string | null,
    network: GitHubTransport,
    guard: () => void,
  ) {
    const ref = 'refs/heads/' + GitHubBranchSchema.parse(branch);
    await this.assertPrivateMirror(mirror);
    GitHubShaSchema.parse(sha);
    if (previous)
      await this.run([
        '--git-dir=' + mirror,
        'merge-base',
        '--is-ancestor',
        GitHubShaSchema.parse(previous),
        sha,
      ]);
    // The lease rejects races. The ancestry check above excludes non-fast-forward updates.
    guard();
    await this.spawnGit(
      [
        '--git-dir=' + mirror,
        'push',
        '--porcelain',
        '--no-verify',
        `--force-with-lease=${ref}:${previous ?? ''}`,
        this.githubUrl(network),
        sha + ':' + ref,
      ],
      this.root,
      { github: network },
    );
  }
  async commitReview(
    mirror: string,
    branch: string,
    parent: string,
    message: string,
    changes: { path: string; content: string | null }[],
    guard: () => void,
  ) {
    const ref = 'refs/heads/' + GitHubBranchSchema.parse(branch);
    await this.assertPrivateMirror(mirror);
    GitHubShaSchema.parse(parent);
    const lease = await mkdtemp(join(this.root, 'git-index-'));
    const index = join(lease, 'index');
    const run = (args: string[], input?: string) =>
      this.run(['--git-dir=' + mirror, '--work-tree=' + lease, ...args], this.root, input, index);
    try {
      await run(['read-tree', parent]);
      for (const change of changes) {
        const path = CodePathSchema.parse(change.path);
        if (change.content === null) await run(['update-index', '--force-remove', '--', path]);
        else {
          const entry = (await run(['ls-tree', '-z', parent, '--', path])).toString();
          const mode = entry.startsWith('100755 ') ? '100755' : '100644';
          const blob = GitHubShaSchema.parse(
            (await run(['hash-object', '-w', '--stdin'], change.content)).toString().trim(),
          );
          await run(['update-index', '--add', '--cacheinfo', mode, blob, path]);
        }
      }
      const tree = GitHubShaSchema.parse((await run(['write-tree'])).toString().trim());
      const commit = GitHubShaSchema.parse(
        (
          await run(
            [
              '-c',
              'user.name=TapKit',
              '-c',
              'user.email=tapkit@localhost',
              'commit-tree',
              tree,
              '-p',
              parent,
              '-F',
              '-',
            ],
            message + '\n',
          )
        )
          .toString()
          .trim(),
      );
      guard();
      await run(['update-ref', ref, commit, parent]);
      return commit;
    } finally {
      const child = relative(this.root, lease);
      if (isAbsolute(child) || !/^git-index-[^/\\]+$/.test(child)) throw Error('PERMISSION_DENIED');
      await rm(lease, { recursive: true, force: true });
    }
  }
  async mirror(source: string, id: string) {
    const metadata = join(source, '.git');
    await codeCanonical(metadata, true);
    // Never clone against user configuration. Import object bytes without hardlinks and
    // only validated branch refs; source hooks/config/credentials/index are never copied.
    const mirror = join(this.root, id + '.git');
    await mkdir(this.root, { recursive: true });
    await this.run(['init', '--bare', '--quiet', '--template=', mirror]);
    const refs = new Map<string, string>();
    await codeCanonical(join(metadata, 'HEAD'));
    const head = (await readFile(join(metadata, 'HEAD'), 'utf8')).trim();
    let total = 0;
    const objects = async (from: string, to: string) => {
      await codeCanonical(from, true);
      await mkdir(to, { recursive: true });
      for (const item of await readdir(from, { withFileTypes: true })) {
        if (item.name === 'info') {
          const info = join(from, 'info');
          await codeCanonical(info, true);
          if ((await readdir(info)).some((name) => /alternates/i.test(name)))
            throw Error('PERMISSION_DENIED');
          continue;
        }
        if (
          !/^(?:[0-9a-f]{2}|pack|[0-9a-f]{38}|pack-[0-9a-f]{40}\.(?:pack|idx|rev))$/.test(item.name)
        )
          throw Error('PERMISSION_DENIED');
        const fromPath = join(from, item.name),
          toPath = join(to, item.name);
        if (item.isDirectory()) await objects(fromPath, toPath);
        else {
          const before = await codeCanonical(fromPath);
          total += before.size;
          if (total > 1024 * 1024 * 1024) throw Error('OUTPUT_LIMIT_REACHED');
          await copyFile(fromPath, toPath, constants.COPYFILE_EXCL);
          const after = await codeCanonical(fromPath);
          if (
            before.ino !== after.ino ||
            before.size !== after.size ||
            before.mtimeMs !== after.mtimeMs
          )
            throw Error('CONFLICT');
        }
      }
    };
    await objects(join(metadata, 'objects'), join(mirror, 'objects'));
    const parseRef = (ref: string, sha: string) => {
      if (
        !/^refs\/heads\/[a-zA-Z0-9_\u0080-\uffff][a-zA-Z0-9_./\-\u0080-\uffff]*$/.test(ref) ||
        ref.includes('..') ||
        ref.includes('//') ||
        ref.endsWith('/') ||
        !/^[0-9a-f]{40}$/.test(sha)
      )
        throw Error('PERMISSION_DENIED');
      refs.set(ref, sha);
    };
    try {
      await codeCanonical(join(metadata, 'packed-refs'));
      for (const line of (await readFile(join(metadata, 'packed-refs'), 'utf8')).split('\n')) {
        const m = /^([0-9a-f]{40}) (refs\/heads\/.+)$/.exec(line);
        if (m) parseRef(m[2]!, m[1]!);
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    const heads = async (at: string, prefix: string) => {
      await codeCanonical(at, true);
      for (const item of await readdir(at, { withFileTypes: true })) {
        if (item.isDirectory()) await heads(join(at, item.name), prefix + item.name + '/');
        else {
          await codeCanonical(join(at, item.name));
          parseRef(prefix + item.name, (await readFile(join(at, item.name), 'utf8')).trim());
        }
      }
    };
    await heads(join(metadata, 'refs', 'heads'), 'refs/heads/');
    for (const [ref, sha] of refs) await this.run(['--git-dir=' + mirror, 'update-ref', ref, sha]);
    const branch = head.startsWith('ref: ') ? head.slice(5) : null;
    const commit = branch ? refs.get(branch) : head;
    if (!commit || !/^[0-9a-f]{40}$/.test(commit)) throw Error('CONFLICT');
    if (branch) await this.run(['--git-dir=' + mirror, 'symbolic-ref', 'HEAD', branch]);
    else await writeFile(join(mirror, 'HEAD'), commit + '\n');
    let staged = false;
    try {
      const index = join(metadata, 'index');
      await codeCanonical(index);
      await copyFile(index, join(mirror, 'index'), constants.COPYFILE_EXCL);
      staged =
        (
          await this.run([
            '--git-dir=' + mirror,
            'diff-index',
            '--cached',
            '--name-only',
            '--no-ext-diff',
            '--no-textconv',
            commit,
            '--',
          ])
        ).length > 0;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    } finally {
      await unlink(join(mirror, 'index')).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== 'ENOENT') throw e;
      });
    }
    return {
      staged,
      mirror,
      branch: branch?.slice(11) ?? null,
      head: commit,
      branches: [...refs.keys()].map((r) => r.slice(11)),
    };
  }
  async snapshot(mirror: string, ref: string) {
    const commit = (
      await this.run(['--git-dir=' + mirror, 'rev-parse', '--verify', ref + '^{commit}'])
    )
      .toString()
      .trim();
    const entries = (await this.run(['--git-dir=' + mirror, 'ls-tree', '-rz', commit]))
      .toString('utf8')
      .split('\0')
      .filter(Boolean);
    if (entries.length > 1000) throw Error('OUTPUT_LIMIT_REACHED');
    const files: Record<string, string> = {},
      seen = new Set<string>();
    let size = 0;
    for (const entry of entries) {
      const m = /^(\d+) blob ([a-f0-9]{40})\t([\s\S]+)$/.exec(entry);
      if (!m) throw Error('FEATURE_NOT_AVAILABLE'); // submodules are never recursively checked out
      const path = m[3]!;
      if (!CodePathSchema.safeParse(path).success) continue;
      if (!/^100(644|755)$/.test(m[1]!)) throw Error('PERMISSION_DENIED');
      if (seen.has(path.toLowerCase())) throw Error('CONFLICT');
      seen.add(path.toLowerCase());
      const bytes = await this.run(['--git-dir=' + mirror, 'cat-file', 'blob', m[2]!]);
      size += bytes.length;
      if (size > 16 * 1024 * 1024 || bytes.length > 1024 * 1024)
        throw Error('OUTPUT_LIMIT_REACHED');
      if (bytes.includes(0)) throw Error('FEATURE_NOT_AVAILABLE');
      files[path] = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    return { commit, files };
  }
  async checkout(mirror: string, worktree: string, branch: string, ref: string) {
    const { commit, files } = await this.snapshot(mirror, ref);
    // Git registers the worktree without interpreting attributes/filters or checking out
    // executable project code. Its index/HEAD stay outside the execution workspace.
    await this.run([
      '--git-dir=' + mirror,
      'worktree',
      'add',
      '--no-checkout',
      '-b',
      branch,
      worktree,
      commit,
    ]);
    const pointer = await readFile(join(worktree, '.git'), 'utf8');
    const privateDir = pointer.trim().replace(/^gitdir: /, '');
    if (
      !resolve(privateDir)
        .toLowerCase()
        .startsWith(resolve(mirror).toLowerCase() + '\\')
    )
      throw Error('PERMISSION_DENIED');
    await this.run(['--git-dir=' + privateDir, '--work-tree=' + worktree, 'read-tree', commit]);
    return { commit, files, metadata: privateDir };
  }
}
