Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"
!include "nsDialogs.nsh"

Name "TapKit 开发测试版"
InstallDir "$LOCALAPPDATA\Programs\TapKit"
RequestExecutionLevel user
ShowInstDetails show
ShowUninstDetails show
BrandingText "TapKit"

Var programs
Var operationLock
Var resultCode
Var resultText
Var clearCheckbox
Var clearData

!define MUI_WELCOMEPAGE_TITLE "安装 TapKit 开发测试版 ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "此安装包包含运行环境，可离线安装。$\r$\n$\r$\n升级会先安全关闭 TapKit 并备份数据库，然后验证新版本。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\TapKit.exe"
!define MUI_FINISHPAGE_RUN_TEXT "打开 TapKit"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
UninstPage custom un.Scope un.Selection
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

!macro SetupEnvironment
  SetShellVarContext current
  StrCpy $programs "$LOCALAPPDATA\Programs"
  StrCpy $INSTDIR "$programs\TapKit"
!macroend

!macro LockSetup
  CreateDirectory "$programs"
  System::Call 'kernel32::CreateFileW(w "$programs\.TapKit-setup.lock", i 0x40000000, i 0, p 0, i 4, i 0x80, p 0) p .r0'
  StrCpy $operationLock $0
  ${If} $operationLock == -1
    MessageBox MB_OK|MB_ICONSTOP "另一个 TapKit 安装或卸载正在进行，或无法访问安装目录。" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro CallSetup action option
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=setup.ps1 "${PROJECT_DIR}\scripts\installer\setup.ps1"
  Delete "$PLUGINSDIR\result.txt"
  StrCpy $0 "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
  IfFileExists "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" 0 +2
    StrCpy $0 "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
  ClearErrors
  ExecWait '"$0" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\setup.ps1" -Action ${action} -Data ${option}' $resultCode
  IfErrors 0 +2
    StrCpy $resultCode -1
  StrCpy $resultText "INSTALL_FILES_OR_PERMISSIONS"
  ClearErrors
  FileOpen $0 "$PLUGINSDIR\result.txt" r
  IfErrors +3
    FileReadUTF16LE $0 $resultText
    FileClose $0
!macroend

!macro CheckResult
  ${If} $resultCode != 0
    DetailPrint "TapKit: $resultText"
    MessageBox MB_ICONSTOP|MB_OK "操作未完成（$resultText）。请关闭 TapKit 后重新运行安装包或卸载程序。" /SD IDOK
    SetErrorLevel 1
    Quit
  ${EndIf}
!macroend

Function .onInit
  !insertmacro SetupEnvironment
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "此安装包需要 Windows x64。" /SD IDOK
    SetErrorLevel 1
    Quit
  ${EndIf}
FunctionEnd

Section "TapKit"
  !insertmacro LockSetup
  DetailPrint "正在检查 TapKit 的安装状态。"
  !insertmacro CallSetup Prepare keep
  !insertmacro CheckResult
  SetOutPath "$programs\.TapKit-stage"
  SetCompress off
  File /oname=$PLUGINSDIR\payload.7z "${APP_64}"
  SetCompress auto
  DetailPrint "正在解包离线运行环境。"
  Nsis7z::Extract "$PLUGINSDIR\payload.7z"
  WriteUninstaller "$programs\.TapKit-stage\Uninstall.exe"
  DetailPrint "正在校验运行环境并检查数据库。"
  !insertmacro CallSetup Install keep
  !insertmacro CheckResult
  System::Call 'kernel32::CloseHandle(p $operationLock)'
SectionEnd

Function un.onInit
  !insertmacro SetupEnvironment
  StrCpy $clearData "keep"
  ${If} ${Silent}
    ${GetParameters} $0
    ClearErrors
    ${GetOptions} $0 "/CLEAR-DATA" $1
    ${IfNot} ${Errors}
    ${AndIf} $1 == ""
      StrCpy $clearData "clear"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function un.Scope
  !insertmacro CallSetup Scope keep
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 23u "卸载 TapKit 开发测试版。默认保留本机资料，以便重新安装后继续使用。"
  Pop $0
  ${NSD_CreateCheckbox} 0 28u 100% 16u "同时永久清除 TapKit 本机资料和保存的凭据"
  Pop $clearCheckbox
  ${If} $resultCode == 0
    ${NSD_CreateLabel} 0 48u 100% 45u "清除范围：$\r$\n$APPDATA\TapKit$\r$\n$resultText"
  ${Else}
    EnableWindow $clearCheckbox 0
    ${NSD_CreateLabel} 0 48u 100% 45u "无法读取 TapKit 资料位置。当前可保留资料并卸载。"
  ${EndIf}
  Pop $0
  ${NSD_CreateLabel} 0 98u 100% 25u "原仓库、导出到其他目录的文件，以及手动保存的备份仍可使用。"
  Pop $0
  nsDialogs::Show
FunctionEnd

Function un.Selection
  ${NSD_GetState} $clearCheckbox $0
  StrCpy $clearData "keep"
  ${If} $0 == ${BST_CHECKED}
    StrCpy $clearData "clear"
  ${EndIf}
FunctionEnd

Section "Uninstall"
  !insertmacro LockSetup
  DetailPrint "正在关闭 TapKit 并执行所选卸载操作。"
  !insertmacro CallSetup Uninstall $clearData
  !insertmacro CheckResult
  System::Call 'kernel32::CloseHandle(p $operationLock)'
SectionEnd
