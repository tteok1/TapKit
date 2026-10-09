import ctypes as c, os, sys, json, pathlib, hashlib
p=sys.argv[1];w=pathlib.Path(sys.argv[2]);profile=w/"office-profile";(profile/"user").mkdir(parents=True)
(profile/"user"/"registrymodifications.xcu").write_text('<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item><item oor:path="/org.openoffice.Office.Common/Load"><prop oor:name="UpdateLinks" oor:op="fuse"><value>0</value></prop></item></oor:items>',encoding="utf-8")
os.environ["PATH"]=p+os.pathsep+os.environ.get("PATH","")
os.environ["SAL_LOG"]="+WARN+INFO.lok"
def event(**v): print(json.dumps(v),flush=True)
def uri(path): return path.resolve().as_uri().encode("utf-8")
def method(obj,index,result,*args):
    table=c.cast(obj,c.POINTER(c.c_void_p))[0]
    size=c.cast(table,c.POINTER(c.c_size_t))[0]
    assert size >= (index+1)*c.sizeof(c.c_void_p)
    addr=c.cast(table,c.POINTER(c.c_void_p))[index]
    return c.CFUNCTYPE(result,*args)(addr)
with os.add_dll_directory(p):
    lib=c.CDLL(os.path.join(p,"mergedlo.dll"),use_last_error=True)
    init=lib.libreofficekit_hook_2;init.argtypes=[c.c_char_p,c.c_char_p];init.restype=c.c_void_p
    event(stage="init")
    kit=init(p.encode("utf-8"),uri(profile))
    event(stage="initialized",ok=bool(kit))
    if not kit: sys.exit(2)
    failed=False
    for ext in ["docx","xlsx","pptx"]:
        source=w/("sample."+ext);out=w/("converted-"+ext+".pdf");before=hashlib.sha256(source.read_bytes()).hexdigest()
        event(stage="loading",format=ext)
        doc=method(kit,2,c.c_void_p,c.c_void_p,c.c_char_p)(kit,uri(source))
        if not doc:
            error=method(kit,3,c.c_char_p,c.c_void_p)(kit)
            event(stage="load-failed",format=ext,error=error.decode("utf-8","replace") if error else None);failed=True;continue
        ok=method(doc,2,c.c_int,c.c_void_p,c.c_char_p,c.c_char_p,c.c_char_p)(doc,uri(out),b"pdf",None)
        data=out.read_bytes() if out.exists() else b""
        unchanged=before==hashlib.sha256(source.read_bytes()).hexdigest()
        event(stage="saved",format=ext,ok=bool(ok),bytes=len(data),pdfHeader=data[:5].decode("ascii","replace"),originalUnchanged=unchanged)
        failed=failed or not ok or not data.startswith(b"%PDF-") or not unchanged
        method(doc,1,None,c.c_void_p)(doc)
    event(stage="destroy")
    method(kit,1,None,c.c_void_p)(kit)
    event(stage="done",failed=failed)
    sys.exit(1 if failed else 0)
