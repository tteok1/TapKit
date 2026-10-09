import ctypes as c,os,sys,json,pathlib,threading,time,hashlib
p=sys.argv[1];w=pathlib.Path(sys.argv[2]);os.chdir(w);inputroot=pathlib.Path(sys.argv[3]);outside=pathlib.Path(sys.argv[4]);profile=w/"office-profile";(profile/"user").mkdir(parents=True)
(profile/"user"/"registrymodifications.xcu").write_text('<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item></oor:items>',encoding="utf-8")
os.environ["PATH"]=p+os.pathsep+os.environ.get("PATH","");os.environ["SAL_LOK_OPTIONS"]="unipoll";os.environ["SAL_LOG"]="+WARN+INFO.lok"
def event(**v):print(json.dumps(v),flush=True)
def uri(v):return v.resolve().as_uri().encode("utf-8")
def method(obj,index,result,*args):
    table=c.cast(obj,c.POINTER(c.c_void_p))[0];addr=c.cast(table,c.POINTER(c.c_void_p))[index]
    return c.CFUNCTYPE(result,*args)(addr)
ctx=os.add_dll_directory(p);lib=c.CDLL(os.path.join(p,"mergedlo.dll"),use_last_error=True);init=lib.libreofficekit_hook_2;init.argtypes=[c.c_char_p,c.c_char_p];init.restype=c.c_void_p
event(stage="init");kit=init(p.encode("utf-8"),uri(profile));event(stage="initialized",ok=bool(kit))
if not kit:sys.exit(2)
failures=[]
def denied(label,fn):
    try:
        fn()
        event(stage="boundary",label=label,denied=False)
        failures.append(label)
    except PermissionError as e:
        event(stage="boundary",label=label,denied=True,winerror=e.winerror)
def probe_write(path):
    with path.open("xb") as f:f.write(b"unexpected")
    path.unlink()
denied("input-read-only",lambda:probe_write(inputroot/"tapkit-write-probe.tmp"))
denied("runtime-read-only",lambda:probe_write(pathlib.Path(p)/"tapkit-write-probe.tmp"))
denied("outside-read",lambda:outside.read_bytes())
denied("outside-write",lambda:probe_write(outside.parent/"tapkit-write-probe.tmp"))
import socket
def connect():
    with socket.socket() as s:
        s.settimeout(3);s.connect(("127.0.0.1",int(sys.argv[5])))
try:
    connect();failures.append("loopback");event(stage="boundary",label="loopback",denied=False)
except (PermissionError,TimeoutError) as e:
    event(stage="boundary",label="loopback",denied=True,reason=type(e).__name__)
wake=threading.Event();pollCount=0
@c.CFUNCTYPE(c.c_int,c.c_void_p,c.c_int)
def poll(data,timeout):
    global pollCount
    pollCount+=1
    if pollCount in [1,10,100]:event(stage="poll",count=pollCount,timeout=timeout)
    wake.wait(min(max(timeout/1e6,0),0.05));wake.clear();return 0
@c.CFUNCTYPE(None,c.c_void_p)
def awaken(data):wake.set()
def worker():
    time.sleep(2)
    for ext in ["docx","xlsx","pptx"]:
        event(stage="load",format=ext)
        source=inputroot/("sample."+ext);out=w/("converted-"+ext+".pdf")
        before=hashlib.sha256(source.read_bytes()).hexdigest()
        doc=method(kit,4,c.c_void_p,c.c_void_p,c.c_char_p,c.c_char_p)(kit,uri(source),b"MacroSecurityLevel=3,EnableMacrosExecution=false")
        event(stage="loaded",format=ext,ok=bool(doc))
        if not doc:failures.append("load-"+ext)
        if doc:
            ok=method(doc,2,c.c_int,c.c_void_p,c.c_char_p,c.c_char_p,c.c_char_p)(doc,uri(out),b"pdf",None)
            event(stage="save",format=ext,ok=ok,bytes=out.stat().st_size if out.exists() else 0,originalUnchanged=before==hashlib.sha256(source.read_bytes()).hexdigest())
            data=out.read_bytes() if out.exists() else b""
            if not ok or not data.startswith(b"%PDF-") or before!=hashlib.sha256(source.read_bytes()).hexdigest():failures.append("save-"+ext)
            method(doc,1,None,c.c_void_p)(doc)
    event(stage="destroy");method(kit,1,None,c.c_void_p)(kit);event(stage="destroyed")
t=threading.Thread(target=worker,daemon=True);t.start()
event(stage="runLoop")
method(kit,13,None,c.c_void_p,c.c_void_p,c.c_void_p,c.c_void_p)(kit,c.cast(poll,c.c_void_p),c.cast(awaken,c.c_void_p),None)
event(stage="loopExited");t.join(5)
event(stage="result",failures=failures);sys.exit(1 if failures or t.is_alive() else 0)
