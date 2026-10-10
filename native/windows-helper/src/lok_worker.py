import ctypes as c
import hashlib
import json
import os
import pathlib
import sys
import threading
import time
import traceback

runtime_root = pathlib.Path(sys.argv[1])
workspace = pathlib.Path(sys.argv[2])
input_root = pathlib.Path(sys.argv[3])
filename = sys.argv[4]
source = input_root / filename
output = workspace / (pathlib.Path(filename).stem + ".pdf")


def emit(stage, **data):
    print(json.dumps({"stage": stage, **data}, ensure_ascii=False), flush=True)


def uri(path):
    # Native-owned drive leases already pin these exact directories. Retain the
    # short aliases in LOK URLs instead of expanding them into deep host paths.
    return path.absolute().as_uri().encode("utf-8")


def method(obj, index, result, *args):
    table = c.cast(obj, c.POINTER(c.c_void_p))[0]
    address = c.cast(table, c.POINTER(c.c_void_p))[index]
    return c.CFUNCTYPE(result, *args)(address)


if not source.is_file() or output.exists():
    raise RuntimeError("OFFICE_SOURCE_OR_OUTPUT_INVALID")

program = runtime_root / "program"
os.chdir(workspace)
for name in ("TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA"):
    os.environ[name] = str(workspace)
os.environ["PATH"] = str(program) + os.pathsep + os.environ.get("PATH", "")
os.environ["SAL_LOK_OPTIONS"] = "unipoll"
os.environ["SAL_LOG"] = "+WARN+INFO.lok"
dll_directory = os.add_dll_directory(str(program))
library = c.CDLL(str(program / "mergedlo.dll"), use_last_error=True)
initialize = library.libreofficekit_hook_2
initialize.argtypes = [c.c_char_p, c.c_char_p]
initialize.restype = c.c_void_p

profile = workspace / "office-profile"
emit("initialize_started")
# Match the verified LibreOffice 26.2.6.3 LOK probe: hook_2 receives the program directory.
kit = initialize(str(program).encode("utf-8"), uri(profile))
if not kit:
    raise RuntimeError("OFFICE_LOK_INITIALIZE_FAILED")
emit("initialize_finished")

wake = threading.Event()
failures = []
counts = {"poll": 0}


@c.CFUNCTYPE(c.c_int, c.c_void_p, c.c_int)
def poll(_data, timeout):
    counts["poll"] += 1
    wake.wait(min(max(timeout / 1_000_000, 0), 0.05))
    wake.clear()
    return 0


@c.CFUNCTYPE(None, c.c_void_p)
def awake(_data):
    wake.set()


def convert():
    document = None
    try:
        # LibreOffice's verified unipoll sequence starts polling after the first load request.
        # Let the main thread enter runLoop before this worker queues that request.
        time.sleep(2)
        before = hashlib.sha256(source.read_bytes()).hexdigest()
        emit("load_started", format=source.suffix.lower()[1:])
        document = method(kit, 4, c.c_void_p, c.c_void_p, c.c_char_p, c.c_char_p)(
            kit,
            uri(source),
            b"MacroSecurityLevel=3,EnableMacrosExecution=false",
        )
        if not document:
            raise RuntimeError("OFFICE_LOK_DOCUMENT_LOAD_FAILED")
        saved = method(
            document,
            2,
            c.c_int,
            c.c_void_p,
            c.c_char_p,
            c.c_char_p,
            c.c_char_p,
        )(document, uri(output), b"pdf", None)
        after = hashlib.sha256(source.read_bytes()).hexdigest()
        if not saved or after != before or not output.is_file():
            raise RuntimeError("OFFICE_LOK_PDF_SAVE_FAILED")
        emit("converted", format=source.suffix.lower()[1:], bytes=output.stat().st_size)
    except BaseException as error:
        failures.append(str(error) or type(error).__name__)
        emit("conversion_failed", error=failures[-1])
    finally:
        if document:
            method(document, 1, None, c.c_void_p)(document)
        method(kit, 1, None, c.c_void_p)(kit)
        wake.set()


worker = threading.Thread(target=convert, name="tapkit-lok-convert", daemon=True)
worker.start()
emit("loop_started")
method(kit, 13, None, c.c_void_p, c.c_void_p, c.c_void_p, c.c_void_p)(
    kit,
    c.cast(poll, c.c_void_p),
    c.cast(awake, c.c_void_p),
    None,
)
worker.join(5)
if worker.is_alive():
    failures.append("OFFICE_LOK_WORKER_STUCK")
if failures:
    emit("finished", ok=False, failures=failures, pollCount=counts["poll"])
    sys.exit(1)
emit("finished", ok=True, pollCount=counts["poll"])
del library
del dll_directory
