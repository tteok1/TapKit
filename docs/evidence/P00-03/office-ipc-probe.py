import ctypes as c, os, json, uuid, sys
k=c.WinDLL("kernel32",use_last_error=True)
k.CreateNamedPipeW.argtypes=[c.c_wchar_p,c.c_uint32,c.c_uint32,c.c_uint32,c.c_uint32,c.c_uint32,c.c_uint32,c.c_void_p]
k.CreateNamedPipeW.restype=c.c_void_p
k.CloseHandle.argtypes=[c.c_void_p]
rows=[]
for prefix in ["", "LOCAL\\"]:
    name="\\\\.\\pipe\\"+prefix+"TapKit-P00-03-"+str(uuid.uuid4())
    c.set_last_error(0)
    h=k.CreateNamedPipeW(name,3|0x40000000,6,1,4096,4096,0,None)
    ok=h!=c.c_void_p(-1).value
    rows.append({"kind":"win32", "namespace":prefix or "default", "created":ok, "error":c.get_last_error()})
    if ok:k.CloseHandle(h)
with os.add_dll_directory(sys.argv[1]):
    sal=c.CDLL(os.path.join(sys.argv[1],"sal3.dll"),use_last_error=True)
    sal.rtl_uString_newFromAscii.argtypes=[c.POINTER(c.c_void_p),c.c_char_p]
    sal.rtl_uString_release.argtypes=[c.c_void_p]
    sal.osl_getCurrentSecurity.restype=c.c_void_p
    sal.osl_freeSecurityHandle.argtypes=[c.c_void_p]
    sal.osl_createPipe.argtypes=[c.c_void_p,c.c_int,c.c_void_p]
    sal.osl_createPipe.restype=c.c_void_p
    sal.osl_getLastPipeError.argtypes=[c.c_void_p]
    sal.osl_getLastPipeError.restype=c.c_int
    sal.osl_releasePipe.argtypes=[c.c_void_p]
    s=c.c_void_p()
    sal.rtl_uString_newFromAscii(c.byref(s),("TapKit-P00-03-"+str(uuid.uuid4())).encode())
    security=sal.osl_getCurrentSecurity()
    c.set_last_error(0)
    pipe=sal.osl_createPipe(s,1,security)
    err=c.get_last_error()
    rows.append({"kind":"LibreOffice.sal3.osl_createPipe", "created":bool(pipe), "win32Error":err, "oslError":sal.osl_getLastPipeError(pipe)})
    if pipe:sal.osl_releasePipe(pipe)
    sal.osl_freeSecurityHandle(security)
    sal.rtl_uString_release(s)
print(json.dumps(rows),flush=True)
