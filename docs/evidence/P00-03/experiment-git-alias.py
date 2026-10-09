import ctypes as c,os,sys,json,subprocess
k=c.WinDLL("kernel32",use_last_error=True);k.GetLongPathNameW.argtypes=[c.c_wchar_p,c.c_wchar_p,c.c_ulong]
git=sys.argv[1];workspace=sys.argv[2];drive=sys.argv[3]
os.chdir(drive+"\\")
b=c.create_unicode_buffer(32768);c.set_last_error(0);n=k.GetLongPathNameW(os.getcwd(),b,32768)
print(json.dumps({"stage":"cwd","cwd":os.getcwd(),"longResult":b.value,"longLength":n,"error":c.get_last_error()}),flush=True)
for args in [["status","--porcelain=v1"],["diff","--no-ext-diff","--no-textconv","--","readme.txt"]]:
    command=[git,"-c","safe.directory="+os.getcwd(),"-c","core.hooksPath=NUL","-c","core.fsmonitor=false","-c","credential.helper=","-c","protocol.allow=never"]+args
    r=subprocess.run(command,stdin=subprocess.DEVNULL,stdout=sys.stdout,stderr=sys.stderr,timeout=8)
    print(json.dumps({"stage":args[0],"exitCode":r.returncode}),flush=True)
