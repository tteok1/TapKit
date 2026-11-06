"""Fixed bundled entry point. Executed only in AppContainer, never on the Host."""
import sys, json, runpy, code, os
from pathlib import Path
argv_file = Path(sys.argv[1])
# Timestamp/size-based .pyc files can survive a same-second, same-size repair.
# Each invocation has a unique Core-owned argv file in the read-only input root;
# use its private, empty cache namespace and never write new bytecode there.
sys.pycache_prefix = str(argv_file.with_suffix(".pycache"))
sys.dont_write_bytecode = True
args = json.loads(argv_file.read_text(encoding="utf-8"))
sys.path[:0] = [os.getcwd(), sys.argv[2]]
if not args:
    code.interact(banner="Python · TapKit 隔离终端", local={"__name__": "__main__"})
elif args[0] == "-m" and len(args) >= 2:
    sys.argv = args[1:]
    runpy.run_module(args[1], run_name="__main__", alter_sys=True)
elif args[0] == "-c" and len(args) >= 2:
    sys.argv = ["-c"] + args[2:]
    exec(compile(args[1], "<command>", "exec"), {"__name__": "__main__"})
elif not args[0].startswith("-"):
    sys.argv = args
    runpy.run_path(args[0], run_name="__main__")
else:
    raise SystemExit("此 Python 运行参数尚未支持；使用文件路径、-m 或 -c。")
