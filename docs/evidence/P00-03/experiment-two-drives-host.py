import ctypes as c,subprocess,sys,json
k=c.WinDLL("kernel32",use_last_error=True);k.DefineDosDeviceW.argtypes=[c.c_uint,c.c_wchar_p,c.c_wchar_p];k.GetLogicalDrives.restype=c.c_uint
maps=[]
try:
 for target in sys.argv[1:3]:
    mask=k.GetLogicalDrives();drive=next(chr(n+65)+":" for n in range(25,16,-1) if not mask&(1<<n))
    if not k.DefineDosDeviceW(8,drive,target):raise c.WinError(c.get_last_error())
    maps.append((drive,target));print(json.dumps({"defined":drive,"target":target}),flush=True)
 r=subprocess.run(sys.argv[3:]+[x[0] for x in maps],timeout=70);exitcode=r.returncode
finally:
 failed=False
 for drive,target in reversed(maps):
    ok=k.DefineDosDeviceW(2|4|8,drive,target);print(json.dumps({"removed":drive,"ok":bool(ok)}),flush=True);failed=failed or not ok
 if failed:raise RuntimeError("Drive cleanup failed")
sys.exit(exitcode)
