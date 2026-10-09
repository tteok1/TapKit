import ctypes as c,subprocess,sys,json
k=c.WinDLL("kernel32",use_last_error=True);k.DefineDosDeviceW.argtypes=[c.c_uint,c.c_wchar_p,c.c_wchar_p];k.GetLogicalDrives.restype=c.c_uint
mask=k.GetLogicalDrives();drive=next(chr(n+65)+":" for n in range(25,16,-1) if not mask&(1<<n))
target=sys.argv[1]
if not k.DefineDosDeviceW(8,drive,target):raise c.WinError(c.get_last_error())
try:
 print(json.dumps({"temporaryDrive":drive,"target":target}),flush=True)
 r=subprocess.run(sys.argv[2:]+[drive],timeout=70);sys.exitcode=r.returncode
finally:
 ok=k.DefineDosDeviceW(2|4|8,drive,target)
 print(json.dumps({"removed":bool(ok),"error":c.get_last_error() if not ok else 0}),flush=True)
 if not ok:raise c.WinError(c.get_last_error())
sys.exit(sys.exitcode)
