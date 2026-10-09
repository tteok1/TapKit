@echo off
setlocal
cd /d "%~dp0"
rem Resolve the project-local Node from the lock; do not change system policies or PATH.
powershell.exe -NoProfile -NonInteractive -Command "$ErrorActionPreference = 'Stop'; $tapkitLock = Get-Content -LiteralPath 'runtime-lock.json' -Raw | ConvertFrom-Json; $tapkitNode = Join-Path '.runtime/node' ($tapkitLock.runtimes.node.directory + '/node.exe'); if (-not (Test-Path -LiteralPath $tapkitNode)) { throw 'Project runtime missing. Run bootstrap first.' }; & $tapkitNode 'scripts/dev.mjs'; exit $LASTEXITCODE"
set "tapkitExitCode=%errorlevel%"
if not "%tapkitExitCode%"=="0" (
  echo TapKit could not start. Read the error above; no Windows security setting was changed.
  pause
)
exit /b %tapkitExitCode%
