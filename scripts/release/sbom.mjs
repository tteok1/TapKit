import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const readJSON = async (file) => JSON.parse(await readFile(file, 'utf8'));

export async function fileDigest(path) {
  const digest = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    digest.update(chunk);
    bytes += chunk.length;
  }
  return { bytes, sha256: digest.digest('hex') };
}

const source = (url, type = 'distribution') => ({ type, url });
const runtimeNames = {
  node: 'Node.js',
  python: 'CPython',
  git: 'MinGit',
  libreoffice: 'LibreOffice',
};
const reportName = 'licenses/npm-bundled.json';
export const bundleLicenseReports = [
  ['payload', 'packages/core/dist/' + reportName],
  ['payload', 'packages/retrieval/dist/' + reportName],
  ['payload', 'node_modules/@tapkit/storage/dist/' + reportName],
  ...['main', 'preload', 'renderer'].map((part) => ['ui', 'out/' + part + '/' + reportName]),
];

function component(type, name, version, license, refs, hash, ecosystem = 'generic') {
  if (!name || !version) throw Error('A distributed component has no name or version.');
  const identity =
    'pkg:' +
    ecosystem +
    '/' +
    name.split('/').map(encodeURIComponent).join('/') +
    '@' +
    encodeURIComponent(version);
  return {
    'bom-ref': identity,
    type,
    name,
    version,
    purl: identity,
    ...(license && { licenses: [{ license: { name: license } }] }),
    ...(refs?.length && { externalReferences: refs }),
    ...(hash && { hashes: [{ alg: 'SHA-256', content: hash }] }),
  };
}

async function installedPackages(directory, location = 'node_modules') {
  const children = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return [];
  });
  const found = [];
  for (const child of children) {
    if (child.name.startsWith('.')) continue;
    if (!child.isDirectory()) throw Error('Unexpected packaged dependency entry.');
    const path = join(directory, child.name);
    const base = location + '/' + child.name;
    if (child.name.startsWith('@')) {
      found.push(...(await installedPackages(path, base)));
      continue;
    }
    const pkg = await readJSON(join(path, 'package.json'));
    if (!pkg.name?.startsWith('@tapkit/')) found.push({ pkg, location: base });
    found.push(...(await installedPackages(join(path, 'node_modules'), base + '/node_modules')));
  }
  return found;
}

export async function collectInstallerComponents({ payload, electronVersion, reportRoots }) {
  const [lock, font, model, wheels] = await Promise.all(
    [
      'runtime-lock.json',
      'export-font-lock.json',
      'embedding-model-lock.json',
      'python-wheels.lock.json',
    ].map((name) => readJSON(join(payload, name))),
  );
  const components = new Map();
  function add(item, location) {
    const existing = components.get(item['bom-ref']);
    if (!existing) {
      item.properties = [];
      components.set(item['bom-ref'], item);
    } else if (!existing.licenses && item.licenses) {
      existing.licenses = item.licenses;
    }
    (existing ?? item).properties.push({ name: 'tapkit:location', value: location });
  }
  function addNpm(name, version, identifier, location) {
    add(
      component(
        'library',
        name,
        version,
        identifier,
        [source('https://registry.npmjs.org/' + encodeURIComponent(name) + '/' + version)],
        undefined,
        'npm',
      ),
      location,
    );
  }
  addNpm('electron', electronVersion, 'MIT', 'Windows desktop executable and runtime');
  for (const { pkg, location } of await installedPackages(join(payload, 'node_modules'))) {
    let license = typeof pkg.license === 'string' ? pkg.license : undefined;
    if (!license && pkg.name === 'buffers' && pkg.version === '0.1.1') {
      // The published tarball omits metadata; its code matches the reviewed Debian source.
      const upstream = await fileDigest(join(payload, location, 'index.js'));
      if (upstream.sha256 !== '97801e296ba5f3c32242f647e1daac5917e300367fed7935ab1e62f40adb1b8a')
        throw Error('Packaged buffers source does not match the reviewed version.');
      license = 'MIT';
    }
    if (!license && pkg.name === 'khroma' && pkg.version === '2.1.0') {
      // This version omits the package.json field but ships its MIT notice.
      const notice = await fileDigest(join(payload, location, 'license'));
      if (notice.sha256 !== '66b333b0f66759a0b710459e03f7029abe17f4358114a128d2c972e642961b49')
        throw Error('Packaged khroma license does not match the reviewed notice.');
      license = 'MIT';
    }
    addNpm(pkg.name, pkg.version, license, location);
  }
  for (const [area, path] of reportRoots ? bundleLicenseReports : []) {
    for (const { name, version, identifier } of await readJSON(join(reportRoots[area], path)))
      addNpm(name, version, identifier, area + '/' + path);
  }
  for (const [key, name] of Object.entries(runtimeNames)) {
    const runtime = lock.runtimes[key];
    const location = '.runtime/' + key + '/' + runtime.directory;
    await access(join(payload, location));
    add(
      component('application', name, runtime.version, runtime.license, [
        source(runtime.url),
        source(runtime.licenseUrl, 'license'),
      ]),
      location,
    );
  }
  const pythonPackages = '.runtime/python/' + lock.runtimes.python.directory + '/Lib/site-packages';
  const wheelNames = (await readdir(join(payload, pythonPackages))).filter((file) =>
    file.endsWith('.dist-info'),
  );
  const pinned = new Map(
    wheels.wheels.map((wheel) => [
      wheel.name.toLowerCase().replaceAll('-', '_') + '-' + wheel.version + '.dist-info',
      wheel,
    ]),
  );
  for (const folder of wheelNames) {
    const wheel = pinned.get(folder.toLowerCase());
    if (!wheel) throw Error('Packaged Python wheel is missing from the wheel lock.');
    add(
      component(
        'library',
        wheel.name,
        wheel.version,
        wheel.license,
        [source(wheel.url)],
        undefined,
        'pypi',
      ),
      pythonPackages + '/' + folder,
    );
  }
  if (wheelNames.length !== pinned.size)
    throw Error('Packaged Python wheel set does not match the lock.');
  const fontPath = 'resources/fonts/NotoSansCJKsc-Regular.otf';
  const fontFile = font.files['NotoSansCJKsc-Regular.otf'];
  const modelFile = 'onnx/model_quantized.onnx';
  const modelPath = 'packages/core/dist/models/' + model.directory + '/' + modelFile;
  for (const [path, expected] of [
    [fontPath, fontFile.sha256],
    [modelPath, model.files[modelFile]],
  ])
    if ((await fileDigest(join(payload, path))).sha256 !== expected)
      throw Error('Packaged font or model does not match the lock.');
  add(
    component(
      'data',
      font.family,
      font.version,
      'OFL-1.1',
      [source(fontFile.source)],
      fontFile.sha256,
    ),
    fontPath,
  );
  add(
    component(
      'machine-learning-model',
      model.id,
      model.revision,
      model.license,
      [
        source('https://huggingface.co/' + model.id + '/tree/' + model.revision),
        source('https://huggingface.co/' + model.baseModel, 'website'),
      ],
      model.files[modelFile],
    ),
    modelPath,
  );
  const helperPath = 'resources/runtime/helper/tapkit-windows-helper.exe';
  const cargo = await readFile(join(payload, 'native/windows-helper/Cargo.toml'), 'utf8');
  const helperVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargo)?.[1];
  add(
    component(
      'application',
      'tapkit-windows-helper',
      helperVersion,
      'MIT',
      [],
      (await fileDigest(join(payload, helperPath))).sha256,
    ),
    helperPath,
  );
  return [...components.values()].sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref'], 'en'));
}

export function installerSbom(version, installer, components) {
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    version: 1,
    metadata: {
      component: component('application', 'TapKit', version, 'MIT', [], installer.sha256),
    },
    components,
  };
}
