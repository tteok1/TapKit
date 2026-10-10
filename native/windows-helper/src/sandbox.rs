use crate::{Request, emit};
use serde_json::{Value, json};
use std::{
    ffi::c_void,
    fs::File,
    io::{Read, Write},
    mem::size_of,
    os::windows::io::FromRawHandle,
    path::{Path, PathBuf},
    ptr::null_mut,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
        mpsc::{Receiver, TryRecvError},
    },
    thread,
    time::{Duration, Instant},
};
use windows::{
    Win32::{
        Foundation::*,
        Security::{Authorization::*, Isolation::*, *},
        Storage::FileSystem::*,
        System::{Console::*, JobObjects::*, Pipes::*, Threading::*},
    },
    core::{PCWSTR, PWSTR},
};
type Result<T> = std::result::Result<T, String>;
fn w(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}
fn check<T>(r: windows::core::Result<T>, stage: &str) -> Result<T> {
    r.map_err(|e| format!("{}:0x{:08x}", stage, e.code().0 as u32))
}
struct Handle(HANDLE);
impl Drop for Handle {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}
struct Profile {
    name: Vec<u16>,
    sid: PSID,
}
impl Drop for Profile {
    fn drop(&mut self) {
        unsafe {
            if DeleteAppContainerProfile(PCWSTR(self.name.as_ptr())).is_err() {
                eprintln!("PROFILE_CLEANUP_FAILED");
            }
            FreeSid(self.sid);
        }
    }
}
struct Attributes {
    buffer: Vec<usize>,
    list: LPPROC_THREAD_ATTRIBUTE_LIST,
}
impl Attributes {
    unsafe fn new(count: u32) -> Result<Self> {
        let mut bytes = 0;
        let _ = InitializeProcThreadAttributeList(None, count, Some(0), &mut bytes);
        let mut buffer = vec![0usize; bytes.div_ceil(size_of::<usize>())];
        let list = LPPROC_THREAD_ATTRIBUTE_LIST(buffer.as_mut_ptr().cast());
        check(
            InitializeProcThreadAttributeList(Some(list), count, Some(0), &mut bytes),
            "attributes",
        )?;
        Ok(Self { buffer, list })
    }
    unsafe fn add(&self, kind: u32, ptr: *const c_void, bytes: usize) -> Result<()> {
        check(
            UpdateProcThreadAttribute(self.list, 0, kind as usize, Some(ptr), bytes, None, None),
            "attribute",
        )
    }
}
impl Drop for Attributes {
    fn drop(&mut self) {
        unsafe {
            DeleteProcThreadAttributeList(self.list);
        }
        let _ = &self.buffer;
    }
}
struct Console(HPCON);
impl Drop for Console {
    fn drop(&mut self) {
        unsafe {
            ClosePseudoConsole(self.0);
        }
    }
}

/// Reject lexical aliases before opening every component without following reparse points.
/// Keep component handles alive through execution so an ancestor cannot be renamed.
pub(crate) struct PinnedPath {
    pub(crate) path: PathBuf,
    handles: Vec<Handle>,
}
impl PinnedPath {
    pub(crate) unsafe fn open_scoped(
        raw: &str,
        writable_acl: bool,
        scope: &str,
    ) -> Result<Self> {
        Self::open_access_scoped(raw, if writable_acl { 2 } else { 0 }, scope)
    }
    /// Open the root with the rights needed to inspect and update its DACL.
    pub(crate) unsafe fn open_for_acl_edit(raw: &str) -> Result<Self> {
        Self::open_access_scoped(raw, 2, "lease-recovery")
    }
    unsafe fn open_access_scoped(raw: &str, acl_mode: u8, scope: &str) -> Result<Self> {
        let p = raw.replace('/', "\\");
        if p.len() < 4
            || !p.as_bytes()[0].is_ascii_alphabetic()
            || p.as_bytes().get(1..3) != Some(b":\\")
            || p[3..].contains(':')
            || p.contains('\0')
            || p.contains('~')
            || p[3..]
                .split('\\')
                .any(|s| s.is_empty() || s == "." || s == ".." || s.ends_with([' ', '.']))
        {
            return Err("path.syntax".into());
        }
        let mut current = PathBuf::from(&p[..3]);
        let mut handles = Vec::new();
        let components: Vec<_> = p[3..].split('\\').collect();
        for (i, component) in components.iter().enumerate() {
            current.push(component);
            // The caller still supplies a normal, validated local path. Use the
            // extended form only for this Win32 call so deep private directories
            // retain the same component handles and reparse checks.
            let name = w(&format!(r"\\?\{}", current.display()));
            let desired = FILE_READ_ATTRIBUTES.0
                | if acl_mode > 0 && i + 1 == components.len() {
                    READ_CONTROL.0 | if acl_mode == 2 { WRITE_DAC.0 } else { 0 }
                } else {
                    0
                };
            let h = Handle(check(
                CreateFileW(
                    PCWSTR(name.as_ptr()),
                    desired,
                    FILE_SHARE_READ,
                    None,
                    OPEN_EXISTING,
                    FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS,
                    None,
                ),
                &format!("path.open.{scope}.component.{i}"),
            )?);
            let mut info = BY_HANDLE_FILE_INFORMATION::default();
            check(GetFileInformationByHandle(h.0, &mut info), "path.info")?;
            if info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT.0 != 0 {
                return Err("path.reparse".into());
            }
            let mut final_name = vec![0u16; 32768];
            let len = GetFinalPathNameByHandleW(h.0, &mut final_name, FILE_NAME_NORMALIZED);
            if len == 0 || len as usize >= final_name.len() {
                return Err("path.final".into());
            }
            let final_path = String::from_utf16_lossy(&final_name[..len as usize]);
            if !final_path
                .trim_start_matches("\\\\?\\")
                .eq_ignore_ascii_case(&current.to_string_lossy())
            {
                return Err(format!("path.alias:{}=>{}", current.display(), final_path));
            }
            handles.push(h);
        }
        Ok(Self {
            path: current,
            handles,
        })
    }
    pub(crate) fn handle(&self) -> HANDLE {
        self.handles.last().unwrap().0
    }
    pub(crate) unsafe fn file_identity(&self) -> Result<(u32, u64)> {
        let mut info = BY_HANDLE_FILE_INFORMATION::default();
        check(GetFileInformationByHandle(self.handle(), &mut info), "path.identity")?;
        Ok((
            info.dwVolumeSerialNumber,
            ((info.nFileIndexHigh as u64) << 32) | info.nFileIndexLow as u64,
        ))
    }
}
/// Modify only these pre-opened roots. A per-profile ACE is revoked at cleanup.
/// Inherited broad ALL APPLICATION PACKAGES rights are not enough: write grants are explicit.
struct Grant {
    handle: HANDLE,
    sid: PSID,
    inheritance: u32,
}
impl Grant {
    unsafe fn new(path: &PinnedPath, sid: PSID, writable: bool) -> Result<Self> {
        edit_acl(
            path.handle(),
            sid,
            GRANT_ACCESS,
            if writable {
                FILE_GENERIC_READ.0 | FILE_GENERIC_WRITE.0 | FILE_GENERIC_EXECUTE.0 | DELETE.0
            } else {
                FILE_GENERIC_READ.0 | FILE_GENERIC_EXECUTE.0
            },
            SUB_CONTAINERS_AND_OBJECTS_INHERIT.0,
        )?;
        Ok(Self {
            handle: path.handle(),
            sid,
            inheritance: SUB_CONTAINERS_AND_OBJECTS_INHERIT.0,
        })
    }
}
pub(crate) unsafe fn edit_acl(
    h: HANDLE,
    sid: PSID,
    mode: ACCESS_MODE,
    access: u32,
    inheritance: u32,
) -> Result<()> {
    let _acl_lock = AclMutex::acquire()?;
    let mut old = null_mut();
    let mut descriptor = PSECURITY_DESCRIPTOR::default();
    check(
        GetSecurityInfo(
            h,
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            None,
            None,
            Some(&mut old),
            None,
            Some(&mut descriptor),
        )
        .ok(),
        "acl.read",
    )?;
    let entry = EXPLICIT_ACCESS_W {
        grfAccessPermissions: access,
        grfAccessMode: mode,
        grfInheritance: ACE_FLAGS(inheritance),
        Trustee: TRUSTEE_W {
            TrusteeForm: TRUSTEE_IS_SID,
            TrusteeType: TRUSTEE_IS_UNKNOWN,
            ptstrName: PWSTR(sid.0.cast()),
            ..Default::default()
        },
    };
    let mut acl = null_mut();
    let result = SetEntriesInAclW(Some(&[entry]), Some(old), &mut acl).ok();
    let applied = match result {
        Ok(()) if inheritance == 0 => (|| {
            let mut sd = SECURITY_DESCRIPTOR::default();
            let ptr = PSECURITY_DESCRIPTOR((&mut sd as *mut SECURITY_DESCRIPTOR).cast());
            InitializeSecurityDescriptor(ptr, 1)?;
            SetSecurityDescriptorDacl(ptr, true, Some(acl), false)?;
            SetKernelObjectSecurity(h, DACL_SECURITY_INFORMATION, ptr)
        })(),
        Ok(()) => SetSecurityInfo(
            h,
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            None,
            None,
            Some(acl),
            None,
        )
        .ok(),
        Err(e) => Err(e),
    };
    if !acl.is_null() {
        let _ = LocalFree(Some(HLOCAL(acl.cast())));
    }
    let _ = LocalFree(Some(HLOCAL(descriptor.0)));
    check(applied, "acl.apply")
}

struct AclMutex(Handle);
impl AclMutex {
    unsafe fn acquire() -> Result<Self> {
        let name = w("Local\\TapKit.AppContainerAcl.v1");
        let handle = Handle(check(
            CreateMutexW(None, false, PCWSTR(name.as_ptr())),
            "acl.mutex.create",
        )?);
        match WaitForSingleObject(handle.0, 30_000) {
            WAIT_OBJECT_0 | WAIT_ABANDONED => Ok(Self(handle)),
            WAIT_TIMEOUT => Err("acl.mutex.timeout".into()),
            _ => Err("acl.mutex.wait".into()),
        }
    }
}
impl Drop for AclMutex {
    fn drop(&mut self) {
        unsafe {
            let _ = ReleaseMutex(self.0.0);
        }
    }
}
impl Drop for Grant {
    fn drop(&mut self) {
        unsafe {
            if edit_acl(self.handle, self.sid, REVOKE_ACCESS, 0, self.inheritance).is_err() {
                eprintln!("ACL_CLEANUP_FAILED");
            }
        }
    }
}
pub(crate) fn within(path: &Path, root: &Path) -> bool {
    let p = path.to_string_lossy().to_lowercase();
    let r = root.to_string_lossy().to_lowercase();
    p.starts_with(&(r + "\\"))
}
pub(crate) fn quote(s: &str) -> String {
    let mut out = String::from("\"");
    let mut slashes = 0;
    for c in s.chars() {
        if c == '\\' {
            slashes += 1;
            continue;
        }
        if c == '"' {
            out.push_str(&"\\".repeat(slashes * 2 + 1));
        } else {
            out.push_str(&"\\".repeat(slashes));
        }
        out.push(c);
        slashes = 0;
    }
    out.push_str(&"\\".repeat(slashes * 2));
    out.push('"');
    out
}
unsafe fn pipe() -> Result<(Handle, Handle)> {
    let mut read = HANDLE::default();
    let mut write = HANDLE::default();
    let sa = SECURITY_ATTRIBUTES {
        nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
        bInheritHandle: true.into(),
        ..Default::default()
    };
    check(CreatePipe(&mut read, &mut write, Some(&sa), 0), "pipe")?;
    Ok((Handle(read), Handle(write)))
}
/// Inspect this profile's ordinary allow/deny ACEs while the payload is suspended.
/// This is diagnostic evidence, not an access check or a permission change.
unsafe fn profile_acl_snapshot(path: &Path, sid: PSID) -> Value {
    let name = w(&path.to_string_lossy());
    let mut acl = null_mut();
    let mut descriptor = PSECURITY_DESCRIPTOR::default();
    let status = GetNamedSecurityInfoW(
        PCWSTR(name.as_ptr()),
        SE_FILE_OBJECT,
        DACL_SECURITY_INFORMATION,
        None,
        None,
        Some(&mut acl),
        None,
        &mut descriptor,
    );
    let snapshot = if status != ERROR_SUCCESS {
        json!({"queryError": status.0})
    } else if acl.is_null() {
        json!({"nullDacl": true})
    } else {
        let mut entries = Vec::new();
        for index in 0..u32::from((*acl).AceCount).min(256) {
            let mut raw = null_mut();
            if let Err(error) = GetAce(acl, index, &mut raw) {
                entries.push(json!({"queryError": error.code().0 as u32}));
                break;
            }
            let header = &*(raw as *const ACE_HEADER);
            // ACCESS_ALLOWED_ACE_TYPE=0 and ACCESS_DENIED_ACE_TYPE=1 have
            // the same fixed prefix. Other principals/ACE forms are omitted.
            if header.AceType > 1 {
                continue;
            }
            let ace = &*(raw as *const ACCESS_ALLOWED_ACE);
            let ace_sid = PSID((&ace.SidStart as *const u32).cast_mut().cast());
            if EqualSid(ace_sid, sid).is_ok() {
                entries.push(json!({
                    "type": if header.AceType == 0 { "allow" } else { "deny" },
                    "mask": ace.Mask,
                    "flags": header.AceFlags,
                }));
            }
        }
        json!({"profileAces": entries})
    };
    if !descriptor.0.is_null() {
        let _ = LocalFree(Some(HLOCAL(descriptor.0)));
    }
    snapshot
}
fn reader(
    h: Handle,
    total: Arc<AtomicUsize>,
    preview_count: Arc<AtomicUsize>,
    preview: Arc<Mutex<Vec<u8>>>,
    mut log: File,
    limit: usize,
) -> thread::JoinHandle<()> {
    let raw = h.0.0 as usize;
    std::mem::forget(h);
    thread::spawn(move || {
        let mut f = unsafe { File::from_raw_handle(raw as *mut c_void) };
        let mut bytes = [0u8; 8192];
        loop {
            let Ok(n) = f.read(&mut bytes) else {
                break;
            };
            if n == 0 {
                break;
            }
            let before = total.fetch_add(n, Ordering::Relaxed);
            let logged = n.min(limit.saturating_sub(before));
            if log.write_all(&bytes[..logged]).is_err() {
                total.store(limit + 1, Ordering::Relaxed);
            }
            let mut dest = preview.lock().unwrap();
            let keep =
                n.min(65536usize.saturating_sub(preview_count.fetch_add(n, Ordering::Relaxed)));
            dest.extend_from_slice(&bytes[..keep]);
        }
    })
}
unsafe fn token_u32(token: HANDLE, class: TOKEN_INFORMATION_CLASS) -> Result<u32> {
    let mut value = 0u32;
    let mut len = 0;
    check(
        GetTokenInformation(
            token,
            class,
            Some((&mut value as *mut u32).cast()),
            4,
            &mut len,
        ),
        "token",
    )?;
    Ok(value)
}
pub unsafe fn execute(r: &Request, control: &Receiver<Vec<u8>>) -> Result<Value> {
    execute_with_workspace_alias(r, control, None)
}

/// The fixed Office adapter supplies only the workspace alias of its live lease.
/// This argument is internal; request ACLs and handle checks use physical roots.
pub(crate) unsafe fn execute_with_workspace_alias(
    r: &Request,
    control: &Receiver<Vec<u8>>,
    workspace_alias: Option<&str>,
) -> Result<Value> {
    let p = &r.payload;
    if p.args.len() > 32
        || p.args.iter().any(|a| a.contains('\0') || a.len() > 8192)
        || !(50..=120000).contains(&p.timeout_ms)
        || !(64 * 1024 * 1024..=2 * 1024 * 1024 * 1024).contains(&p.memory_bytes)
        || !(1..=32).contains(&p.process_limit)
        || !(1024..=4 * 1024 * 1024).contains(&p.output_bytes)
    {
        return Err("limits".into());
    }
    let runtime = PinnedPath::open_scoped(&p.runtime_root, true, "runtime")?;
    let input = PinnedPath::open_scoped(&p.input_root, true, "input")?;
    let workspace = PinnedPath::open_scoped(&p.workspace, true, "workspace")?;
    let executable = PinnedPath::open_scoped(&p.executable, false, "executable")?;
    if !within(&executable.path, &runtime.path)
        || within(&workspace.path, &runtime.path)
        || within(&runtime.path, &workspace.path)
        || within(&input.path, &workspace.path)
        || within(&workspace.path, &input.path)
        || input
            .path
            .to_string_lossy()
            .eq_ignore_ascii_case(&workspace.path.to_string_lossy())
        || runtime
            .path
            .to_string_lossy()
            .eq_ignore_ascii_case(&workspace.path.to_string_lossy())
    {
        return Err("path.scope".into());
    }
    let _lease = crate::recovery::ExecutionLease::create(
        &r.run_id,
        [&runtime, &input, &workspace],
    )?;
    let log_dir = workspace
        .path
        .parent()
        .ok_or("log.parent")?
        .join(format!("helper-logs-{}", r.run_id));
    std::fs::create_dir(&log_dir).map_err(|_| "log.create")?;
    let _logs = PinnedPath::open_scoped(&log_dir.to_string_lossy(), false, "logs")?;
    let stdout_log = File::options()
        .write(true)
        .create_new(true)
        .open(log_dir.join("stdout.log"))
        .map_err(|_| "log.stdout")?;
    let stderr_log = File::options()
        .write(true)
        .create_new(true)
        .open(log_dir.join("stderr.log"))
        .map_err(|_| "log.stderr")?;
    let profile_name = w(&format!("tapkit.diagnostic.{}", r.run_id));
    let sid = check(
        CreateAppContainerProfile(
            PCWSTR(profile_name.as_ptr()),
            PCWSTR(profile_name.as_ptr()),
            PCWSTR(profile_name.as_ptr()),
            None,
        ),
        "profile.create",
    )?;
    let profile = Profile {
        name: profile_name,
        sid,
    };
    // Only metadata/traverse on owned ancestors, no list/read/write and no inheritance.
    // This supports runtime canonical-path queries without exposing sibling contents.
    let mut ancestor_handles = Vec::new();
    let mut ancestor_grants = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for path in [&runtime.path, &input.path, &workspace.path] {
        for ancestor in path.ancestors().skip(1).filter(|p| p.parent().is_some()) {
            let key = ancestor.to_string_lossy().to_lowercase();
            if !seen.insert(key) {
                continue;
            }
            let name = w(&format!(r"\\?\{}", ancestor.display()));
            if let Ok(handle) = CreateFileW(
                PCWSTR(name.as_ptr()),
                READ_CONTROL.0 | WRITE_DAC.0 | FILE_READ_ATTRIBUTES.0,
                FILE_SHARE_READ,
                None,
                OPEN_EXISTING,
                FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
                None,
            ) {
                let h = Handle(handle);
                edit_acl(
                    h.0,
                    profile.sid,
                    GRANT_ACCESS,
                    FILE_TRAVERSE.0 | FILE_READ_ATTRIBUTES.0 | SYNCHRONIZE.0,
                    0,
                )?;
                ancestor_grants.push(Grant {
                    handle: h.0,
                    sid: profile.sid,
                    inheritance: 0,
                });
                ancestor_handles.push(h);
            }
        }
    }
    // Windows redirects AppContainer TEMP under this per-profile location.
    std::fs::create_dir_all(
        workspace
            .path
            .join("Packages")
            .join(format!("tapkit.diagnostic.{}", r.run_id))
            .join("AC")
            .join("Temp"),
    )
    .map_err(|_| "environment.temp")?;
    let _runtime_grant = Grant::new(&runtime, profile.sid, false)?;
    let _input_grant = Grant::new(&input, profile.sid, false)?;
    let _workspace_grant = Grant::new(&workspace, profile.sid, true)?;
    execute_process(
        r,
        control,
        &runtime,
        &workspace,
        &executable,
        stdout_log,
        stderr_log,
        log_dir,
        profile.sid,
        workspace_alias,
    )
}
unsafe fn execute_process(
    r: &Request,
    control: &Receiver<Vec<u8>>,
    runtime: &PinnedPath,
    workspace: &PinnedPath,
    executable: &PinnedPath,
    stdout_log: File,
    stderr_log: File,
    log_dir: PathBuf,
    profile_sid: PSID,
    workspace_alias: Option<&str>,
) -> Result<Value> {
    let p = &r.payload;
    let job = Handle(check(CreateJobObjectW(None, PCWSTR::null()), "job.create")?);
    let limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        BasicLimitInformation: JOBOBJECT_BASIC_LIMIT_INFORMATION {
            LimitFlags: JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                | JOB_OBJECT_LIMIT_ACTIVE_PROCESS
                | JOB_OBJECT_LIMIT_JOB_MEMORY
                | JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION,
            ActiveProcessLimit: p.process_limit,
            ..Default::default()
        },
        JobMemoryLimit: p.memory_bytes,
        ..Default::default()
    };
    check(
        SetInformationJobObject(
            job.0,
            JobObjectExtendedLimitInformation,
            (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
            size_of_val(&limits) as u32,
        ),
        "job.limits",
    )?;
    let (out_read, out_write) = pipe()?;
    let (err_read, err_write) = pipe()?;
    let (in_read, in_write) = pipe()?;
    for h in [&out_read, &err_read, &in_write] {
        check(
            SetHandleInformation(h.0, HANDLE_FLAG_INHERIT.0, HANDLE_FLAGS(0)),
            "pipe.private",
        )?;
    }
    let mut console = None;
    if p.terminal {
        console = Some(Console(check(
            CreatePseudoConsole(COORD { X: 100, Y: 30 }, in_read.0, out_write.0, 0),
            "conpty.create",
        )?));
    }
    let attrs = Attributes::new(2)?;
    let caps = SECURITY_CAPABILITIES {
        AppContainerSid: profile_sid,
        ..Default::default()
    };
    attrs.add(
        PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES,
        (&caps as *const SECURITY_CAPABILITIES).cast(),
        size_of_val(&caps),
    )?;
    let inherit = [out_write.0, err_write.0, in_read.0];
    if !p.terminal {
        attrs.add(
            PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
            inherit.as_ptr().cast(),
            size_of_val(&inherit),
        )?;
    }
    if let Some(ref c) = console {
        attrs.add(
            PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
            c.0.0 as *const c_void,
            size_of::<HPCON>(),
        )?;
    }
    let mut startup = STARTUPINFOEXW::default();
    startup.StartupInfo.cb = size_of::<STARTUPINFOEXW>() as u32;
    startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    startup.StartupInfo.hStdInput = INVALID_HANDLE_VALUE;
    startup.StartupInfo.hStdOutput = INVALID_HANDLE_VALUE;
    startup.StartupInfo.hStdError = INVALID_HANDLE_VALUE;
    if !p.terminal {
        startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
        startup.StartupInfo.hStdInput = in_read.0;
        startup.StartupInfo.hStdOutput = out_write.0;
        startup.StartupInfo.hStdError = err_write.0;
    }
    startup.lpAttributeList = attrs.list;
    // No caller environment is forwarded; no HOME, credentials, proxy, SSH agent or config.
    let system = std::env::var("SystemRoot").map_err(|_| "environment.systemRoot")?;
    let entries = [
        format!(
            "PATH={};{}",
            executable.path.parent().unwrap().display(),
            runtime.path.display()
        ),
        format!("SystemRoot={}", system),
        format!("WINDIR={}", system),
        format!("TEMP={}", workspace.path.display()),
        format!("TMP={}", workspace.path.display()),
        format!("USERPROFILE={}", workspace.path.display()),
        format!("LOCALAPPDATA={}", workspace.path.display()),
        format!("APPDATA={}", workspace.path.display()),
        "PYTHONIOENCODING=utf-8".into(),
        "PYTHONUTF8=1".into(),
        "GIT_CONFIG_NOSYSTEM=1".into(),
        "GIT_CONFIG_GLOBAL=NUL".into(),
        "GIT_TERMINAL_PROMPT=0".into(),
        "GIT_CONFIG_SYSTEM=NUL".into(),
    ];
    let mut environment: Vec<u16> = entries.iter().flat_map(|e| w(e)).collect();
    environment.push(0);
    let cmd = std::iter::once(p.executable.as_str())
        .chain(p.args.iter().map(String::as_str))
        .map(quote)
        .collect::<Vec<_>>()
        .join(" ");
    let mut command = w(&cmd);
    let exe_name = w(&p.executable);
    let cwd = w(workspace_alias.unwrap_or(&p.workspace));
    let mut pi = PROCESS_INFORMATION::default();
    let flags = EXTENDED_STARTUPINFO_PRESENT
        | CREATE_SUSPENDED
        | CREATE_UNICODE_ENVIRONMENT
        | if p.terminal {
            PROCESS_CREATION_FLAGS(0)
        } else {
            CREATE_NO_WINDOW
        };
    check(
        CreateProcessW(
            PCWSTR(exe_name.as_ptr()),
            Some(PWSTR(command.as_mut_ptr())),
            None,
            None,
            !p.terminal,
            flags,
            Some(environment.as_ptr().cast()),
            PCWSTR(cwd.as_ptr()),
            &startup.StartupInfo,
            &mut pi,
        ),
        "process.create",
    )?;
    let process = Handle(pi.hProcess);
    let process_thread = Handle(pi.hThread);
    // Every failure while suspended terminates it, including assignment and token verification.
    let verification = (|| -> Result<_> {
        check(AssignProcessToJobObject(job.0, process.0), "job.assign")?;
        let mut token = HANDLE::default();
        check(
            OpenProcessToken(process.0, TOKEN_QUERY, &mut token),
            "token.open",
        )?;
        let token = Handle(token);
        if token_u32(token.0, TokenIsAppContainer)? != 1 {
            return Err("token.notAppContainer".into());
        }
        let mut info = TOKEN_APPCONTAINER_INFORMATION::default();
        let mut len = 0;
        // TOKEN_APPCONTAINER_INFORMATION's SID is variable length: query a sufficiently aligned buffer.
        let mut buffer = vec![0usize; 128];
        check(
            GetTokenInformation(
                token.0,
                TokenAppContainerSid,
                Some(buffer.as_mut_ptr().cast()),
                (buffer.len() * size_of::<usize>()) as u32,
                &mut len,
            ),
            "token.sid",
        )?;
        info.TokenAppContainer =
            (*(buffer.as_ptr() as *const TOKEN_APPCONTAINER_INFORMATION)).TokenAppContainer;
        if EqualSid(info.TokenAppContainer, profile_sid).is_err() {
            return Err("token.sidMismatch".into());
        }
        let mut sid_string = PWSTR::null();
        check(
            ConvertSidToStringSidW(profile_sid, &mut sid_string),
            "token.sidText",
        )?;
        let sid_text = sid_string.to_string().map_err(|_| "token.sidText")?;
        let _ = LocalFree(Some(HLOCAL(sid_string.0.cast())));
        Ok(sid_text)
    })();
    let sid_text = match verification {
        Ok(s) => s,
        Err(e) => {
            let _ = TerminateProcess(process.0, 1);
            return Err(e);
        }
    };
    let runtime_acl = json!({
        "phase": "before-resume",
        "root": profile_acl_snapshot(&runtime.path, profile_sid),
        "executable": profile_acl_snapshot(&executable.path, profile_sid),
    });
    if ResumeThread(process_thread.0) == u32::MAX {
        let _ = TerminateProcess(process.0, 1);
        return Err("process.resume".into());
    }
    drop(out_write);
    drop(err_write);
    drop(in_read);
    let total = Arc::new(AtomicUsize::new(0));
    let preview_count = Arc::new(AtomicUsize::new(0));
    let stdout = Arc::new(Mutex::new(Vec::new()));
    let stderr = Arc::new(Mutex::new(Vec::new()));
    let out_reader = reader(
        out_read,
        total.clone(),
        preview_count.clone(),
        stdout.clone(),
        stdout_log,
        p.output_bytes,
    );
    let err_reader = reader(
        err_read,
        total.clone(),
        preview_count.clone(),
        stderr.clone(),
        stderr_log,
        p.output_bytes,
    );
    emit(
        r,
        "started",
        json!({"pid":pi.dwProcessId,"appContainer":true,"identitySid":sid_text,"appContainerSid":Some(&sid_text),"restrictedToken":false,
        "networkCapabilities":0,"runtimeAcl":runtime_acl,"job":{"killOnClose":true,"memoryBytes":p.memory_bytes,"processLimit":p.process_limit,"breakaway":false}}),
    );
    let start = Instant::now();
    let mut reason = "exited";
    let mut code = 0u32;
    let mut peak_active = 0u32;
    loop {
        let mut sample = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
        check(
            QueryInformationJobObject(
                Some(job.0),
                JobObjectBasicAccountingInformation,
                (&mut sample as *mut JOBOBJECT_BASIC_ACCOUNTING_INFORMATION).cast(),
                size_of_val(&sample) as u32,
                None,
            ),
            "job.sample",
        )?;
        peak_active = peak_active.max(sample.ActiveProcesses);
        if sample.ActiveProcesses > p.process_limit {
            reason = "process_limit";
            break;
        }
        if total.load(Ordering::Relaxed) > p.output_bytes {
            reason = "output_limit";
            break;
        }
        if start.elapsed().as_millis() >= p.timeout_ms as u128 {
            reason = "timeout";
            break;
        }
        match control.try_recv() {
            Ok(bytes) => {
                if let Ok(c) = serde_json::from_slice::<Value>(&bytes) {
                    if c["protocolVersion"] == 1
                        && c["requestId"] == r.request_id
                        && c["runId"] == r.run_id
                        && c["leaseEpoch"] == r.lease_epoch
                    {
                        if c["operation"] == "cancel" {
                            reason = "cancelled";
                            break;
                        }
                        if p.terminal && c["operation"] == "terminal.input" {
                            if let Some(text) =
                                c["payload"]["text"].as_str().filter(|s| s.len() <= 4096)
                            {
                                let mut written = 0;
                                let _ = WriteFile(
                                    in_write.0,
                                    Some(text.as_bytes()),
                                    Some(&mut written),
                                    None,
                                );
                            }
                        }
                    }
                }
            }
            Err(TryRecvError::Disconnected) => {
                reason = "parent_closed";
                break;
            }
            Err(TryRecvError::Empty) => {}
        }
        if WaitForSingleObject(process.0, 10) == WAIT_OBJECT_0 {
            check(GetExitCodeProcess(process.0, &mut code), "process.exit")?;
            break;
        }
    }
    check(
        TerminateJobObject(job.0, if reason == "exited" { 0 } else { 1 }),
        "job.terminate",
    )?;
    let until = Instant::now() + Duration::from_secs(5);
    let mut accounting = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
    loop {
        check(
            QueryInformationJobObject(
                Some(job.0),
                JobObjectBasicAccountingInformation,
                (&mut accounting as *mut JOBOBJECT_BASIC_ACCOUNTING_INFORMATION).cast(),
                size_of_val(&accounting) as u32,
                None,
            ),
            "job.accounting",
        )?;
        if accounting.ActiveProcesses == 0 {
            break;
        }
        if Instant::now() > until {
            return Err("job.cleanupTimeout".into());
        }
        thread::sleep(Duration::from_millis(10));
    }
    check(
        GetExitCodeProcess(process.0, &mut code),
        "process.finalExit",
    )?;
    drop(in_write);
    drop(console);
    let _ = out_reader.join();
    let _ = err_reader.join();
    Ok(
        json!({"status":reason,"exitCode":code,"activeProcesses":accounting.ActiveProcesses,
        "peakActiveProcesses":peak_active,"totalProcesses":accounting.TotalProcesses,"outputBytes":total.load(Ordering::Relaxed),"logDirectory":log_dir.to_string_lossy(),
        "stdout":String::from_utf8_lossy(&stdout.lock().unwrap()),
        "stderr":String::from_utf8_lossy(&stderr.lock().unwrap())}),
    )
}
