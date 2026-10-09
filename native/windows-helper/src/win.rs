use std::mem::size_of;
use windows::{
    Win32::{Foundation::*, Security::*, Security::Authorization::ConvertSidToStringSidW, System::Threading::*},
    core::PWSTR,
};

type Result<T> = std::result::Result<T, String>;

pub struct Handle(pub HANDLE);
impl Drop for Handle {
    fn drop(&mut self) {
        unsafe { let _ = CloseHandle(self.0); }
    }
}

unsafe fn check<T>(result: windows::core::Result<T>, stage: &str) -> Result<T> {
    result.map_err(|error| format!("{stage}:0x{:08x}", error.code().0 as u32))
}

unsafe fn sid_text(sid: PSID) -> Result<String> {
    let mut text = PWSTR::null();
    check(ConvertSidToStringSidW(sid, &mut text), "identity.sid")?;
    let result = text.to_string().map_err(|_| "identity.sidEncoding".into());
    let _ = LocalFree(Some(HLOCAL(text.0.cast())));
    result
}

unsafe fn token_info(token: HANDLE, class: TOKEN_INFORMATION_CLASS) -> Result<Vec<usize>> {
    let mut needed = 0;
    let _ = GetTokenInformation(token, class, None, 0, &mut needed);
    if needed == 0 || needed > 65_536 { return Err("identity.tokenSize".into()); }
    let mut data = vec![0usize; (needed as usize).div_ceil(size_of::<usize>())];
    check(
        GetTokenInformation(token, class, Some(data.as_mut_ptr().cast()), needed, &mut needed),
        "identity.tokenInfo",
    )?;
    Ok(data)
}

pub unsafe fn self_token() -> Result<Handle> {
    let mut token = HANDLE::default();
    check(OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token), "identity.selfToken")?;
    Ok(Handle(token))
}

pub unsafe fn user_sid(token: HANDLE) -> Result<String> {
    let data = token_info(token, TokenUser)?;
    sid_text((*(data.as_ptr() as *const TOKEN_USER)).User.Sid)
}

pub unsafe fn elevated() -> Result<bool> {
    let token = self_token()?;
    let info = token_info(token.0, TokenElevation)?;
    Ok((*(info.as_ptr() as *const TOKEN_ELEVATION)).TokenIsElevated != 0)
}
