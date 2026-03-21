from __future__ import annotations

"""HanDrive HTML companion asset helper.

``foo.html`` 을 미리보기할 때 같은 폴더의 ``foo.css``, ``foo.js`` 를 자동으로 찾아
함께 주입하기 위한 읽기 helper만 모아 둔다.
"""

from pathlib import Path
from typing import Callable


def _read_text_file(path_obj: Path) -> str:
    """Read UTF-8 text defensively so preview helpers can treat decode failure as 'asset absent'."""
    try:
        return path_obj.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ""


def _build_companion_paths(base_path: Path) -> tuple[Path, Path]:
    """Return the same-stem CSS/JS siblings used by HTML live preview injection."""
    stem_path = base_path.with_suffix("")
    return stem_path.with_suffix(".css"), stem_path.with_suffix(".js")


def load_local_html_companion_assets(
    source_path: Path,
    *,
    can_read_path: Callable[[Path], bool] | None = None,
) -> tuple[str, str]:
    """실제 파일 시스템의 HTML companion asset 을 읽는다."""
    if source_path.suffix.lower() != ".html":
        return "", ""

    companion_css_path, companion_js_path = _build_companion_paths(source_path)

    def _load(path_obj: Path) -> str:
        if not path_obj.exists() or not path_obj.is_file():
            return ""
        if can_read_path is not None and not can_read_path(path_obj):
            return ""
        return _read_text_file(path_obj)

    return _load(companion_css_path), _load(companion_js_path)


def load_repo_html_companion_assets(
    repo_relative_path: str,
    *,
    path_exists: Callable[[str], bool],
    read_text_file: Callable[[str], str],
) -> tuple[str, str]:
    """repo branch 내부 가상 경로의 HTML companion asset 을 읽는다."""
    target_path = Path(str(repo_relative_path or ""))
    if target_path.suffix.lower() != ".html":
        return "", ""

    companion_css_path, companion_js_path = _build_companion_paths(target_path)

    def _load(path_obj: Path) -> str:
        relative_path = path_obj.as_posix()
        if not path_exists(relative_path):
            return ""
        return read_text_file(relative_path)

    return _load(companion_css_path), _load(companion_js_path)
