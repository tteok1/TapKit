import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';

// Keep the user's complete clipboard in memory, never in test logs or files.
// A dedicated STA retains native objects (including images) until restoration.
export async function protectClipboard() {
  if (process.platform !== 'win32') throw new Error('Windows clipboard fixture required');
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$original = [System.Windows.Forms.Clipboard]::GetDataObject()
$snapshot = [System.Windows.Forms.DataObject]::new()
if ($null -ne $original) {
  foreach ($format in $original.GetFormats($false)) {
    $value = $original.GetData($format, $false)
    if ($null -eq $value) { throw 'Clipboard format could not be preserved' }
    $snapshot.SetData($format, $false, $value)
  }
}
[Console]::WriteLine('CLIPBOARD_SAVED')
try { [Console]::ReadLine() | Out-Null }
finally {
  if ($null -eq $original) { [System.Windows.Forms.Clipboard]::Clear() }
  else { [System.Windows.Forms.Clipboard]::SetDataObject($snapshot, $true, 10, 100) }
  [Console]::WriteLine('CLIPBOARD_RESTORED')
}
`;
  const child: ChildProcessWithoutNullStreams = spawn(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-STA',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ],
    { windowsHide: true, stdio: 'pipe' },
  );
  let output = '',
    errors = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    errors += chunk;
  });
  const exit = once(child, 'exit');
  await Promise.race([
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Clipboard backup timed out')), 15_000);
      child.stdout.on('data', () => {
        if (output.includes('CLIPBOARD_SAVED')) {
          clearTimeout(timer);
          resolve();
        }
      });
      void exit.then(() => {
        clearTimeout(timer);
        if (!output.includes('CLIPBOARD_SAVED'))
          reject(new Error('Clipboard backup failed: ' + errors));
      });
    }),
  ]);
  return async () => {
    child.stdin.end('restore\n');
    const [code] = await exit;
    if (code !== 0 || !output.includes('CLIPBOARD_RESTORED'))
      throw new Error('Clipboard restoration failed: ' + errors);
  };
}
