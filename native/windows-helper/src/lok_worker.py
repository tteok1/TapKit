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
output_format = sys.argv[5] if len(sys.argv) > 5 else "pdf"
if output_format not in ("pdf", "xlsx") or (output_format == "xlsx" and source.suffix.lower() != ".xlsx"):
    raise RuntimeError("OFFICE_OUTPUT_FORMAT")
output = workspace / (pathlib.Path(filename).stem + "." + output_format)


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
# A drive-root alias ends with a separator. Keep an absolute directory spelling
# without that trailing separator, including for Basic Environ() path joins.
private_home = os.path.join(str(workspace), ".")
for name in ("TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA"):
    os.environ[name] = private_home
os.environ["PATH"] = str(program) + os.pathsep + os.environ.get("PATH", "")
os.environ["SAL_LOK_OPTIONS"] = "unipoll"
os.environ["SAL_LOG"] = "+WARN+INFO.lok"

# Do not depend on optional Windows language packs or host-installed fonts.
# FR_PRIVATE affects only this isolated conversion process, never system settings.
font = workspace / "tapkit-office-font.otf"
font_hash = "2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b"
if not font.is_file() or hashlib.sha256(font.read_bytes()).hexdigest() != font_hash:
    raise RuntimeError("OFFICE_FONT_INVALID")
gdi = c.WinDLL("gdi32", use_last_error=True)
gdi.AddFontResourceExW.argtypes = [c.c_wchar_p, c.c_uint32, c.c_void_p]
gdi.AddFontResourceExW.restype = c.c_int
gdi.RemoveFontResourceExW.argtypes = [c.c_wchar_p, c.c_uint32, c.c_void_p]
gdi.RemoveFontResourceExW.restype = c.c_int
if gdi.AddFontResourceExW(str(font), 0x10, None) <= 0:
    raise RuntimeError("OFFICE_FONT_LOAD_FAILED")
emit("font_loaded", family="Noto Sans CJK SC", private=True)
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
        )(document, uri(output), output_format.encode("ascii"), None)
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
elif not gdi.RemoveFontResourceExW(str(font), 0x10, None):
    failures.append("OFFICE_FONT_UNLOAD_FAILED")
if failures:
    emit("finished", ok=False, failures=failures, pollCount=counts["poll"])
    sys.exit(1)
emit("finished", ok=True, pollCount=counts["poll"])
del library
del dll_directory
