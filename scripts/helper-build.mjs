import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { root, runtimeExe, runtimeLock, run, isMain, lockedEnv } from './lib.mjs';
import { prepareRuntime } from './runtime-fetch.mjs';

export async function helperToolchain() {
  for (const name of ['rust', 'windowsSdk', 'msvcCrt', 'msvcImports']) await prepareRuntime(name);
  const distribution = join(root, '.runtime/rust', runtimeLock.runtimes.rust.directory);
  const sysroot = join(distribution, 'rustc');
  const triple = 'x86_64-pc-windows-msvc';
  await cp(
    join(distribution, 'rust-std-' + triple, 'lib/rustlib', triple, 'lib'),
    join(sysroot, 'lib/rustlib', triple, 'lib'),
    { recursive: true, force: false },
  );
  return {
    cargo: join(distribution, 'cargo/bin/cargo.exe'),
    env: lockedEnv({
      CARGO_HOME: join(root, '.cache/cargo'),
      CARGO_TARGET_DIR: join(root, '.cache/helper-target'),
      RUSTC: runtimeExe('rust'),
      CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER: join(
        sysroot,
        'lib/rustlib',
        triple,
        'bin/rust-lld.exe',
      ),
      LIB: [
        join(root, '.runtime/windowsSdk/c/um/x64'),
        join(root, '.runtime/windowsSdk/c/ucrt/x64'),
        dirname(runtimeExe('msvcCrt')),
        dirname(runtimeExe('msvcImports')),
      ].join(';'),
    }),
  };
}

export async function buildHelper() {
  const toolchain = await helperToolchain();
  // Target-specific static CRT keeps the installed helper independent of a system VC redistributable.
  run(
    toolchain.cargo,
    [
      'build',
      '--locked',
      '--release',
      '--target',
      'x86_64-pc-windows-msvc',
      '--manifest-path',
      'native/windows-helper/Cargo.toml',
    ],
    {
      env: {
        ...toolchain.env,
        CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS: '-C target-feature=+crt-static',
      },
    },
  );
  await mkdir(join(root, 'resources/runtime/helper'), { recursive: true });
  await cp(
    join(root, '.cache/helper-target/x86_64-pc-windows-msvc/release/tapkit-windows-helper.exe'),
    join(root, 'resources/runtime/helper/tapkit-windows-helper.exe'),
  );
  console.log('Built Windows helper from Cargo.lock with locked SDK/CRT');
}
if (isMain(import.meta.url)) await buildHelper();
