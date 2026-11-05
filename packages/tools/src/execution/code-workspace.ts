import { spawn } from 'node:child_process';
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  writeFile,
  unlink,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { CodePathSchema } from '@tapkit/contracts';

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

/** Trusted fixed-argument broker. No user configuration, shell, network, hooks or alternates. */
export class CodeGitBroker {
  constructor(
    readonly executable: string,
    readonly root: string,
  ) {}
  async run(args: string[], directory = this.root): Promise<Buffer> {
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
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let size = 0,
        failure = '';
      const out: Buffer[] = [];
      const timer = setTimeout(() => {
        failure = 'TIMEOUT';
        child.kill();
      }, 30000);
      for (const stream of [child.stdout, child.stderr])
        stream.on('data', (b: Buffer) => {
          size += b.length;
          if (size > 4 * 1024 * 1024) {
            failure = 'OUTPUT_LIMIT_REACHED';
            child.kill();
          } else if (stream === child.stdout) out.push(b);
        });
      child.on('error', () => {
        clearTimeout(timer);
        no(Error('FEATURE_NOT_AVAILABLE'));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (failure || code !== 0) no(Error(failure || 'CONFLICT'));
        else yes(Buffer.concat(out));
      });
    });
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
