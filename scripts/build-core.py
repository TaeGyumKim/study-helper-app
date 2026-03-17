#!/usr/bin/env python3
"""
Python 코어를 PyInstaller로 번들링한다.

사용법:
    python scripts/build-core.py          # 현재 플랫폼용 빌드
    python scripts/build-core.py --clean  # 빌드 캐시 삭제 후 빌드

출력:
    python-core/study-helper-core[.exe]   ← Electron 앱에 포함할 바이너리

참고:
    - faster-whisper(CTranslate2), cryptography 등 네이티브 패키지 포함
    - ffmpeg는 별도 번들 (이 스크립트에서 다운로드)
    - Whisper 모델은 런타임에 다운로드됨 (번들 미포함)
"""

import io
import os
import sys

# Windows CI의 cp1252 인코딩 에러 방지
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
import platform
import shutil
import subprocess
from pathlib import Path

# 프로젝트 루트 (study-helper-app/)
APP_ROOT = Path(__file__).parent.parent
# CI: STUDY_HELPER_CORE_DIR 환경변수 / 로컬: 형제 디렉토리
CORE_ROOT = Path(os.environ.get("STUDY_HELPER_CORE_DIR", str(APP_ROOT.parent / "study-helper")))
OUTPUT_DIR = APP_ROOT / "python-core"
DIST_DIR = APP_ROOT / "build" / "pyinstaller-dist"
WORK_DIR = APP_ROOT / "build" / "pyinstaller-work"


def check_core_exists():
    if not CORE_ROOT.exists():
        print(f"[ERROR] 코어 프로젝트를 찾을 수 없습니다: {CORE_ROOT}")
        print("        study-helper와 study-helper-app이 같은 디렉토리에 있어야 합니다.")
        sys.exit(1)


def build_pyinstaller():
    """PyInstaller로 Python 코어를 빌드한다."""
    entry_point = CORE_ROOT / "src" / "api" / "server.py"
    if not entry_point.exists():
        print(f"[ERROR] 진입점 파일 없음: {entry_point}")
        sys.exit(1)

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onedir",
        "--name", "study-helper-core",
        "--distpath", str(DIST_DIR),
        "--workpath", str(WORK_DIR),
        "--noconfirm",
        # 필수 데이터/패키지 수집
        "--collect-data", "faster_whisper",
        "--collect-binaries", "ctranslate2",
        "--collect-data", "ctranslate2",
        "--collect-data", "certifi",
        # hidden imports
        "--hidden-import", "uvicorn.logging",
        "--hidden-import", "uvicorn.loops.auto",
        "--hidden-import", "uvicorn.protocols.http.auto",
        "--hidden-import", "uvicorn.protocols.websockets.auto",
        "--hidden-import", "uvicorn.lifespan.on",
        "--hidden-import", "src.api.server",
        "--hidden-import", "src.api.routes.config",
        "--hidden-import", "src.api.routes.download",
        "--hidden-import", "src.api.routes.health",
        "--hidden-import", "src.api.routes.notify",
        "--hidden-import", "src.service.download_pipeline",
        "--hidden-import", "src.service.scheduler",
        "--hidden-import", "src.converter.audio_converter",
        "--hidden-import", "src.stt.transcriber",
        "--hidden-import", "src.summarizer.summarizer",
        "--hidden-import", "src.notifier.telegram_notifier",
        "--hidden-import", "src.notifier.deadline_checker",
        "--hidden-import", "src.config",
        "--hidden-import", "src.crypto",
        # 코어 소스 + CHANGELOG.md 포함
        "--add-data", f"{CORE_ROOT / 'src'}{os.pathsep}src",
        "--add-data", f"{CORE_ROOT / 'CHANGELOG.md'}{os.pathsep}.",
        # 콘솔 출력 (디버깅용)
        "--console",
        str(entry_point),
    ]

    print(f"[BUILD] PyInstaller 실행...")
    print(f"        진입점: {entry_point}")
    print(f"        출력: {DIST_DIR}")
    result = subprocess.run(cmd, cwd=str(CORE_ROOT))
    if result.returncode != 0:
        print("[ERROR] PyInstaller 빌드 실패")
        sys.exit(1)


def copy_to_output():
    """빌드 결과를 python-core/ 디렉토리로 복사한다."""
    src_dir = DIST_DIR / "study-helper-core"
    if not src_dir.exists():
        print(f"[ERROR] 빌드 결과를 찾을 수 없습니다: {src_dir}")
        sys.exit(1)

    # 기존 출력 디렉토리 삭제
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)

    shutil.copytree(src_dir, OUTPUT_DIR)
    print(f"[OK] 코어 번들: {OUTPUT_DIR}")

    # 실행 파일 크기
    exe_name = "study-helper-core.exe" if platform.system() == "Windows" else "study-helper-core"
    exe_path = OUTPUT_DIR / exe_name
    if exe_path.exists():
        size_mb = exe_path.stat().st_size / 1024 / 1024
        print(f"     실행 파일: {exe_path.name} ({size_mb:.1f} MB)")

    # 전체 디렉토리 크기
    total = sum(f.stat().st_size for f in OUTPUT_DIR.rglob("*") if f.is_file())
    print(f"     전체 크기: {total / 1024 / 1024:.1f} MB")


def download_ffmpeg():
    """플랫폼별 정적 ffmpeg 바이너리를 다운로드한다."""
    is_win = platform.system() == "Windows"
    ffmpeg_path = OUTPUT_DIR / ("ffmpeg.exe" if is_win else "ffmpeg")
    if ffmpeg_path.exists():
        print(f"[SKIP] ffmpeg 이미 존재: {ffmpeg_path}")
        return

    import urllib.request
    import zipfile
    import tarfile

    if is_win:
        url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
        archive = OUTPUT_DIR / "ffmpeg.zip"
        print(f"[DOWNLOAD] ffmpeg (Windows)...")
        urllib.request.urlretrieve(url, archive)
        with zipfile.ZipFile(archive) as zf:
            for name in zf.namelist():
                if name.endswith("bin/ffmpeg.exe"):
                    with open(ffmpeg_path, "wb") as f:
                        f.write(zf.read(name))
                    break
        archive.unlink()
    elif platform.system() == "Darwin":
        # macOS: evermeet.cx 정적 빌드 (arm64/x64 유니버설)
        url = "https://evermeet.cx/ffmpeg/getrelease/zip"
        archive = OUTPUT_DIR / "ffmpeg.zip"
        print(f"[DOWNLOAD] ffmpeg (macOS)...")
        try:
            urllib.request.urlretrieve(url, archive)
            with zipfile.ZipFile(archive) as zf:
                zf.extract("ffmpeg", OUTPUT_DIR)
            archive.unlink()
            os.chmod(ffmpeg_path, 0o755)
        except Exception as e:
            print(f"[WARN] ffmpeg 자동 다운로드 실패: {e}")
            print("       수동으로 다운로드하세요: brew install ffmpeg")
            print(f"       → {ffmpeg_path} 에 배치하세요")
            return
    else:
        # Linux: johnvansickle 정적 빌드
        arch = "amd64" if platform.machine() == "x86_64" else "arm64"
        url = f"https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-{arch}-static.tar.xz"
        archive = OUTPUT_DIR / "ffmpeg.tar.xz"
        print(f"[DOWNLOAD] ffmpeg (Linux {arch})...")
        try:
            urllib.request.urlretrieve(url, archive)
            with tarfile.open(archive) as tf:
                for member in tf.getmembers():
                    if member.name.endswith("/ffmpeg"):
                        member.name = "ffmpeg"
                        tf.extract(member, OUTPUT_DIR)
                        break
            archive.unlink()
            os.chmod(ffmpeg_path, 0o755)
        except Exception as e:
            print(f"[WARN] ffmpeg 자동 다운로드 실패: {e}")
            print(f"       → {ffmpeg_path} 에 배치하세요")
            return

    if ffmpeg_path.exists():
        print(f"[OK] ffmpeg: {ffmpeg_path}")
    else:
        print(f"[WARN] ffmpeg 다운로드 완료했으나 파일을 찾을 수 없습니다: {ffmpeg_path}")


def main():
    if "--clean" in sys.argv:
        for d in [DIST_DIR, WORK_DIR, OUTPUT_DIR]:
            if d.exists():
                shutil.rmtree(d)
                print(f"[CLEAN] {d}")

    check_core_exists()
    build_pyinstaller()
    copy_to_output()
    download_ffmpeg()
    print("\n[DONE] 코어 빌드 완료!")
    print(f"       electron-builder가 {OUTPUT_DIR}/ 를 앱에 포함합니다.")


if __name__ == "__main__":
    main()
