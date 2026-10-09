import ctypes as c,os,json
k=c.WinDLL("kernel32",use_last_error=True)
k.CreateFileW.argtypes=[c.c_wchar_p,c.c_ulong,c.c_ulong,c.c_void_p,c.c_ulong,c.c_ulong,c.c_void_p];k.CreateFileW.restype=c.c_void_p
k.GetFinalPathNameByHandleW.argtypes=[c.c_void_p,c.c_wchar_p,c.c_ulong,c.c_ulong]
k.GetLongPathNameW.argtypes=[c.c_wchar_p,c.c_wchar_p,c.c_ulong];k.CloseHandle.argtypes=[c.c_void_p]
cwd=os.getcwd();h=k.CreateFileW(cwd,0,7,None,3,0x02000000,None);b=c.create_unicode_buffer(32768)
n=k.GetFinalPathNameByHandleW(h,b,32768,2);nt=b.value;k.CloseHandle(h)
for path in [cwd,"\\\\?\\"+cwd,"\\\\?\\GLOBALROOT"+nt]:
    out=c.create_unicode_buffer(32768);c.set_last_error(0);n=k.GetLongPathNameW(path,out,32768)
    print(json.dumps({"path":path,"getLong":n,"error":c.get_last_error(),"result":out.value}),flush=True)
