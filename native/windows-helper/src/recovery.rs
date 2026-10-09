use crate::sandbox::{PinnedPath, edit_acl};
use serde::{Deserialize, Serialize};
use std::{fs::{self, OpenOptions}, io::Write, path::{Path, PathBuf}};
use windows::{
    Win32::{
        Foundation::{*, GetLastError},
        Security::{Authorization::*, Isolation::*, *},
        Storage::FileSystem::*,
        System::Threading::*,
    },
    core::PCWSTR,
};

type Result<T> = std::result::Result<T, String>;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RootRecord {
    path: String,
    volume_serial: u32,
    file_index: u64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Journal {
    run_id: String,
    profile_name: String,
    roots: Vec<RootRecord>,
}

struct Handle(HANDLE);
impl Drop for Handle {
    fn drop(&mut self) { unsafe { let _ = CloseHandle(self.0); } }
}
struct Lock(Handle);
impl Drop for Lock {
    fn drop(&mut self) { unsafe { let _ = ReleaseMutex(self.0.0); } }
}

pub struct ExecutionLease {
    path: PathBuf,
    journal: Journal,
    _lock: Lock,
}

fn wide(value: &str) -> Vec<u16> { value.encode_utf16().chain(Some(0)).collect() }

unsafe fn mutex(name: &str, timeout: u32) -> Result<Option<Lock>> {
    let name = wide(name);
    let handle = CreateMutexW(None, false, PCWSTR(name.as_ptr()))
        .map_err(|_| "execution.recovery.mutexCreate")?;
    let handle = Handle(handle);
    match WaitForSingleObject(handle.0, timeout) {
        WAIT_OBJECT_0 | WAIT_ABANDONED => Ok(Some(Lock(handle))),
        WAIT_TIMEOUT => Ok(None),
        _ => Err("execution.recovery.mutexWait".into()),
    }
}

unsafe fn owned_mutex(run_id: &str) -> Result<Lock> {
    let name = wide(&format!("Local\\TapKit.ExecutionLease.v1.{run_id}"));
    let handle = CreateMutexW(None, true, PCWSTR(name.as_ptr()))
        .map_err(|_| "execution.recovery.leaseCreate")?;
    if GetLastError().0 == ERROR_ALREADY_EXISTS.0 {
        let _ = CloseHandle(handle);
        return Err("execution.recovery.leaseExists".into());
    }
    Ok(Lock(Handle(handle)))
}

fn root_dir() -> Result<PathBuf> {
    let local = std::env::var_os("LOCALAPPDATA").ok_or("execution.recovery.localAppData")?;
    let dir = PathBuf::from(local).join("TapKit/execution-leases");
    fs::create_dir_all(&dir).map_err(|_| "execution.recovery.journalDirectory")?;
    Ok(dir)
}

fn valid_id(value: &str) -> bool {
    value.len() == 36 && value.chars().enumerate().all(|(i,c)| {
        if [8,13,18,23].contains(&i) { c == '-' } else { c.is_ascii_hexdigit() }
    }) && value.as_bytes()[14] == b'7'
}

fn validate(journal: &Journal) -> Result<()> {
    if !valid_id(&journal.run_id)
        || journal.profile_name != format!("tapkit.diagnostic.{}", journal.run_id)
        || journal.roots.len() != 3
        || journal.roots.iter().any(|r| {
            let b = r.path.as_bytes();
            b.len() < 4 || !b[0].is_ascii_alphabetic() || b.get(1..3) != Some(b":\\")
                || r.path[3..].contains(':') || r.file_index == 0
        })
    { return Err("execution.recovery.journalInvalid".into()); }
    Ok(())
}

unsafe fn persist(path: &Path, journal: &Journal) -> Result<()> {
    let temp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec(journal).map_err(|_| "execution.recovery.journalEncode")?;
    let mut file = OpenOptions::new().write(true).create_new(true).open(&temp)
        .map_err(|_| "execution.recovery.journalCreate")?;
    file.write_all(&bytes).and_then(|_| file.sync_all())
        .map_err(|_| "execution.recovery.journalWrite")?;
    if path.exists() { let _ = fs::remove_file(temp); return Err("execution.recovery.journalExists".into()); }
    fs::rename(temp, path).map_err(|_| "execution.recovery.journalCommit".into())
}

struct Sid(PSID);
impl Drop for Sid {
    fn drop(&mut self) {
        unsafe { FreeSid(self.0); }
    }
}

unsafe fn remove_resources(journal: &Journal) -> Result<()> {
    validate(journal)?;
    let name = wide(&journal.profile_name);
    let raw_sid = DeriveAppContainerSidFromAppContainerName(PCWSTR(name.as_ptr()))
        .map_err(|_| "execution.recovery.sid")?;
    let sid = Sid(raw_sid);
    for root in &journal.roots {
        // Recovery must read and update this exact root's DACL. Keep the
        // identity check before changing anything, using the ACL-capable handle.
        match PinnedPath::open_for_acl_edit(&root.path) {
            Ok(path) => {
                if path.file_identity()? != (root.volume_serial, root.file_index) {
                    return Err("execution.recovery.pathIdentityChanged".into());
                }
                if let Err(error) = edit_acl(path.handle(), sid.0, REVOKE_ACCESS,
                    FILE_GENERIC_READ.0 | FILE_GENERIC_WRITE.0 | FILE_GENERIC_EXECUTE.0 | DELETE.0,
                    SUB_CONTAINERS_AND_OBJECTS_INHERIT.0) {
                    return Err(error);
                }
            }
            Err(error) if error.ends_with(":0x80070002") || error.ends_with(":0x80070003") => {}
            Err(error) => return Err(error),
        }
    }
    if let Err(error) = DeleteAppContainerProfile(PCWSTR(name.as_ptr())) {
        let code = error.code().0 as u32;
        if code != 0x8007_0490 && code != 0x8007_0002 {
            return Err("execution.recovery.profileDelete".into());
        }
    }
    Ok(())
}

unsafe fn remove(path: &Path, journal: &Journal) -> Result<()> {
    remove_resources(journal)?;
    fs::remove_file(path).map_err(|_| "execution.recovery.journalRemove".into())
}

pub unsafe fn recover_stale() -> Result<()> {
    let dir = match std::env::var_os("LOCALAPPDATA") {
        Some(local) => PathBuf::from(local).join("TapKit/execution-leases"),
        None => return Err("execution.recovery.localAppData".into()),
    };
    if !dir.exists() { return Ok(()); }
    let _guard = mutex("Local\\TapKit.ExecutionRecovery.v1", 30_000)?
        .ok_or("execution.recovery.lockTimeout")?;
    for entry in fs::read_dir(&dir).map_err(|_| "execution.recovery.journalRead")? {
        let path = entry.map_err(|_| "execution.recovery.journalRead")?.path();
        let Some(filename) = path.file_name().and_then(|v| v.to_str()) else { continue };
        if filename.ends_with(".json.tmp") { fs::remove_file(path).map_err(|_| "execution.recovery.tempRemove")?; continue; }
        if !filename.ends_with(".json") { continue; }
        let journal: Journal = serde_json::from_slice(&fs::read(&path)
            .map_err(|_| "execution.recovery.journalRead")?)
            .map_err(|_| "execution.recovery.journalInvalid")?;
        validate(&journal)?;
        if filename != format!("{}.json", journal.run_id) { return Err("execution.recovery.journalNameMismatch".into()); }
        let lease_name = format!("Local\\TapKit.ExecutionLease.v1.{}", journal.run_id);
        let Some(_lease) = mutex(&lease_name, 0)? else { continue };
        remove(&path, &journal)?;
    }
    Ok(())
}

impl ExecutionLease {
    pub unsafe fn create(run_id: &str, roots: [&PinnedPath; 3]) -> Result<Self> {
        let lock = owned_mutex(run_id)?;
        let dir = root_dir()?;
        let _recovery = mutex("Local\\TapKit.ExecutionRecovery.v1", 30_000)?
            .ok_or("execution.recovery.lockTimeout")?;
        let mut records = Vec::with_capacity(3);
        for root in roots {
            let (volume_serial, file_index) = root.file_identity()?;
            records.push(RootRecord { path: root.path.to_string_lossy().into_owned(), volume_serial, file_index });
        }
        let journal = Journal { run_id: run_id.into(), profile_name: format!("tapkit.diagnostic.{run_id}"), roots: records };
        validate(&journal)?;
        let path = dir.join(format!("{run_id}.json"));
        persist(&path, &journal)?;
        Ok(Self { path, journal, _lock: lock })
    }
}

impl Drop for ExecutionLease {
    fn drop(&mut self) {
        unsafe { if remove(&self.path, &self.journal).is_err() { eprintln!("EXECUTION_LEASE_CLEANUP_FAILED"); } }
    }
}
