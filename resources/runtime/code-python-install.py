"""Offline wheel extraction in AppContainer. No source builds or package code execution."""
import sys, os, zipfile, stat
from pathlib import Path, PurePosixPath
wheel_dir, destination = Path(sys.argv[1]), Path(sys.argv[2])
destination.mkdir(parents=True, exist_ok=True)
total = 0
for wheel in sorted(wheel_dir.glob("*.whl")):
    with zipfile.ZipFile(wheel) as archive:
        entries = archive.infolist()
        if len(entries) > 10000:
            raise ValueError("WHEEL_LIMIT")
        for entry in entries:
            name = entry.filename
            parts = PurePosixPath(name).parts
            mode = entry.external_attr >> 16
            if not parts or name.startswith("/") or "\\" in name or any(p in (".", "..") or ":" in p or p.endswith((" ", ".")) for p in parts) or stat.S_ISLNK(mode):
                raise ValueError("WHEEL_PATH_DENIED")
            if parts[0].endswith(".data"):
                if len(parts) < 3 or parts[1] not in ("purelib", "platlib"):
                    raise ValueError("WHEEL_LAYOUT_UNSUPPORTED")
                parts = parts[2:]
            target = destination.joinpath(*parts)
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            total += entry.file_size
            if total > 500 * 1024 ** 2 or entry.file_size > 100 * 1024 ** 2:
                raise ValueError("WHEEL_LIMIT")
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("xb") as output, archive.open(entry) as source:
                while chunk := source.read(65536):
                    output.write(chunk)
    print("已安装", wheel.name, flush=True)
