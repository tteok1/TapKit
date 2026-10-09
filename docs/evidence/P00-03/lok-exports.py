import ctypes as c, os, sys, json
p=sys.argv[1]
with os.add_dll_directory(p):
    lib=c.CDLL(os.path.join(p,"mergedlo.dll"),use_last_error=True)
    print(json.dumps({"stage":"loaded","exports":{n:bool(getattr(lib,n,None)) for n in ["libreofficekit_hook","libreofficekit_hook_2","soffice_main"]}}),flush=True)
