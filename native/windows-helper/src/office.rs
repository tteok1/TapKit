use crate::{Request, sandbox::PinnedPath};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use windows::{
    Win32::{
        Foundation::{*, GetLastError},
        Storage::FileSystem::*,
        System::Threading::*,
    },
    core::PCWSTR,
};

type Result<T> = std::result::Result<T, String>;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OfficeRequest {
    pub filename: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Mapping {
    drive: String,
    target: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Journal {
    run_id: String,
    mappings: Vec<Mapping>,
}

struct Handle(HANDLE);
impl Drop for Handle {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

struct MutexGuard(Handle);
impl Drop for MutexGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = ReleaseMutex(self.0.0);
        }
    }
}

struct Lease {
    journal_path: PathBuf,
    journal: Journal,
    _lease_lock: MutexGuard,
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}

fn journal_root() -> Result<PathBuf> {
    let local = std::env::var_os("LOCALAPPDATA").ok_or("office.mapping.localAppData")?;
    let root = PathBuf::from(local).join("TapKit/office-device-leases");
    fs::create_dir_all(&root).map_err(|_| "office.mapping.journalDirectory")?;
    Ok(root)
}

unsafe fn acquire_mutex(name: &str, timeout_ms: u32) -> Result<Option<MutexGuard>> {
    let name = wide(name);
    let handle = CreateMutexW(None, false, PCWSTR(name.as_ptr()))
        .map_err(|_| "office.mapping.mutexCreate")?;
    let handle = Handle(handle);
    match WaitForSingleObject(handle.0, timeout_ms) {
        WAIT_OBJECT_0 | WAIT_ABANDONED => Ok(Some(MutexGuard(handle))),
        WAIT_TIMEOUT => Ok(None),
        _ => Err("office.mapping.mutexWait".into()),
    }
}

unsafe fn create_lease_mutex(run_id: &str) -> Result<MutexGuard> {
    let name = wide(&format!("Local\\TapKit.OfficeLease.v1.{run_id}"));
    let handle = CreateMutexW(None, true, PCWSTR(name.as_ptr()))
        .map_err(|_| "office.mapping.leaseCreate")?;
    if GetLastError().0 == ERROR_ALREADY_EXISTS.0 {
        let _ = CloseHandle(handle);
        return Err("office.mapping.leaseExists".into());
    }
    Ok(MutexGuard(Handle(handle)))
}

unsafe fn allocation_lock() -> Result<MutexGuard> {
    acquire_mutex("Local\\TapKit.OfficeAllocation.v1", 30_000)?
        .ok_or_else(|| "office.mapping.allocationTimeout".into())
}

unsafe fn query_targets(drive: &str) -> Result<Vec<String>> {
    let device = wide(drive);
    let mut target = vec![0u16; 1024];
    let count = QueryDosDeviceW(PCWSTR(device.as_ptr()), Some(&mut target));
    if count == 0 {
        let code = GetLastError().0;
        if code == ERROR_FILE_NOT_FOUND.0 || code == ERROR_PATH_NOT_FOUND.0 {
            return Ok(Vec::new());
        }
        return Err(format!("office.mapping.query:0x{:08x}", code));
    }
    let mut results = Vec::new();
    let mut start = 0;
    for index in 0..(count as usize).min(target.len()) {
        if target[index] == 0 {
            if index > start {
                results.push(String::from_utf16_lossy(&target[start..index]));
            }
            start = index + 1;
        }
    }
    Ok(results)
}

unsafe fn define(mapping: &Mapping) -> Result<()> {
    let drive = wide(&mapping.drive);
    let target = wide(&mapping.target);
    DefineDosDeviceW(
        DDD_RAW_TARGET_PATH | DDD_NO_BROADCAST_SYSTEM,
        PCWSTR(drive.as_ptr()),
        PCWSTR(target.as_ptr()),
    )
    .map_err(|_| "office.mapping.define".into())
}

unsafe fn remove_exact(mapping: &Mapping) -> Result<()> {
    if !query_targets(&mapping.drive)?
        .iter()
        .any(|current| current.eq_ignore_ascii_case(&mapping.target))
    {
        return Ok(());
    }
    let drive = wide(&mapping.drive);
    let target = wide(&mapping.target);
    DefineDosDeviceW(
        DDD_RAW_TARGET_PATH
            | DDD_REMOVE_DEFINITION
            | DDD_EXACT_MATCH_ON_REMOVE
            | DDD_NO_BROADCAST_SYSTEM,
        PCWSTR(drive.as_ptr()),
        PCWSTR(target.as_ptr()),
    )
    .map_err(|_| "office.mapping.remove")?;
    if query_targets(&mapping.drive)?
        .iter()
        .any(|current| current.eq_ignore_ascii_case(&mapping.target))
    {
        return Err("office.mapping.removeIncomplete".into());
    }
    Ok(())
}

fn valid_run_id(value: &str) -> bool {
    value.len() == 36
        && value.chars().enumerate().all(|(index, character)| {
            if [8, 13, 18, 23].contains(&index) {
                character == '-'
            } else {
                character.is_ascii_hexdigit()
            }
        })
        && value.as_bytes()[14] == b'7'
}

fn validate_journal(journal: &Journal) -> Result<()> {
    if !valid_run_id(&journal.run_id) || journal.mappings.len() != 3 {
        return Err("office.mapping.journalInvalid".into());
    }
    let mut seen = std::collections::BTreeSet::new();
    for mapping in &journal.mappings {
        if mapping.drive.len() != 2
            || !mapping.drive.ends_with(':')
            || !mapping.drive.as_bytes()[0].is_ascii_alphabetic()
            || !seen.insert(mapping.drive.to_ascii_uppercase())
            || !mapping.target.starts_with(r"\??\")
            || mapping.target.starts_with(r"\??\UNC\")
        {
            return Err("office.mapping.journalInvalid".into());
        }
    }
    Ok(())
}

unsafe fn remove_journal(root: &Path, journal: &Journal) -> Result<()> {
    validate_journal(journal)?;
    for mapping in &journal.mappings {
        remove_exact(mapping)?;
    }
    let path = root.join(format!("{}.json", journal.run_id));
    if path.exists() {
        fs::remove_file(path).map_err(|_| "office.mapping.journalRemove")?;
    }
    Ok(())
}

/// Reclaim only mappings recorded by TapKit whose per-run mutex has no live owner.
/// A terminated helper leaves the journal; the next helper invocation performs recovery.
pub unsafe fn recover_stale() -> Result<()> {
    let root = match std::env::var_os("LOCALAPPDATA") {
        Some(local) => PathBuf::from(local).join("TapKit/office-device-leases"),
        None => return Ok(()),
    };
    if !root.exists() {
        return Ok(());
    }
    let _allocation = allocation_lock()?;
    let entries = fs::read_dir(&root).map_err(|_| "office.mapping.journalRead")?;
    for entry in entries {
        let entry = entry.map_err(|_| "office.mapping.journalRead")?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if name.ends_with(".json.tmp") {
            fs::remove_file(path).map_err(|_| "office.mapping.tempRemove")?;
            continue;
        }
        if !name.ends_with(".json") {
            continue;
        }
        let journal: Journal = serde_json::from_slice(
            &fs::read(&path).map_err(|_| "office.mapping.journalRead")?,
        )
        .map_err(|_| "office.mapping.journalInvalid")?;
        validate_journal(&journal)?;
        if name != format!("{}.json", journal.run_id) {
            return Err("office.mapping.journalNameMismatch".into());
        }
        let lease_name = format!("Local\\TapKit.OfficeLease.v1.{}", journal.run_id);
        let Some(_lease) = acquire_mutex(&lease_name, 0)? else {
            continue;
        };
        remove_journal(&root, &journal)?;
    }
    Ok(())
}

unsafe fn persist_journal(root: &Path, journal: &Journal) -> Result<PathBuf> {
    let final_path = root.join(format!("{}.json", journal.run_id));
    let temp_path = root.join(format!("{}.json.tmp", journal.run_id));
    let bytes = serde_json::to_vec(journal).map_err(|_| "office.mapping.journalEncode")?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp_path)
        .map_err(|_| "office.mapping.journalCreate")?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "office.mapping.journalWrite")?;
    if final_path.exists() {
        let _ = fs::remove_file(&temp_path);
        return Err("office.mapping.journalExists".into());
    }
    fs::rename(&temp_path, &final_path).map_err(|_| "office.mapping.journalCommit")?;
    Ok(final_path)
}

unsafe fn create_mappings(run_id: &str, roots: [&Path; 3]) -> Result<Vec<Mapping>> {
    let _allocation = allocation_lock()?;
    let root = journal_root()?;
    let mut mappings = Vec::with_capacity(3);
    for drive_letter in "ZYXWVUTSRQPONMLKJIHGFED".chars() {
        let drive = format!("{drive_letter}:");
        if !query_targets(&drive)?.is_empty() {
            continue;
        }
        let path = roots[mappings.len()];
        let target_path = path.to_string_lossy().replace('/', "\\");
        if !target_path.as_bytes().get(1..3).is_some_and(|v| v == b":\\") {
            return Err("office.mapping.localPathRequired".into());
        }
        mappings.push(Mapping {
            drive,
            target: format!(r"\??\{target_path}"),
        });
        if mappings.len() == 3 {
            break;
        }
    }
    if mappings.len() != 3 {
        return Err("office.mapping.driveExhausted".into());
    }
    let journal = Journal {
        run_id: run_id.to_owned(),
        mappings: mappings.clone(),
    };
    validate_journal(&journal)?;
    persist_journal(&root, &journal)?;
    for mapping in &journal.mappings {
        if let Err(error) = define(mapping) {
            let cleanup = remove_journal(&root, &journal);
            return match cleanup {
                Ok(()) => Err(error),
                Err(cleanup) => Err(format!("{error};{cleanup}")),
            };
        }
        let targets = match query_targets(&mapping.drive) {
            Ok(targets) => targets,
            Err(error) => {
                let cleanup = remove_journal(&root, &journal);
                return match cleanup {
                    Ok(()) => Err(error),
                    Err(cleanup) => Err(format!("{error};{cleanup}")),
                };
            }
        };
        if targets.first().is_none_or(|target| !target.eq_ignore_ascii_case(&mapping.target)) {
            let cleanup = remove_journal(&root, &journal);
            return match cleanup {
                Ok(()) => Err("office.mapping.aliasConflict".into()),
                Err(cleanup) => Err(format!("office.mapping.aliasConflict;{cleanup}")),
            };
        }
    }
    Ok(mappings)
}

impl Lease {
    unsafe fn create(run_id: &str, roots: [&Path; 3]) -> Result<Self> {
        let _lease_lock = create_lease_mutex(run_id)?;
        let root = journal_root()?;
        create_mappings(run_id, roots)?;
        let journal_path = root.join(format!("{run_id}.json"));
        let journal = serde_json::from_slice(
            &fs::read(&journal_path).map_err(|_| "office.mapping.journalRead")?,
        )
        .map_err(|_| "office.mapping.journalInvalid")?;
        Ok(Self {
            journal_path,
            journal,
            _lease_lock,
        })
    }

    unsafe fn cleanup(self) -> Result<()> {
        let root = self
            .journal_path
            .parent()
            .ok_or("office.mapping.journalParent")?;
        let _allocation = allocation_lock()?;
        remove_journal(root, &self.journal)
    }
}

fn alias_root(mapping: &Mapping) -> String {
    format!("{}\\", mapping.drive)
}

/// Launch the version-locked LibreOfficeKit bridge inside the same AppContainer path as other
/// runtimes. The caller supplies only a validated source basename; the helper owns the DLL API,
/// mapped drive leases, and the fixed conversion script.
pub unsafe fn execute(request: &Request, control: &std::sync::mpsc::Receiver<Vec<u8>>) -> Result<serde_json::Value> {
    let office = request
        .payload
        .office
        .as_ref()
        .ok_or("office.requestMissing")?;
    let filename = &office.filename;
    let extension = Path::new(filename)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if filename.is_empty()
        || filename.chars().any(|character| {
            character.is_control() || ['/', '\\', ':', '<', '>', '"', '|', '?', '*'].contains(&character)
        })
        || filename.ends_with([' ', '.'])
        || !["docx", "xlsx", "pptx"].contains(&extension.as_str())
        || filename.len() > 255
        || filename
            .split('.')
            .next()
            .is_some_and(|stem| ["con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9"].contains(&stem.to_ascii_lowercase().as_str()))
    {
        return Err("office.filename".into());
    }
    let runtime = PinnedPath::open_scoped(&request.payload.runtime_root, true, "office.runtime")?;
    let input = PinnedPath::open_scoped(&request.payload.input_root, true, "office.input")?;
    let workspace = PinnedPath::open_scoped(&request.payload.workspace, true, "office.workspace")?;
    let executable =
        PinnedPath::open_scoped(&request.payload.executable, false, "office.executable")?;
    let expected_python = runtime.path.join("program").join("python.exe");
    let source = input.path.join(filename);
    let _source = PinnedPath::open_scoped(&source.to_string_lossy(), false, "office.source")?;
    let source_info = fs::metadata(&source).map_err(|_| "office.sourceInfo")?;
    if !executable
        .path
        .to_string_lossy()
        .eq_ignore_ascii_case(&expected_python.to_string_lossy())
    {
        return Err("office.executablePath".into());
    }
    if source.extension().and_then(|value| value.to_str())
        .is_none_or(|value| !value.eq_ignore_ascii_case(&extension))
    {
        return Err("office.sourceExtension".into());
    }
    if !crate::sandbox::within(&executable.path, &runtime.path) {
        return Err("office.executableOutsideRuntime".into());
    }
    if crate::sandbox::within(&workspace.path, &runtime.path) {
        return Err("office.workspaceInsideRuntime".into());
    }
    if crate::sandbox::within(&runtime.path, &workspace.path) {
        return Err("office.runtimeInsideWorkspace".into());
    }
    if crate::sandbox::within(&input.path, &workspace.path) {
        return Err("office.inputInsideWorkspace".into());
    }
    if crate::sandbox::within(&workspace.path, &input.path) {
        return Err("office.workspaceInsideInput".into());
    }
    if crate::sandbox::within(&runtime.path, &input.path) {
        return Err("office.runtimeInsideInput".into());
    }
    if crate::sandbox::within(&input.path, &runtime.path) {
        return Err("office.inputInsideRuntime".into());
    }
    if input.path.to_string_lossy().eq_ignore_ascii_case(&workspace.path.to_string_lossy()) {
        return Err("office.inputEqualsWorkspace".into());
    }
    if runtime.path.to_string_lossy().eq_ignore_ascii_case(&input.path.to_string_lossy()) {
        return Err("office.runtimeEqualsInput".into());
    }
    if runtime.path.to_string_lossy().eq_ignore_ascii_case(&workspace.path.to_string_lossy()) {
        return Err("office.runtimeEqualsWorkspace".into());
    }
    if !source_info.is_file() {
        return Err("office.sourceNotFile".into());
    }
    if source_info.len() > 100 * 1024 * 1024 {
        return Err("office.sourceTooLarge".into());
    }
    let lease = Lease::create(
        &request.run_id,
        [&runtime.path, &workspace.path, &input.path],
    )?;
    let mut isolated = request.clone();
    isolated.operation = "diagnostic.execute".into();
    isolated.payload.office = None;
    isolated.payload.terminal = false;
    isolated.payload.args = vec![
        "-c".into(),
        include_str!("lok_worker.py").into(),
        alias_root(&lease.journal.mappings[0]),
        alias_root(&lease.journal.mappings[1]),
        alias_root(&lease.journal.mappings[2]),
        filename.clone(),
    ];
    let workspace_alias = alias_root(&lease.journal.mappings[1]);
    let result = crate::sandbox::execute_with_workspace_alias(
        &isolated,
        control,
        Some(&workspace_alias),
    );
    let cleanup = lease.cleanup();
    match (result, cleanup) {
        (Ok(value), Ok(())) => Ok(value),
        (Err(error), Ok(())) | (Ok(_), Err(error)) => Err(error),
        (Err(error), Err(cleanup)) => Err(format!("{error};{cleanup}")),
    }
}
