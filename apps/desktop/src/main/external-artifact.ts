import {
  mkdir,
  lstat,
  realpath,
  writeFile,
  readdir,
  readFile,
  unlink,
  rmdir,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ArtifactAccessSchema, type ArtifactAccess, type FileView } from '@tapkit/contracts';

const documents = new Set([
  'pdf',
  'docx',
  'doc',
  'docm',
  'xlsx',
  'xls',
  'xlsm',
  'pptx',
  'ppt',
  'pptm',
  'csv',
  'tsv',
  'txt',
  'md',
  'markdown',
  'json',
  'yaml',
  'yml',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
  'avif',
  'mp3',
  'wav',
  'm4a',
  'ogg',
  'flac',
  'mp4',
  'webm',
  'mov',
  'avi',
  'zip',
]);
const text = new Set([
  'html',
  'htm',
  'svg',
  'xml',
  'js',
  'ts',
  'jsx',
  'tsx',
  'py',
  'java',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'rs',
  'go',
  'css',
  'sql',
  'sh',
  'ps1',
  'bat',
  'cmd',
  'rb',
  'php',
  'swift',
  'kt',
  'toml',
  'ini',
  'log',
  'vue',
  'svelte',
  'scss',
  'conf',
]);
export function externalCopyExtension(extension: string) {
  const ext = extension.toLowerCase();
  if (documents.has(ext)) return ext;
  // Script/markup sources are intentionally opened as text copies. Never
  // ask ShellExecute to run an attachment with an executable association.
  if (text.has(ext)) return 'txt';
  throw new Error('FORMAT_UNSUPPORTED');
}
/** Host-owned, fixed-version copy; the renderer supplies no filesystem path. */
export class ExternalArtifact {
  readonly base: string;
  readonly dataDir: string;
  constructor(
    dataDir: string,
    private readonly metadata: (access: ArtifactAccess) => Promise<FileView>,
    private readonly exportFile: (access: ArtifactAccess, path: string) => Promise<void>,
    private readonly openPath: (path: string) => Promise<string>,
    private readonly alive: () => boolean,
  ) {
    this.dataDir = resolve(dataDir);
    this.base = resolve(dataDir, 'tmp/external-preview');
  }
  private async prepare() {
    for (const path of [this.dataDir, resolve(this.dataDir, 'tmp'), this.base]) {
      if (path !== this.dataDir)
        try {
          await mkdir(path);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
      const info = await lstat(path);
      if (
        !info.isDirectory() ||
        info.isSymbolicLink() ||
        (await realpath(path)).toLowerCase() !== path.toLowerCase()
      )
        throw new Error('PERMISSION_DENIED');
    }
  }
  async open(raw: unknown) {
    const access = ArtifactAccessSchema.parse(raw);
    if (!this.alive()) throw new Error('PERMISSION_DENIED');
    const file = await this.metadata(access),
      extension = externalCopyExtension(file.version.extension);
    await this.prepare();
    const directory = join(this.base, randomUUID());
    await mkdir(directory);
    const filename = 'document.' + extension,
      path = join(directory, filename);
    await writeFile(
      join(directory, 'copy.json'),
      JSON.stringify({ schemaVersion: 1, createdAt: Date.now(), filename }),
      { flag: 'wx' },
    );
    try {
      await this.exportFile(access, path);
      await this.metadata(access);
      if (
        !this.alive() ||
        (await lstat(path)).isSymbolicLink() ||
        (await realpath(path)).toLowerCase() !== path.toLowerCase()
      )
        throw new Error('PERMISSION_DENIED');
      const error = await this.openPath(path);
      if (error) throw new Error('IO_ERROR');
    } catch (error) {
      await this.erase(directory, filename);
      throw error;
    }
  }
  private async erase(directory: string, filename: string) {
    if (
      (await lstat(directory)).isSymbolicLink() ||
      (await realpath(directory)).toLowerCase() !== directory.toLowerCase()
    )
      return;
    // Only two Host-created direct files may be removed. No recursive delete,
    // no caller-supplied filenames and no traversal of unknown children.
    for (const name of [filename, 'copy.json']) {
      const path = join(directory, name);
      try {
        const stat = await lstat(path);
        if (stat.isFile() && !stat.isSymbolicLink()) await unlink(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return;
      }
    }
    await rmdir(directory).catch(() => {});
  }
  async recover(now = Date.now()) {
    await this.prepare();
    for (const name of await readdir(this.base)) {
      if (!/^[a-f0-9-]{36}$/.test(name)) continue;
      const directory = join(this.base, name);
      try {
        if (
          !(await lstat(directory)).isDirectory() ||
          (await lstat(directory)).isSymbolicLink() ||
          (await realpath(directory)).toLowerCase() !== directory.toLowerCase()
        )
          continue;
        const marker = join(directory, 'copy.json');
        const markerStat = await lstat(marker);
        if (
          !markerStat.isFile() ||
          markerStat.isSymbolicLink() ||
          markerStat.size > 4096 ||
          (await realpath(marker)).toLowerCase() !== marker.toLowerCase()
        )
          continue;
        const value = JSON.parse(await readFile(marker, 'utf8'));
        if (
          value.schemaVersion === 1 &&
          Number.isSafeInteger(value.createdAt) &&
          value.createdAt < now - 86400000 &&
          /^document\.[a-z0-9]+$/.test(value.filename) &&
          externalCopyExtension(value.filename.slice(9)) === value.filename.slice(9)
        )
          await this.erase(directory, value.filename);
      } catch {
        /* Unknown or locked copies stay untouched; retry on the next launch. */
      }
    }
  }
}
