from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_http_methods

from .views import apply_ui_context, render_markdown_safely, resolve_ui_lang

DOCS_FILE_EXTENSION = ".md"
INVALID_NAME_PATTERN = re.compile(r"[\\/]")


def docs_root_dir() -> Path:
    root = Path(settings.MEDIA_ROOT) / "docs"
    root.mkdir(parents=True, exist_ok=True)
    return root


def normalize_relative_path(raw_path: str | None, allow_empty: bool = True) -> str:
    value = (raw_path or "").strip().replace("\\", "/")
    value = value.strip("/")
    if not value:
        if allow_empty:
            return ""
        raise ValueError("경로를 입력해주세요.")

    parts = []
    for part in value.split("/"):
        stripped = part.strip()
        if not stripped or stripped == ".":
            continue
        if stripped == "..":
            raise ValueError("상위 경로(..)는 사용할 수 없습니다.")
        parts.append(stripped)

    normalized = "/".join(parts)
    if not normalized and not allow_empty:
        raise ValueError("경로를 입력해주세요.")
    return normalized


def resolve_path(relative_path: str | None, must_exist: bool = True) -> tuple[Path, str]:
    root = docs_root_dir().resolve()
    normalized = normalize_relative_path(relative_path)
    candidate = (root / normalized).resolve()

    if candidate != root and root not in candidate.parents:
        raise ValueError("허용되지 않은 경로입니다.")

    if must_exist and not candidate.exists():
        raise FileNotFoundError("경로를 찾을 수 없습니다.")

    return candidate, normalized


def normalize_markdown_relative_path(raw_path: str | None, must_exist: bool = True) -> tuple[Path, str]:
    normalized = normalize_relative_path(raw_path, allow_empty=False)
    if not normalized.lower().endswith(DOCS_FILE_EXTENSION):
        normalized = f"{normalized}{DOCS_FILE_EXTENSION}"

    path_obj, rel_path = resolve_path(normalized, must_exist=must_exist)
    if must_exist:
        if not path_obj.is_file() or path_obj.suffix.lower() != DOCS_FILE_EXTENSION:
            raise FileNotFoundError("마크다운 파일을 찾을 수 없습니다.")

    return path_obj, rel_path


def validate_name(name: str | None, *, for_file: bool = False) -> str:
    candidate = (name or "").strip()
    if not candidate:
        raise ValueError("이름을 입력해주세요.")
    if candidate in {".", ".."}:
        raise ValueError("사용할 수 없는 이름입니다.")
    if INVALID_NAME_PATTERN.search(candidate):
        raise ValueError("이름에 슬래시를 사용할 수 없습니다.")

    if for_file and candidate.lower().endswith(DOCS_FILE_EXTENSION):
        candidate = candidate[: -len(DOCS_FILE_EXTENSION)].strip()
        if not candidate:
            raise ValueError("파일명을 입력해주세요.")

    return candidate


def relative_from_root(path_obj: Path) -> str:
    root = docs_root_dir().resolve()
    return path_obj.resolve().relative_to(root).as_posix()


def markdown_slug_from_relative(relative_path: str) -> str:
    if relative_path.lower().endswith(DOCS_FILE_EXTENSION):
        return relative_path[: -len(DOCS_FILE_EXTENSION)]
    return relative_path


def build_entry(path_obj: Path) -> dict:
    rel_path = relative_from_root(path_obj)
    is_dir = path_obj.is_dir()
    data = {
        "name": path_obj.name,
        "path": rel_path,
        "type": "dir" if is_dir else "file",
    }

    if is_dir:
        try:
            data["has_children"] = any(path_obj.iterdir())
        except OSError:
            data["has_children"] = False
    else:
        data["slug_path"] = markdown_slug_from_relative(rel_path)

    return data


def list_directory_entries(directory: Path) -> list[dict]:
    entries = []
    for child in sorted(directory.iterdir(), key=lambda p: (0 if p.is_dir() else 1, p.name.lower())):
        if child.is_dir():
            entries.append(build_entry(child))
            continue
        if child.is_file() and child.suffix.lower() == DOCS_FILE_EXTENSION:
            entries.append(build_entry(child))
    return entries


def list_all_directories() -> list[str]:
    root = docs_root_dir()
    directories = [""]
    for directory in sorted([p for p in root.rglob("*") if p.is_dir()], key=lambda p: p.as_posix().lower()):
        directories.append(relative_from_root(directory))
    return directories


def docs_common_context(request, ui_lang):
    context = {}
    apply_ui_context(request, context, ui_lang)
    context.update(
        {
            "docs_base_url": reverse("main:docs_root"),
            "docs_write_url": reverse("main:docs_write"),
            "docs_api_list_url": reverse("main:docs_api_list"),
            "docs_api_save_url": reverse("main:docs_api_save"),
            "docs_api_rename_url": reverse("main:docs_api_rename"),
            "docs_api_delete_url": reverse("main:docs_api_delete"),
            "docs_api_mkdir_url": reverse("main:docs_api_mkdir"),
            "docs_api_download_url": reverse("main:docs_api_download"),
        }
    )
    return context


def docs_root(request, ui_lang=None):
    return docs_list(request, folder_path="", ui_lang=ui_lang)


def docs_list(request, folder_path="", ui_lang=None):
    resolved_lang = resolve_ui_lang(request, ui_lang)
    context = docs_common_context(request, resolved_lang)

    try:
        directory, current_dir = resolve_path(folder_path, must_exist=True)
    except (ValueError, FileNotFoundError):
        raise Http404("폴더를 찾을 수 없습니다.")

    if not directory.is_dir():
        raise Http404("폴더를 찾을 수 없습니다.")

    context.update(
        {
            "current_dir": current_dir,
            "current_dir_display": current_dir or "/",
            "current_path_label": f"/media/docs/{current_dir}" if current_dir else "/media/docs",
            "initial_entries": list_directory_entries(directory),
        }
    )
    return render(request, "docs/list.html", context)


def docs_view(request, doc_path, ui_lang=None):
    resolved_lang = resolve_ui_lang(request, ui_lang)
    context = docs_common_context(request, resolved_lang)

    try:
        file_path, relative_file_path = normalize_markdown_relative_path(doc_path, must_exist=True)
    except (ValueError, FileNotFoundError):
        raise Http404("문서를 찾을 수 없습니다.")

    content = file_path.read_text(encoding="utf-8")
    slug_path = markdown_slug_from_relative(relative_file_path)
    parent_dir = str(Path(relative_file_path).parent).replace("\\", "/")
    if parent_dir == ".":
        parent_dir = ""

    context.update(
        {
            "doc_title": file_path.stem,
            "doc_relative_path": relative_file_path,
            "doc_slug_path": slug_path,
            "doc_parent_dir": parent_dir,
            "doc_content_html": render_markdown_safely(content),
        }
    )
    return render(request, "docs/view.html", context)


def docs_write(request, ui_lang=None):
    resolved_lang = resolve_ui_lang(request, ui_lang)
    context = docs_common_context(request, resolved_lang)

    requested_path = request.GET.get("path", "")
    requested_dir = request.GET.get("dir", "")

    mode = "create"
    original_relative_path = ""
    initial_filename = ""
    initial_dir = ""
    initial_content = ""

    if requested_path:
        try:
            file_path, original_relative_path = normalize_markdown_relative_path(requested_path, must_exist=True)
        except (ValueError, FileNotFoundError):
            raise Http404("수정할 문서를 찾을 수 없습니다.")

        mode = "edit"
        initial_filename = file_path.stem
        parent_dir = str(Path(original_relative_path).parent).replace("\\", "/")
        initial_dir = "" if parent_dir == "." else parent_dir
        initial_content = file_path.read_text(encoding="utf-8")
    elif requested_dir:
        initial_dir = normalize_relative_path(requested_dir)
        target_dir, _ = resolve_path(initial_dir, must_exist=True)
        if not target_dir.is_dir():
            raise Http404("대상 폴더를 찾을 수 없습니다.")

    context.update(
        {
            "write_mode": mode,
            "original_relative_path": original_relative_path,
            "initial_filename": initial_filename,
            "initial_dir": initial_dir,
            "initial_content": initial_content,
            "available_directories": list_all_directories(),
        }
    )
    return render(request, "docs/write.html", context)


def parse_json_body(request):
    try:
        return json.loads(request.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ValueError("요청 데이터 형식이 올바르지 않습니다.")


def json_error(message, status=400):
    return JsonResponse({"ok": False, "error": message}, status=status)


@require_http_methods(["GET"])
def docs_api_list(request):
    rel_path = request.GET.get("path", "")

    try:
        target_dir, normalized = resolve_path(rel_path, must_exist=True)
    except (ValueError, FileNotFoundError) as exc:
        return json_error(str(exc), status=404)

    if not target_dir.is_dir():
        return json_error("폴더 경로가 아닙니다.", status=400)

    return JsonResponse(
        {
            "ok": True,
            "path": normalized,
            "entries": list_directory_entries(target_dir),
        }
    )


@require_http_methods(["POST"])
@csrf_protect
def docs_api_rename(request):
    try:
        payload = parse_json_body(request)
        rel_path = normalize_relative_path(payload.get("path"), allow_empty=False)
        new_name = validate_name(payload.get("new_name"), for_file=False)
        source_path, source_relative = resolve_path(rel_path, must_exist=True)
    except (ValueError, FileNotFoundError) as exc:
        return json_error(str(exc), status=400)

    if source_relative == "":
        return json_error("루트 폴더는 이름을 바꿀 수 없습니다.", status=400)

    parent = source_path.parent
    if source_path.is_file():
        if source_path.suffix.lower() != DOCS_FILE_EXTENSION:
            return json_error("마크다운 파일만 이름을 바꿀 수 있습니다.", status=400)
        candidate_name = validate_name(new_name, for_file=True)
        destination = parent / f"{candidate_name}{DOCS_FILE_EXTENSION}"
    else:
        destination = parent / new_name

    if destination.exists() and destination.resolve() != source_path.resolve():
        return json_error("같은 이름의 항목이 이미 존재합니다.", status=409)

    source_path.rename(destination)
    relative_destination = relative_from_root(destination)

    response = {
        "ok": True,
        "path": relative_destination,
        "type": "dir" if destination.is_dir() else "file",
    }
    if destination.is_file():
        response["slug_path"] = markdown_slug_from_relative(relative_destination)

    return JsonResponse(response)


@require_http_methods(["POST"])
@csrf_protect
def docs_api_delete(request):
    try:
        payload = parse_json_body(request)
        rel_path = normalize_relative_path(payload.get("path"), allow_empty=False)
        target_path, target_relative = resolve_path(rel_path, must_exist=True)
    except (ValueError, FileNotFoundError) as exc:
        return json_error(str(exc), status=400)

    if target_relative == "":
        return json_error("루트 폴더는 삭제할 수 없습니다.", status=400)

    if target_path.is_dir():
        shutil.rmtree(target_path)
    else:
        if target_path.suffix.lower() != DOCS_FILE_EXTENSION:
            return json_error("마크다운 파일만 삭제할 수 있습니다.", status=400)
        target_path.unlink()

    return JsonResponse({"ok": True})


@require_http_methods(["POST"])
@csrf_protect
def docs_api_mkdir(request):
    try:
        payload = parse_json_body(request)
        parent_dir = normalize_relative_path(payload.get("parent_dir"), allow_empty=True)
        folder_name = validate_name(payload.get("folder_name"), for_file=False)
        parent_path, _ = resolve_path(parent_dir, must_exist=True)
    except (ValueError, FileNotFoundError) as exc:
        return json_error(str(exc), status=400)

    if not parent_path.is_dir():
        return json_error("폴더 생성 위치가 올바르지 않습니다.", status=400)

    target_path = parent_path / folder_name
    if target_path.exists():
        return json_error("같은 이름의 폴더가 이미 존재합니다.", status=409)

    target_path.mkdir(parents=False, exist_ok=False)
    return JsonResponse({"ok": True, "path": relative_from_root(target_path)})


@require_http_methods(["POST"])
@csrf_protect
def docs_api_save(request):
    try:
        payload = parse_json_body(request)
        original_relative_path = normalize_relative_path(payload.get("original_path"), allow_empty=True)
        target_dir = normalize_relative_path(payload.get("target_dir"), allow_empty=True)
        filename = validate_name(payload.get("filename"), for_file=True)
        content = payload.get("content", "")
        if not isinstance(content, str):
            raise ValueError("문서 내용 형식이 올바르지 않습니다.")

        target_dir_path, target_dir_rel = resolve_path(target_dir, must_exist=True)
        if not target_dir_path.is_dir():
            raise ValueError("저장 위치가 폴더가 아닙니다.")

        destination = target_dir_path / f"{filename}{DOCS_FILE_EXTENSION}"

        source_path = None
        source_relative = ""
        if original_relative_path:
            source_path, source_relative = normalize_markdown_relative_path(
                original_relative_path, must_exist=True
            )

        if destination.exists():
            if source_path is None or destination.resolve() != source_path.resolve():
                return json_error("같은 이름의 파일이 이미 존재합니다.", status=409)

    except (ValueError, FileNotFoundError) as exc:
        return json_error(str(exc), status=400)

    destination.write_text(content, encoding="utf-8")

    if source_path is not None and destination.resolve() != source_path.resolve():
        source_path.unlink(missing_ok=True)

    destination_relative = relative_from_root(destination)
    destination_slug = markdown_slug_from_relative(destination_relative)
    parent_dir = str(Path(destination_relative).parent).replace("\\", "/")
    if parent_dir == ".":
        parent_dir = ""

    if parent_dir:
        list_url = reverse("main:docs_list", kwargs={"folder_path": parent_dir})
    else:
        list_url = reverse("main:docs_root")

    view_url = reverse("main:docs_view", kwargs={"doc_path": destination_slug})

    return JsonResponse(
        {
            "ok": True,
            "path": destination_relative,
            "slug_path": destination_slug,
            "view_url": view_url,
            "list_url": list_url,
        }
    )


@require_http_methods(["GET"])
def docs_api_download(request):
    try:
        file_path, _ = normalize_markdown_relative_path(request.GET.get("path"), must_exist=True)
    except (ValueError, FileNotFoundError):
        raise Http404("다운로드할 파일을 찾을 수 없습니다.")

    return FileResponse(file_path.open("rb"), as_attachment=True, filename=file_path.name)
