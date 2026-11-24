import { cp, mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { root } from './lib.mjs';

export async function materializeGraph(destination, { copySources = true } = {}) {
  // Materialize the exact installed production graph without absolute junctions or a dependency on this checkout.
  const installed = new Map(),
    first = new Map(),
    dependencies = [];
  async function packageRoot(name, from) {
    let at = from;
    while (true) {
      const candidate = join(at, 'node_modules', name);
      try {
        const actual = await realpath(candidate);
        const manifest = JSON.parse(await readFile(join(actual, 'package.json'), 'utf8'));
        if (manifest.name === name) return actual;
      } catch {}
      const parent = dirname(at);
      if (parent === at) throw Error('Missing installed dependency ' + name);
      at = parent;
    }
  }
  async function install(name, sourceParent, parentTarget = destination) {
    const source = await packageRoot(name, sourceParent);
    let shadowed = false;
    for (let at = parentTarget; at.startsWith(destination); at = dirname(at)) {
      const visible = installed.get(join(at, 'node_modules', name));
      if (visible === source) return;
      if (visible) {
        shadowed = true;
        break;
      }
    }
    let target =
      shadowed || (first.has(name) && first.get(name).source !== source)
        ? join(parentTarget, 'node_modules', name)
        : join(destination, 'node_modules', name);
    if (installed.get(target) === source) return;
    if (installed.has(target)) throw Error('Dependency collision ' + name);
    if (!first.has(name)) first.set(name, { source, target });
    installed.set(target, source);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, {
      recursive: true,
      errorOnExist: true,
      force: false,
      filter: (path) =>
        path === source || !relative(source, path).split(sep).includes('node_modules'),
    });
    const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
    dependencies.push({
      name,
      version: manifest.version,
      path: relative(destination, target).replaceAll('\\', '/'),
    });
    for (const child of Object.keys(manifest.dependencies ?? {}))
      await install(child, source, target);
    for (const child of Object.keys(manifest.optionalDependencies ?? {})) {
      try {
        await packageRoot(child, source);
      } catch {
        continue;
      }
      await install(child, source, target);
    }
  }
  const workspaceAliases = [];
  for (const name of (await readdir(join(root, 'packages'))).sort()) {
    const folder = join(root, 'packages', name),
      manifest = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
    // Workspace packages contain the same frozen sources and their compiled assets.
    const target = join(destination, 'node_modules', manifest.name);
    await mkdir(dirname(target), { recursive: true });
    if (copySources)
      await cp(folder, target, {
        recursive: true,
        filter: (path) =>
          path === folder || !relative(folder, path).split(sep).includes('node_modules'),
      });
    if (!copySources) {
      await mkdir(target, { recursive: true });
      await cp(join(folder, 'package.json'), join(target, 'package.json'));
      if (name === 'storage')
        await cp(join(folder, 'dist'), join(target, 'dist'), { recursive: true });
    }
    installed.set(target, await realpath(folder));
    installed.set(join(destination, 'packages', name), await realpath(folder));
    workspaceAliases.push({ find: manifest.name, path: 'packages/' + name + '/src/index.ts' });
    first.set(manifest.name, { source: await realpath(folder), target });
  }
  const seeds = ['vitest', 'vite'].map((name) => ({
    name,
    sourceParent: root,
    parentTarget: destination,
  }));
  for (const name of (await readdir(join(root, 'packages'))).sort()) {
    const folder = join(root, 'packages', name),
      manifest = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
    for (const [dep, version] of Object.entries(manifest.dependencies ?? {}))
      if (version !== 'workspace:*')
        seeds.push({
          name: dep,
          sourceParent: folder,
          parentTarget: join(destination, 'node_modules', manifest.name),
        });
    for (const [dep, version] of Object.entries(manifest.dependencies ?? {}))
      if (version !== 'workspace:*')
        seeds.push({
          name: dep,
          sourceParent: folder,
          parentTarget: join(destination, 'packages', name),
        });
  }
  for (const seed of seeds)
    if (!first.has(seed.name))
      first.set(seed.name, {
        source: await packageRoot(seed.name, seed.sourceParent),
        target: join(destination, 'node_modules', seed.name),
      });
  for (const seed of seeds) await install(seed.name, seed.sourceParent, seed.parentTarget);
  for (const [target, source] of installed) {
    const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
    for (const name of new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ])) {
      let expected;
      try {
        expected = await packageRoot(name, source);
      } catch (error) {
        if (name in (manifest.optionalDependencies ?? {})) continue;
        throw error;
      }
      const actual = await packageRoot(name, target);
      if (!actual.startsWith(destination + sep)) throw Error('Dependency escaped snapshot');
      const expectedVersion = JSON.parse(
        await readFile(join(expected, 'package.json'), 'utf8'),
      ).version;
      if (
        JSON.parse(await readFile(join(actual, 'package.json'), 'utf8')).version !== expectedVersion
      )
        throw Error('Materialized dependency version mismatch: ' + name);
    }
  }
  return { dependencies, workspaceAliases };
}
