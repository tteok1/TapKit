import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { NetworkPolicyService } from '@tapkit/network';
import { CodePathSchema, type RuntimeProfile } from '@tapkit/contracts';
import { codeCanonical, codeRead, codeHash, codeTree } from './code-workspace';
import { runtimePaths } from './index';

export class CodeEnvironmentError extends Error {}
export type DependencyAsset = {
  name: string;
  version: string;
  url: string;
  integrity: string;
  filename: string;
  license: string;
};
export type EnvironmentPlan = {
  profile: RuntimeProfile;
  assets: DependencyAsset[];
  python: { name: string; version: string; hashes: string[] }[];
  manifests: Record<string, string | null>;
};
const fail = (reason: string): never => {
  throw new CodeEnvironmentError(reason);
};
const digest = (algorithm: string, value: Uint8Array) =>
  createHash(algorithm).update(value).digest('hex');
const normalize = (s: string) => s.toLowerCase().replace(/[-_.]+/g, '-');
const NAME = /^(?:@[a-z0-9_.-]+\/)?[a-z0-9][a-z0-9_.-]*$/i;
export function registryUrl(value: string, kind: 'node' | 'python') {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !(kind === 'node'
      ? url.hostname === 'registry.npmjs.org'
      : ['pypi.org', 'files.pythonhosted.org'].includes(url.hostname))
  )
    fail('UNSUPPORTED_REGISTRY');
  if (/%(?:2e|2f|5c|00)/i.test(url.pathname) || url.pathname.includes('\\'))
    fail('UNSUPPORTED_REGISTRY');
  return url;
}
export function integrityParts(integrity: string) {
  const match = /^(sha512|sha256)-([A-Za-z0-9+/]+={0,2})$/.exec(integrity);
  if (!match) return fail('DEPENDENCY_HASH_REQUIRED');
  const bytes = Buffer.from(match[2]!, 'base64');
  if (bytes.length !== (match[1] === 'sha512' ? 64 : 32) || bytes.toString('base64') !== match[2])
    return fail('DEPENDENCY_HASH_REQUIRED');
  return { algorithm: match[1]!, hex: bytes.toString('hex') };
}
export function verifyDependency(asset: DependencyAsset, bytes: Uint8Array) {
  const { algorithm, hex } = integrityParts(asset.integrity);
  if (digest(algorithm, bytes) !== hex) fail('DEPENDENCY_HASH_MISMATCH');
}
export async function inspectCodeEnvironment(
  root: string,
  appRoot: string,
  runId: string,
  id: string,
  runtime: 'node' | 'python',
): Promise<EnvironmentPlan> {
  const names = [
    'package.json',
    'package-lock.json',
    'pyproject.toml',
    'requirements.lock',
    'requirements.txt',
  ];
  const manifests: Record<string, string | null> = {};
  for (const name of names) manifests[name] = await codeRead(root, name);
  const lock = JSON.parse(await readFile(join(appRoot, 'runtime-lock.json'), 'utf8'));
  const profile: RuntimeProfile = {
    id,
    runId,
    runtime,
    version: String(lock.runtimes[runtime].version),
    cwd: '.',
    lockHash: codeHash(JSON.stringify({ runtime, version: lock.runtimes[runtime], manifests }))!,
    state: 'detected',
    message: '',
    progress: [],
    commands: [],
    dependencyCount: 0,
    licenses: [],
    network: false,
  };
  const plan: EnvironmentPlan = { profile, assets: [], python: [], manifests };
  try {
    if (runtime === 'node') {
      if (
        !manifests['package.json'] &&
        !manifests['package-lock.json'] &&
        !(await codeTree(root)).some((p) => /\.[cm]?js$/.test(p))
      )
        fail('NODE_MANIFEST_REQUIRED');
      const pkg = JSON.parse(manifests['package.json'] ?? '{}');
      for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        if (pkg[group] && (typeof pkg[group] !== 'object' || Array.isArray(pkg[group])))
          fail('UNSUPPORTED_DEPENDENCY');
        for (const [name, version] of Object.entries(pkg[group] ?? {})) {
          if (
            !NAME.test(name) ||
            typeof version !== 'string' ||
            !/^[~^<>=*\d][\w.\s|~^<>=*+-]*$/.test(version)
          )
            fail('UNSUPPORTED_DEPENDENCY');
        }
      }
      if (
        !manifests['package-lock.json'] &&
        ['dependencies', 'devDependencies', 'optionalDependencies'].some(
          (g) => Object.keys(pkg[g] ?? {}).length,
        )
      )
        fail('NPM_V3_LOCK_REQUIRED');
      if (manifests['package-lock.json']) {
        const parsed = JSON.parse(manifests['package-lock.json']);
        if (
          parsed.lockfileVersion !== 3 ||
          !parsed.packages ||
          typeof parsed.packages !== 'object' ||
          Array.isArray(parsed.packages)
        )
          fail('NPM_V3_LOCK_REQUIRED');
        for (const [path, item] of Object.entries(parsed.packages) as [
          string,
          Record<string, unknown>,
        ][]) {
          if (!path) continue;
          if (
            !/^(?:node_modules\/(?:@[\w.-]+\/)?[\w.-]+)(?:\/node_modules\/(?:@[\w.-]+\/)?[\w.-]+)*$/.test(
              path,
            ) ||
            path.split('/').some((x) => x === '..' || x === '.') ||
            item.link
          )
            fail('UNSUPPORTED_DEPENDENCY');
          if (
            typeof item.resolved !== 'string' ||
            typeof item.integrity !== 'string' ||
            typeof item.version !== 'string'
          )
            fail('DEPENDENCY_HASH_REQUIRED');
          const url = registryUrl(item.resolved as string, 'node');
          if (!url.pathname.endsWith('.tgz')) fail('UNSUPPORTED_DEPENDENCY');
          integrityParts(item.integrity as string);
          // npm ci only installs compatible optional packages. Keep the lock portable
          // while fetching just the tarballs required by this execution platform.
          if (
            item.optional === true &&
            (!npmPlatformMatches(item.os, process.platform) ||
              !npmPlatformMatches(item.cpu, process.arch))
          )
            continue;
          plan.assets.push({
            name: path,
            version: item.version as string,
            url: url.href,
            integrity: item.integrity as string,
            filename: 'package.tgz',
            license: typeof item.license === 'string' ? item.license.slice(0, 240) : '许可未声明',
          });
        }
      }
      profile.commands = [{ name: 'Node 测试', argv: ['--test', '--test-isolation=none'] }];
      for (const key of ['test', 'lint', 'check', 'build', 'start'])
        if (typeof pkg.scripts?.[key] === 'string')
          profile.commands.push({
            name: key,
            argv: [
              'npm',
              'run',
              key,
              ...(/^node\s+--test(?:\s|$)/.test(pkg.scripts[key])
                ? ['--', '--test-isolation=none']
                : []),
            ],
          });
    } else {
      const requirements = manifests['requirements.lock'] ?? manifests['requirements.txt'];
      if (
        !requirements &&
        !manifests['pyproject.toml'] &&
        !(await codeTree(root)).some((p) => p.endsWith('.py'))
      )
        fail('PYTHON_MANIFEST_REQUIRED');
      if (!requirements && !manifests['pyproject.toml']) {
        // A plain Python source project needs no package manager or user installation.
        profile.message = '使用随应用提供的 Python；项目未声明第三方依赖。';
      }
      if (
        !requirements &&
        manifests['pyproject.toml'] &&
        /(?:dependencies\s*=|\[build-system\])/.test(manifests['pyproject.toml'])
      )
        fail('PYTHON_PINNED_REQUIREMENTS_REQUIRED');
      for (const line of (requirements ?? '').replace(/\\\r?\n/g, ' ').split(/\r?\n/)) {
        const text = line.trim();
        if (!text || text.startsWith('#')) continue;
        const match =
          /^([A-Za-z0-9][A-Za-z0-9_.-]*)==([0-9][A-Za-z0-9.!+-]*)(\s+--hash=sha256:[a-f0-9]{64})*$/.exec(
            text,
          );
        if (!match) fail('PYTHON_PINNED_REQUIREMENTS_REQUIRED');
        plan.python.push({
          name: normalize(match![1]!),
          version: match![2]!,
          hashes: [...text.matchAll(/--hash=sha256:([a-f0-9]{64})/g)].map((m) => m[1]!),
        });
      }
      if (new Set(plan.python.map((p) => p.name)).size !== plan.python.length)
        fail('UNSUPPORTED_DEPENDENCY');
      profile.commands = [{ name: 'Python 测试', argv: ['-m', 'unittest', 'discover', '-v'] }];
    }
    if (plan.assets.length + plan.python.length > 200) fail('DEPENDENCY_LIMIT');
    profile.dependencyCount = plan.assets.length + plan.python.length;
    profile.licenses = [...new Set(plan.assets.map((a) => a.license))];
  } catch (error) {
    profile.state = 'unsupported';
    profile.message =
      error instanceof CodeEnvironmentError ? error.message : 'INVALID_PROJECT_MANIFEST';
  }
  return plan;
}

function npmPlatformMatches(raw: unknown, platform: string) {
  if (!Array.isArray(raw) || !raw.every((value) => typeof value === 'string')) return true;
  return (
    !raw.includes('!' + platform) &&
    (raw.includes(platform) || raw.includes('any') || raw.every((value) => value.startsWith('!')))
  );
}

/** Downloads bytes only. It never starts npm/pip or executes a package on the host. */
export class DependencyBroker {
  constructor(
    readonly cache: string,
    readonly network = new NetworkPolicyService(),
  ) {}
  private assetPath(asset: DependencyAsset) {
    return join(this.cache, 'content', codeHash(asset.integrity)!);
  }
  async seed(asset: DependencyAsset, bytes: Uint8Array) {
    verifyDependency(asset, bytes);
    await mkdir(join(this.cache, 'content'), { recursive: true });
    await codeCanonical(this.cache, true);
    await codeCanonical(join(this.cache, 'content'), true);
    const path = this.assetPath(asset);
    try {
      await writeFile(path, bytes, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    await this.cached(asset);
  }
  private async cached(asset: DependencyAsset) {
    const path = this.assetPath(asset),
      stat = await codeCanonical(path);
    if (stat.nlink !== 1 || stat.size > 25 * 1024 ** 2) fail('DEPENDENCY_LIMIT');
    const bytes = await readFile(path);
    verifyDependency(asset, bytes);
    return bytes;
  }
  private async download(
    url: string,
    runtime: 'node' | 'python',
    signal?: AbortSignal,
    limit = 25 * 1024 ** 2,
  ) {
    registryUrl(url, runtime);
    const reply = await this.network.request(url, {
      ...(signal ? { signal } : {}),
      limit,
      allowUrl: (value) => {
        registryUrl(value, runtime);
      },
    });
    if (reply.status !== 200) fail('DEPENDENCY_DOWNLOAD_FAILED');
    return reply.bytes;
  }
  async prepare(
    plan: EnvironmentPlan,
    input: string,
    download: boolean,
    progress: (message: string) => void,
    signal?: AbortSignal,
  ) {
    if (plan.profile.state === 'unsupported') fail(plan.profile.message);
    await mkdir(this.cache, { recursive: true });
    await codeCanonical(this.cache, true);
    const resolutionPath = join(this.cache, 'python-' + plan.profile.lockHash + '.json');
    if (plan.python.length) {
      try {
        const stat = await codeCanonical(resolutionPath);
        if (stat.nlink !== 1 || stat.size > 2 * 1024 ** 2) fail('DEPENDENCY_LIMIT');
        const raw = JSON.parse(await readFile(resolutionPath, 'utf8'));
        if (!Array.isArray(raw) || raw.length !== plan.python.length)
          fail('DEPENDENCY_HASH_MISMATCH');
        plan.assets = raw as DependencyAsset[];
        for (const asset of plan.assets) {
          const pin = plan.python.find((p) => p.name === asset.name && p.version === asset.version);
          if (!pin || !/^sha256-/.test(asset.integrity)) fail('DEPENDENCY_HASH_MISMATCH');
          registryUrl(asset.url, 'python');
          const hash = integrityParts(asset.integrity).hex;
          if (pin!.hashes.length && !pin!.hashes.includes(hash)) fail('DEPENDENCY_HASH_MISMATCH');
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        if (!download) fail('DEPENDENCY_CACHE_MISSING');
        plan.assets = [];
        for (const pin of plan.python) {
          progress('解析 Python 依赖：' + pin.name + '==' + pin.version);
          const metadata = JSON.parse(
            (
              await this.download(
                'https://pypi.org/pypi/' + pin.name + '/' + pin.version + '/json',
                'python',
                signal,
                2 * 1024 ** 2,
              )
            ).toString('utf8'),
          );
          if (
            typeof metadata.info?.name !== 'string' ||
            normalize(metadata.info.name) !== pin.name ||
            metadata.info.version !== pin.version ||
            !Array.isArray(metadata.urls)
          )
            fail('DEPENDENCY_HASH_MISMATCH');
          const choices = (metadata.urls as Record<string, unknown>[]).filter(
            (item) =>
              typeof item.filename === 'string' &&
              normalize(item.filename.split('-')[0]!) === pin.name &&
              item.filename.split('-')[1] === pin.version &&
              /-(?:py3|py2.py3)-none-any\.whl$|-cp313-(?:cp313|abi3)-win_amd64\.whl$/.test(
                item.filename,
              ),
          );
          const item = choices.find(
            (item) =>
              typeof item.url === 'string' &&
              typeof (item.digests as Record<string, unknown>)?.sha256 === 'string' &&
              (!pin.hashes.length ||
                pin.hashes.includes(String((item.digests as Record<string, unknown>).sha256))),
          );
          if (!item) fail('PYTHON_WHEEL_UNSUPPORTED');
          for (const dep of metadata.info?.requires_dist ?? []) {
            if (typeof dep !== 'string') fail('PYTHON_PINNED_REQUIREMENTS_REQUIRED');
            if (/extra\s*==/.test(dep)) continue;
            const name = /^[A-Za-z0-9_.-]+/.exec(dep)?.[0];
            if (!name || !plan.python.some((p) => p.name === normalize(name)))
              fail('PYTHON_TRANSITIVE_PIN_REQUIRED');
          }
          const hash = String((item!.digests as Record<string, unknown>).sha256);
          if (!/^[a-f0-9]{64}$/.test(hash)) fail('DEPENDENCY_HASH_MISMATCH');
          plan.assets.push({
            name: pin.name,
            version: pin.version,
            filename: String(item!.filename),
            url: registryUrl(String(item!.url), 'python').href,
            integrity: 'sha256-' + Buffer.from(hash, 'hex').toString('base64'),
            license: String(
              metadata.info?.license_expression ?? metadata.info?.license ?? '许可未声明',
            ).slice(0, 240),
          });
        }
        await writeFile(resolutionPath, JSON.stringify(plan.assets), { flag: 'wx' });
      }
    }
    let total = 0;
    for (const [index, asset] of plan.assets.entries()) {
      signal?.throwIfAborted();
      progress(`${index + 1}/${plan.assets.length} 校验缓存：${asset.name}`);
      let bytes: Buffer;
      try {
        bytes = await this.cached(asset);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        if (!download) fail('DEPENDENCY_CACHE_MISSING');
        progress(`${index + 1}/${plan.assets.length} 下载：${asset.name}`);
        bytes = await this.download(asset.url, plan.profile.runtime, signal);
        await this.seed(asset, bytes);
      }
      total += bytes.length;
      if (total > 150 * 1024 ** 2) fail('DEPENDENCY_LIMIT');
      let path: string;
      if (plan.profile.runtime === 'node') {
        const { algorithm, hex } = integrityParts(asset.integrity);
        path = join(
          input,
          'npm-cache/_cacache/content-v2',
          algorithm,
          hex.slice(0, 2),
          hex.slice(2, 4),
          hex.slice(4),
        );
      } else {
        if (
          !/^[A-Za-z0-9_.+-]+\.whl$/.test(asset.filename) ||
          !CodePathSchema.safeParse(asset.filename).success
        )
          fail('PYTHON_WHEEL_UNSUPPORTED');
        path = join(input, 'wheels', asset.filename);
      }
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes, { flag: 'wx' });
    }
    plan.profile.licenses = [...new Set(plan.assets.map((a) => a.license))];
    await writeFile(join(input, 'empty-user.npmrc'), '');
    await writeFile(join(input, 'empty-global.npmrc'), '');
    return plan;
  }
}

export async function codeRuntimeCommand(
  appRoot: string,
  runtime: 'node' | 'python',
  argv: string[],
  input: string,
  workspace: string,
  environmentId: string,
  processId: string,
) {
  const paths = await runtimePaths(appRoot, runtime);
  if (runtime === 'node') {
    const flags = ['--preserve-symlinks', '--preserve-symlinks-main'];
    if (argv[0] === 'npm')
      return {
        ...paths,
        args: [
          ...flags,
          join(paths.runtimeRoot, 'node_modules/npm/bin/npm-cli.js'),
          '--offline',
          '--audit=false',
          '--fund=false',
          '--update-notifier=false',
          '--logs-max=0',
          '--script-shell=' + join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/cmd.exe'),
          '--userconfig=' + join(input, 'empty-user.npmrc'),
          '--globalconfig=' + join(input, 'empty-global.npmrc'),
          '--cache=' + join(input, 'npm-cache'),
          ...argv.slice(1),
        ],
      };
    return { ...paths, args: [...flags, ...(argv[0] === 'node' ? argv.slice(1) : argv)] };
  }
  const argvPath = join(input, 'argv-' + processId + '.json');
  await writeFile(argvPath, JSON.stringify(argv[0] === 'python' ? argv.slice(1) : argv), {
    flag: 'wx',
  });
  return {
    ...paths,
    args: [
      '-u',
      join(input, 'python-launch.py'),
      argvPath,
      join(workspace, '.tapkit-runtime', environmentId, 'site'),
    ],
  };
}
