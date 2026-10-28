param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$tapkitRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$tapkitTestRoot = [IO.Path]::GetFullPath((Join-Path $tapkitRoot '.test-data'))
$tapkitSourceInfo = Get-Content -LiteralPath (Join-Path $tapkitRoot 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json') -Raw | ConvertFrom-Json
$tapkitLaunchInfo = Get-Content -LiteralPath (Join-Path $tapkitRoot 'docs/evidence/P06-03/live-zhipu-2026-10-28/launch.json') -Raw | ConvertFrom-Json
$tapkitSource = [IO.Path]::GetFullPath($tapkitSourceInfo.dataDir)
$tapkitProfile = [IO.Path]::GetFullPath($tapkitLaunchInfo.directory)
if ([IO.Path]::GetDirectoryName($tapkitSource) -ne $tapkitTestRoot -or [IO.Path]::GetFileName($tapkitSource) -notlike 'P01-02-app-zhipu-chat-*' -or [IO.Path]::GetDirectoryName($tapkitProfile) -ne $tapkitTestRoot -or [IO.Path]::GetFileName($tapkitProfile) -notlike 'P06-live-zhipu-*') { throw 'Unexpected profile path; application not started.' }
foreach ($tapkitPath in @($tapkitTestRoot, $tapkitSource, $tapkitProfile, (Join-Path $tapkitSource 'secrets'), (Join-Path $tapkitProfile 'secrets'))) {
  if (-not (Test-Path -LiteralPath $tapkitPath -PathType Container) -or ((Get-Item -LiteralPath $tapkitPath).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Missing or linked profile directory; application not started.' }
}
$tapkitNode = Join-Path $tapkitRoot '.runtime/node/node-v24.21.0-win-x64/node.exe'
$tapkitElectron = Join-Path $tapkitRoot 'node_modules/electron/dist/electron.exe'
foreach ($tapkitFile in @($tapkitNode, $tapkitElectron, (Join-Path $tapkitRoot 'apps/desktop/out/main/index.js'), (Join-Path $tapkitSource 'db/app.sqlite'), (Join-Path $tapkitProfile 'db/app.sqlite'))) {
  if (-not (Test-Path -LiteralPath $tapkitFile -PathType Leaf)) { throw 'Required runtime, build, or profile is missing.' }
}
$tapkitCheck = @'
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [source, target] = process.argv.slice(1);
const query = "SELECT id,credential_id,provider_id,api_format,base_url,model_id FROM provider_accounts WHERE deleted_at IS NULL";
const read = (directory) => { const db = new DatabaseSync(join(directory, 'db/app.sqlite'), { readOnly: true }); try { const rows = db.prepare(query).all(); if (rows.length !== 1) throw Error('Expected one account'); return rows[0]; } finally { db.close(); } };
const original = read(source), copy = read(target);
if (JSON.stringify(original) !== JSON.stringify(copy) || original.provider_id !== 'openai-compatible' || original.api_format !== 'openai-chat' || original.base_url !== 'https://open.bigmodel.cn/api/paas/v4' || original.model_id !== 'glm-4.7-flashx' || !/^[a-f0-9-]{36}$/.test(original.credential_id)) throw Error('Account binding does not match');
const sourceState = JSON.parse(readFileSync(join(source, 'Local State'), 'utf8'));
const targetState = JSON.parse(readFileSync(join(target, 'Local State'), 'utf8'));
if (!sourceState.os_crypt?.encrypted_key || sourceState.os_crypt.encrypted_key !== targetState.os_crypt?.encrypted_key) throw Error('Protected profile metadata does not match');
process.stdout.write(original.credential_id);
'@
$tapkitCredentialId = & $tapkitNode --no-warnings --input-type=module -e $tapkitCheck $tapkitSource $tapkitProfile
if ($LASTEXITCODE -ne 0 -or $tapkitCredentialId -notmatch '^[a-f0-9-]{36}$') { throw 'Account preflight failed; application not started.' }
$tapkitOriginalCipher = Join-Path (Join-Path $tapkitSource 'secrets') $tapkitCredentialId
$tapkitCopyCipher = Join-Path (Join-Path $tapkitProfile 'secrets') $tapkitCredentialId
if (-not (Test-Path -LiteralPath $tapkitOriginalCipher -PathType Leaf) -or ((Get-Item -LiteralPath $tapkitOriginalCipher).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Original encrypted credential is unavailable.' }
if (Test-Path -LiteralPath $tapkitCopyCipher) {
  if ((Get-Item -LiteralPath $tapkitCopyCipher).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked credential copy is not supported.' }
}
if ($CheckOnly) { Write-Output 'Account and isolated profile verified. No credential copied and no application started.'; exit 0 }
if (-not (Test-Path -LiteralPath $tapkitCopyCipher)) {
  $tapkitSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $tapkitAcl = [Security.AccessControl.DirectorySecurity]::new()
  $tapkitAcl.SetAccessRuleProtection($true, $false)
  $tapkitRule = [Security.AccessControl.FileSystemAccessRule]::new($tapkitSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $tapkitAcl.AddAccessRule($tapkitRule)
  [IO.Directory]::SetAccessControl((Join-Path $tapkitProfile 'secrets'), $tapkitAcl)
  Copy-Item -LiteralPath $tapkitOriginalCipher -Destination $tapkitCopyCipher
}
$tapkitEnvironment = @{}
foreach ($tapkitName in @('TAPKIT_DATA_DIR','ELECTRON_RUN_AS_NODE','ELECTRON_RENDERER_URL','TAPKIT_TEST_BUILD','TAPKIT_CHAT_FIXTURE','TAPKIT_WEB_FIXTURE','TAPKIT_TOOL_TRACE','REMOTE_DEBUGGING_PORT','V8_INSPECTOR_PORT')) {
  $tapkitEnvironment[$tapkitName] = [Environment]::GetEnvironmentVariable($tapkitName, 'Process')
  [Environment]::SetEnvironmentVariable($tapkitName, $null, 'Process')
}
try {
  $env:TAPKIT_DATA_DIR = $tapkitProfile
  Write-Output 'Opening the P06 isolated profile with the existing Zhipu account.'
  Write-Output 'In TapKit, open Settings > Model connections and check the saved test1 account.'
  Start-Process -FilePath $tapkitElectron -ArgumentList @(('"' + (Join-Path $tapkitRoot 'apps/desktop') + '"')) -WorkingDirectory $tapkitRoot -WindowStyle Normal
} finally {
  foreach ($tapkitName in $tapkitEnvironment.Keys) { [Environment]::SetEnvironmentVariable($tapkitName, $tapkitEnvironment[$tapkitName], 'Process') }
}
