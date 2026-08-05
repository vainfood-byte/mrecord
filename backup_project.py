"""프로젝트 소스를 복구 가능한 ZIP으로 백업합니다."""

from __future__ import annotations

import zipfile
from datetime import datetime
from pathlib import Path

# 백업에서 제외할 디렉터리 / 파일 이름
EXCLUDE_DIR_NAMES = {
    "node_modules",
    ".git",
    "dist",
    "build",
    "out",
    "release",
    ".cache",
    "temp",
    "tmp",
    ".vite",
    ".turbo",
    "coverage",
    "__pycache__",
    ".idea",
    ".vscode",
}

EXCLUDE_FILE_SUFFIXES = {
    ".zip",
    ".log",
    ".pyc",
}

def should_skip_dir(name: str) -> bool:
    return name in EXCLUDE_DIR_NAMES or name.startswith(".git")


def should_skip_file(path: Path) -> bool:
    name = path.name.lower()
    suffix = path.suffix.lower()
    if suffix == ".zip" and name.startswith("backup_"):
        return True
    if suffix in {".log", ".pyc"}:
        return True
    return False


def create_backup(project_root: Path) -> tuple[Path, int]:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_name = f"backup_{stamp}.zip"
    zip_path = project_root / zip_name

    file_count = 0
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in project_root.rglob("*"):
            if not path.is_file():
                continue

            rel = path.relative_to(project_root)
            # 제외 디렉터리 경로 검사
            if any(should_skip_dir(part) for part in rel.parts[:-1]):
                continue
            if should_skip_file(path):
                continue
            # 방금 쓰는 zip 자신은 건너뜀
            if path.resolve() == zip_path.resolve():
                continue

            zf.write(path, arcname=str(rel).replace("\\", "/"))
            file_count += 1

    return zip_path, file_count


def main() -> None:
    root = Path(__file__).resolve().parent
    zip_path, file_count = create_backup(root)
    size_mb = zip_path.stat().st_size / (1024 * 1024)
    print("백업 완료")
    print(f"파일명: {zip_path.name}")
    print(f"경로: {zip_path}")
    print(f"포함 파일 수: {file_count}")
    print(f"크기: {size_mb:.2f} MB")


if __name__ == "__main__":
    main()
