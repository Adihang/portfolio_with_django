from __future__ import annotations

import json
import re
import shutil
import secrets
from functools import wraps
from pathlib import Path
from urllib.parse import quote
import httpx

from django.contrib.auth import login as auth_login
from django.contrib.auth import logout as auth_logout
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.forms import AuthenticationForm
from django.conf import settings
from django.db import transaction
from django.core.exceptions import PermissionDenied
from django.http import FileResponse, Http404, JsonResponse
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils.html import escape
from django.utils.http import url_has_allowed_host_and_scheme
from django.utils.safestring import mark_safe
from django.views.csrf import csrf_failure as default_csrf_failure
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_http_methods

from .views import (
    SUPPORTED_UI_LANGS,
    apply_ui_context,
    redirect_to_localized_route,
    render_markdown_safely,
    resolve_ui_lang,
)
from .models import DocsAccessRule, DocsLoginAttemptGuard

DOCS_FILE_EXTENSION = ".md"
DOCS_ALLOWED_FILE_EXTENSIONS = (
    ".md",
    ".txt",
    ".json",
    ".py",
)
INVALID_NAME_PATTERN = re.compile(r"[\\/]")
DOCS_LOGOUT_PATH_PATTERN = re.compile(r"^/(?:(ko|en)/)?docs/logout/?$")
MARKDOWN_HELP_FILENAME_KO = "Markdown description_ko.md"
MARKDOWN_HELP_FILENAME_EN = "Markdown description_en.md"
MARKDOWN_HELP_FILENAME_KO_DOT_LEGACY = "Markdown description.ko.md"
MARKDOWN_HELP_FILENAME_EN_DOT_LEGACY = "Markdown description.en.md"
MARKDOWN_HELP_FILENAME_LEGACY = "Markdown description.md"
MARKDOWN_HELP_DIRECTORY = "help"
PAGE_HELP_FILE_BASENAMES = {
    "list": "list",
    "write": "write",
    "view": "read",
}
DOCS_EDITOR_GROUP_NAME = "DocsEditors"
DOCS_EDIT_PERMISSION_CODE = "main.can_edit_docs"
DOCS_PUBLIC_WRITE_GROUP_NAME = "__DOCS_PUBLIC_ALL__"
DOCS_META_TITLE = "Hanplanet Docs"
DOCS_META_DESCRIPTION = "마크다운 문서 페이지"
DOCS_LOGIN_CAPTCHA_THRESHOLD = 1
DOCS_LOGIN_CAPTCHA_QUESTION_SESSION_KEY = "docs_login_captcha_question"
DOCS_LOGIN_CAPTCHA_ANSWER_SESSION_KEY = "docs_login_captcha_answer"
DOCS_RENDER_MODE_MARKDOWN = "markdown"
DOCS_RENDER_MODE_PLAIN_TEXT = "plain_text"
DOCS_DEFAULT_RENDER_PROFILE = {
    "mode": DOCS_RENDER_MODE_PLAIN_TEXT,
    "css_class": "docs-plain-text",
}
DOCS_RENDER_PROFILES_BY_EXTENSION = {
    DOCS_FILE_EXTENSION: {
        "mode": DOCS_RENDER_MODE_MARKDOWN,
        "css_class": "docs-markdown",
    },
    ".html": {
        "mode": DOCS_RENDER_MODE_PLAIN_TEXT,
        "css_class": "docs-html",
    },
    ".css": {
        "mode": DOCS_RENDER_MODE_PLAIN_TEXT,
        "css_class": "docs-css",
    },
    ".js": {
        "mode": DOCS_RENDER_MODE_PLAIN_TEXT,
        "css_class": "docs-js",
    },
    ".py": {
        "mode": DOCS_RENDER_MODE_PLAIN_TEXT,
        "css_class": "docs-py",
    },
    ".json": {
        "mode": DOCS_RENDER_MODE_PLAIN_TEXT,
        "css_class": "docs-json",
    },
}

DOCS_TEXT = {
    "ko": {
        "list_title": "문서 탐색기",
        "write_button": "작성",
        "help_button": "도움말",
        "list_aria_label": "문서 목록",
        "menu_open": "열기",
        "menu_download": "다운로드",
        "menu_rename": "이름 바꾸기",
        "menu_permissions": "권한",
        "menu_edit": "수정",
        "menu_delete": "삭제",
        "menu_new_folder": "새 폴더",
        "menu_new_document": "새 문서",
        "rename_title": "이름 바꾸기",
        "rename_new_name": "새 이름",
        "rename_new_name_placeholder": "새 이름",
        "cancel": "취소",
        "apply": "변경",
        "edit_button": "수정",
        "delete_button": "삭제",
        "download_button": "다운로드",
        "write_title_edit": "문서 수정",
        "write_title_create": "문서 작성",
        "markdown_guide_button": "마크다운 가이드",
        "markdown_preview_button": "미리보기",
        "markdown_snippet_aria": "마크다운 문법 빠른 입력",
        "markdown_snippet_heading2": "제목 2",
        "markdown_snippet_heading3": "제목 3",
        "markdown_snippet_bold": "굵게",
        "markdown_snippet_italic": "기울임",
        "markdown_snippet_link": "링크",
        "markdown_snippet_image": "이미지",
        "markdown_snippet_code_inline": "인라인 코드",
        "markdown_snippet_code_block": "코드 블록",
        "markdown_snippet_list_bullet": "글머리 목록",
        "markdown_snippet_list_numbered": "번호 목록",
        "markdown_snippet_list_check": "체크리스트",
        "markdown_snippet_quote": "인용문",
        "markdown_snippet_divider": "구분선",
        "markdown_snippet_table": "표",
        "editor_snippet_py_def": "함수 템플릿",
        "editor_snippet_py_class": "클래스 템플릿",
        "editor_snippet_py_ifmain": "실행 블록",
        "editor_snippet_py_comment": "주석",
        "editor_snippet_js_function": "함수 템플릿",
        "editor_snippet_js_if": "if 문",
        "editor_snippet_js_comment": "주석",
        "editor_snippet_css_rule": "선택자 블록",
        "editor_snippet_css_media": "미디어 쿼리",
        "editor_snippet_css_var": "CSS 변수",
        "editor_snippet_json_pair": "키-값 항목",
        "editor_snippet_json_object": "객체 템플릿",
        "editor_snippet_html_basic": "HTML 기본 구조",
        "editor_snippet_html_div": "div 블록",
        "markdown_placeholder_heading": "제목",
        "markdown_placeholder_bold": "강조 텍스트",
        "markdown_placeholder_italic": "기울임 텍스트",
        "markdown_placeholder_link_text": "링크 텍스트",
        "markdown_placeholder_image_alt": "이미지 설명",
        "markdown_placeholder_inline_code": "코드",
        "markdown_placeholder_code_lang": "언어",
        "markdown_placeholder_code_body": "코드를 입력하세요",
        "markdown_placeholder_list_item": "항목",
        "markdown_placeholder_quote": "인용문",
        "markdown_placeholder_table_col1": "항목",
        "markdown_placeholder_table_col2": "설명",
        "save_button": "저장",
        "unsaved_changes_title": "수정 사항이 있습니다",
        "unsaved_changes_message": "저장되지 않은 변경 사항이 있습니다. 이동 전에 저장할까요?",
        "unsaved_changes_leave_button": "확인",
        "unsaved_changes_save_button": "저장",
        "list_preview_title": "파일 미리보기",
        "list_preview_empty": "파일을 선택하면 미리보기가 표시됩니다.",
        "list_preview_loading": "미리보기를 불러오는 중...",
        "list_preview_error": "미리보기를 불러오지 못했습니다.",
        "list_button": "목록",
        "filename_label": "파일명 (확장자 포함)",
        "filename_placeholder": "예: hover.md",
        "save_filename_label": "파일명 (확장자 포함)",
        "save_filename_label_main": "파일명",
        "save_filename_label_sub": "(확장자 포함)",
        "save_filename_placeholder": "예: hover.md",
        "file_extension_label": "확장자",
        "file_extension_quick_label": "확장자 빠른 선택",
        "file_extension_custom_option": "직접 입력",
        "file_extension_placeholder": ".md",
        "content_label": "내용",
        "save_location_title": "저장 위치 선택",
        "close_label": "닫기",
        "up_button": "상위",
        "quick_paths_title": "빠른 경로",
        "folder_title": "폴더",
        "selected_path_label": "선택 경로",
        "selected_path_placeholder": "예: JavaScript",
        "create_folder_button": "폴더 생성",
        "save_confirm_button": "저장",
        "folder_modal_title": "새 폴더 생성",
        "folder_name_label": "폴더 이름",
        "folder_name_placeholder": "예: JavaScript",
        "create_button": "생성",
        "create_folder_in_label": "생성 위치",
        "permission_title": "권한 설정",
        "permission_read_users": "읽기 사용자",
        "permission_read_groups": "읽기 그룹",
        "permission_write_users": "쓰기 사용자",
        "permission_write_groups": "쓰기 그룹",
        "permission_help": "읽기/쓰기 권한을 각각 독립적으로 설정합니다. 읽기 권한을 비워두면 누구나 읽을 수 있습니다.",
        "permission_save_button": "저장",
        "permission_loading": "불러오는 중...",
        "permission_empty_users": "표시할 사용자가 없습니다.",
        "permission_empty_groups": "표시할 그룹이 없습니다.",
        "permission_public_group_label": "전체",
        "public_write_badge": "전체 허용",
        "markdown_help_aria": "마크다운 문법 안내",
        "markdown_help_fallback_title": "마크다운 문법",
        "markdown_help_fallback_missing": "문법 안내 파일을 찾을 수 없습니다.",
        "markdown_help_fallback_read_error": "문법 안내 파일을 읽을 수 없습니다.",
        "markdown_preview_aria": "마크다운 미리보기",
        "markdown_preview_loading": "미리보기를 불러오는 중...",
        "js_error_path_required": "경로를 입력해주세요.",
        "js_error_parent_path_not_allowed": "상위 경로(..)는 사용할 수 없습니다.",
        "js_error_request_failed": "요청 처리 중 오류가 발생했습니다.",
        "js_error_processing_failed": "처리 중 오류가 발생했습니다.",
        "js_confirm_delete_entry": "정말 삭제할까요?\n{path}",
        "js_confirm_delete_entries": "선택한 {count}개 항목을 삭제할까요?",
        "js_permission_target_multiple": "{count}개 항목",
        "js_empty_documents": "문서가 없습니다.",
        "js_confirm_delete_doc": "이 문서를 삭제할까요?",
        "js_current_folder_label": "현재 폴더",
        "js_docs_root_label": "docs 루트",
        "js_no_child_folders": "하위 폴더가 없습니다.",
        "js_filename_required": "파일명을 입력해주세요.",
        "js_extension_required": "확장자를 입력해주세요.",
        "js_extension_invalid": "확장자 형식이 올바르지 않습니다. 예: .md",
        "js_extension_not_allowed": "지원하지 않는 확장자입니다.",
        "js_select_or_create_folder": "저장 위치를 선택하거나 폴더를 먼저 생성해주세요.",
        "js_folder_name_required": "폴더 이름을 입력해주세요.",
        "js_invalid_selected_path": "선택 경로가 유효하지 않습니다. 목록에서 폴더를 선택해주세요.",
        "js_folder_create_requires_folder": "폴더에서만 새 폴더를 만들 수 있습니다.",
        "js_permission_save_failed": "권한 저장 중 오류가 발생했습니다.",
        "auth_login_button": "로그인",
        "auth_logout_button": "로그아웃",
        "auth_login_title": "Docs 로그인",
        "auth_username_label": "아이디",
        "auth_password_label": "비밀번호",
        "auth_login_submit": "로그인",
        "auth_login_error": "아이디 또는 비밀번호를 확인해주세요.",
        "auth_login_captcha_label": "캡챠 인증",
        "auth_login_captcha_hint": "아래 보안 인증을 완료해주세요.",
        "auth_login_captcha_placeholder": "정답 입력",
        "auth_login_captcha_error": "캡챠 인증에 실패했습니다. 다시 시도해주세요.",
        "auth_login_captcha_unavailable": "캡챠 설정이 준비되지 않았습니다. 관리자에게 문의해주세요.",
        "auth_logout_confirm": "로그아웃 하시겠습니까?",
        "auth_profile_label": "프로필",
    },
    "en": {
        "list_title": "Documents",
        "write_button": "Write",
        "help_button": "Help",
        "list_aria_label": "Document list",
        "menu_open": "Open",
        "menu_download": "Download",
        "menu_rename": "Rename",
        "menu_permissions": "Permissions",
        "menu_edit": "Edit",
        "menu_delete": "Delete",
        "menu_new_folder": "New Folder",
        "menu_new_document": "New Document",
        "rename_title": "Rename",
        "rename_new_name": "New name",
        "rename_new_name_placeholder": "New name",
        "cancel": "Cancel",
        "apply": "Apply",
        "edit_button": "Edit",
        "delete_button": "Delete",
        "download_button": "Download",
        "write_title_edit": "Edit Document",
        "write_title_create": "New Document",
        "markdown_guide_button": "Markdown Guide",
        "markdown_preview_button": "Preview",
        "markdown_snippet_aria": "Markdown quick insert",
        "markdown_snippet_heading2": "Heading 2",
        "markdown_snippet_heading3": "Heading 3",
        "markdown_snippet_bold": "Bold",
        "markdown_snippet_italic": "Italic",
        "markdown_snippet_link": "Link",
        "markdown_snippet_image": "Image",
        "markdown_snippet_code_inline": "Inline Code",
        "markdown_snippet_code_block": "Code Block",
        "markdown_snippet_list_bullet": "Bullet List",
        "markdown_snippet_list_numbered": "Numbered List",
        "markdown_snippet_list_check": "Checklist",
        "markdown_snippet_quote": "Quote",
        "markdown_snippet_divider": "Divider",
        "markdown_snippet_table": "Table",
        "editor_snippet_py_def": "Function Template",
        "editor_snippet_py_class": "Class Template",
        "editor_snippet_py_ifmain": "Run Block",
        "editor_snippet_py_comment": "Comment",
        "editor_snippet_js_function": "Function Template",
        "editor_snippet_js_if": "If Statement",
        "editor_snippet_js_comment": "Comment",
        "editor_snippet_css_rule": "Selector Block",
        "editor_snippet_css_media": "Media Query",
        "editor_snippet_css_var": "CSS Variable",
        "editor_snippet_json_pair": "Key-Value Pair",
        "editor_snippet_json_object": "Object Template",
        "editor_snippet_html_basic": "Basic HTML",
        "editor_snippet_html_div": "div Block",
        "markdown_placeholder_heading": "Heading",
        "markdown_placeholder_bold": "bold text",
        "markdown_placeholder_italic": "italic text",
        "markdown_placeholder_link_text": "link text",
        "markdown_placeholder_image_alt": "image description",
        "markdown_placeholder_inline_code": "code",
        "markdown_placeholder_code_lang": "lang",
        "markdown_placeholder_code_body": "type your code",
        "markdown_placeholder_list_item": "item",
        "markdown_placeholder_quote": "quote",
        "markdown_placeholder_table_col1": "Item",
        "markdown_placeholder_table_col2": "Description",
        "save_button": "Save",
        "unsaved_changes_title": "Unsaved Changes",
        "unsaved_changes_message": "You have unsaved changes. Save before leaving?",
        "unsaved_changes_leave_button": "Continue",
        "unsaved_changes_save_button": "Save",
        "list_preview_title": "File Preview",
        "list_preview_empty": "Select a file to preview.",
        "list_preview_loading": "Loading preview...",
        "list_preview_error": "Failed to load preview.",
        "list_button": "List",
        "filename_label": "File name (with extension)",
        "filename_placeholder": "e.g. hover.md",
        "save_filename_label": "File name (with extension)",
        "save_filename_label_main": "File name",
        "save_filename_label_sub": "(with extension)",
        "save_filename_placeholder": "e.g. hover.md",
        "file_extension_label": "Extension",
        "file_extension_quick_label": "Extension quick pick",
        "file_extension_custom_option": "Custom input",
        "file_extension_placeholder": ".md",
        "content_label": "Content",
        "save_location_title": "Choose Save Location",
        "close_label": "Close",
        "up_button": "Up",
        "quick_paths_title": "Quick Paths",
        "folder_title": "Folders",
        "selected_path_label": "Selected Path",
        "selected_path_placeholder": "e.g. JavaScript",
        "create_folder_button": "Create Folder",
        "save_confirm_button": "Save",
        "folder_modal_title": "Create Folder",
        "folder_name_label": "Folder name",
        "folder_name_placeholder": "e.g. JavaScript",
        "create_button": "Create",
        "create_folder_in_label": "Create in",
        "permission_title": "Access Control",
        "permission_read_users": "Read Users",
        "permission_read_groups": "Read Groups",
        "permission_write_users": "Write Users",
        "permission_write_groups": "Write Groups",
        "permission_help": "Configure read and write independently. If read access is empty, everyone can read.",
        "permission_save_button": "Save",
        "permission_loading": "Loading...",
        "permission_empty_users": "No users to display.",
        "permission_empty_groups": "No groups to display.",
        "permission_public_group_label": "All",
        "public_write_badge": "Public Write",
        "markdown_help_aria": "Markdown syntax guide",
        "markdown_help_fallback_title": "Markdown Guide",
        "markdown_help_fallback_missing": "Guide file not found.",
        "markdown_help_fallback_read_error": "Failed to read the guide file.",
        "markdown_preview_aria": "Markdown preview",
        "markdown_preview_loading": "Loading preview...",
        "js_error_path_required": "Please enter a path.",
        "js_error_parent_path_not_allowed": "Parent path (..) is not allowed.",
        "js_error_request_failed": "Request failed while processing the request.",
        "js_error_processing_failed": "An error occurred while processing.",
        "js_confirm_delete_entry": "Delete this item?\n{path}",
        "js_confirm_delete_entries": "Delete {count} selected items?",
        "js_permission_target_multiple": "{count} items",
        "js_empty_documents": "No documents found.",
        "js_confirm_delete_doc": "Delete this document?",
        "js_current_folder_label": "Current folder",
        "js_docs_root_label": "docs root",
        "js_no_child_folders": "No subfolders.",
        "js_filename_required": "Please enter a file name.",
        "js_extension_required": "Please enter a file extension.",
        "js_extension_invalid": "Invalid extension format. Example: .md",
        "js_extension_not_allowed": "Unsupported file extension.",
        "js_select_or_create_folder": "Select a save location or create a folder first.",
        "js_folder_name_required": "Please enter a folder name.",
        "js_invalid_selected_path": "Selected path is invalid. Please choose a folder from the list.",
        "js_folder_create_requires_folder": "New folders can only be created inside a folder.",
        "js_permission_save_failed": "Failed to save permissions.",
        "auth_login_button": "Login",
        "auth_logout_button": "Logout",
        "auth_login_title": "Docs Login",
        "auth_username_label": "Username",
        "auth_password_label": "Password",
        "auth_login_submit": "Login",
        "auth_login_error": "Please check your username or password.",
        "auth_login_captcha_label": "Captcha Verification",
        "auth_login_captcha_hint": "Complete the security verification below.",
        "auth_login_captcha_placeholder": "Enter answer",
        "auth_login_captcha_error": "Captcha verification failed. Please try again.",
        "auth_login_captcha_unavailable": "Captcha is not configured. Please contact the administrator.",
        "auth_logout_confirm": "Do you want to log out?",
        "auth_profile_label": "Profile",
    },
}


def get_docs_text(ui_lang: str | None) -> dict:
    lang = (ui_lang or "").strip().lower()
    if lang not in DOCS_TEXT:
        lang = "ko"
    return DOCS_TEXT[lang].copy()


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


def normalize_file_extension(extension: str | None, *, allow_empty: bool = False) -> str:
    candidate = (extension or "").strip().lower()
    if not candidate:
        if allow_empty:
            return ""
        return DOCS_FILE_EXTENSION
    if not candidate.startswith("."):
        candidate = f".{candidate}"
    if not re.fullmatch(r"\.[a-z0-9][a-z0-9._-]{0,15}", candidate):
        raise ValueError("확장자 형식이 올바르지 않습니다.")
    return candidate


def normalize_docs_relative_path(raw_path: str | None, must_exist: bool = True) -> tuple[Path, str]:
    normalized = normalize_relative_path(raw_path, allow_empty=False)
    suffix = Path(normalized).suffix.lower()
    if suffix:
        try:
            normalize_file_extension(suffix)
        except ValueError as exc:
            raise FileNotFoundError("문서 파일을 찾을 수 없습니다.") from exc
    else:
        normalized = f"{normalized}{DOCS_FILE_EXTENSION}"

    path_obj, rel_path = resolve_path(normalized, must_exist=must_exist)
    if must_exist:
        if not path_obj.is_file():
            raise FileNotFoundError("문서 파일을 찾을 수 없습니다.")
        try:
            normalize_file_extension(path_obj.suffix.lower())
        except ValueError as exc:
            raise FileNotFoundError("문서 파일을 찾을 수 없습니다.") from exc

    return path_obj, rel_path


def normalize_markdown_relative_path(raw_path: str | None, must_exist: bool = True) -> tuple[Path, str]:
    """Backward-compatible alias used across docs views."""
    return normalize_docs_relative_path(raw_path, must_exist=must_exist)


def validate_name(
    name: str | None,
    *,
    for_file: bool = False,
    file_extension: str | None = DOCS_FILE_EXTENSION,
) -> str:
    candidate = (name or "").strip()
    if not candidate:
        raise ValueError("이름을 입력해주세요.")
    if candidate in {".", ".."}:
        raise ValueError("사용할 수 없는 이름입니다.")
    if INVALID_NAME_PATTERN.search(candidate):
        raise ValueError("이름에 슬래시를 사용할 수 없습니다.")

    if for_file:
        normalized_extension = normalize_file_extension(file_extension)
        if candidate.lower().endswith(normalized_extension):
            candidate = candidate[: -len(normalized_extension)].strip()
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


def render_plain_text_safely(text: str) -> str:
    escaped_text = escape(text or "")
    return mark_safe(f"<pre><code>{escaped_text}</code></pre>")


def _inject_before_first_closing_tag(source: str, closing_tag: str, injection: str) -> str:
    pattern = re.compile(re.escape(closing_tag), re.IGNORECASE)
    if pattern.search(source):
        return pattern.sub(lambda match: f"{injection}{match.group(0)}", source, count=1)
    return f"{source}{injection}"


def build_docs_html_live_document(html_source: str, *, companion_css: str = "", companion_js: str = "") -> str:
    document = html_source or ""
    css_text = companion_css or ""
    js_text = companion_js or ""
    csp_meta = (
        "\n<meta http-equiv=\"Content-Security-Policy\" "
        "content=\"default-src 'none'; "
        "script-src 'unsafe-inline'; "
        "style-src 'unsafe-inline'; "
        "img-src data: blob:; "
        "font-src data:; "
        "media-src data: blob:; "
        "connect-src 'none'; "
        "frame-src 'none'; "
        "object-src 'none'; "
        "form-action 'none'; "
        "base-uri 'none'; "
        "navigate-to 'none'\">"
    )

    if re.search(r"</head\s*>", document, flags=re.IGNORECASE):
        document = _inject_before_first_closing_tag(document, "</head>", csp_meta)
    else:
        document = f"{csp_meta}{document}"

    if css_text:
        safe_css_text = css_text.replace("</style", "<\\/style")
        css_block = f"\n<style data-docs-linked-css>\n{safe_css_text}\n</style>\n"
        if re.search(r"</head\s*>", document, flags=re.IGNORECASE):
            document = _inject_before_first_closing_tag(document, "</head>", css_block)
        else:
            document = f"{css_block}{document}"

    if js_text:
        safe_js_text = js_text.replace("</script", "<\\/script")
        js_block = f"\n<script data-docs-linked-js>\n{safe_js_text}\n</script>\n"
        if re.search(r"</body\s*>", document, flags=re.IGNORECASE):
            document = _inject_before_first_closing_tag(document, "</body>", js_block)
        else:
            document = f"{document}{js_block}"

    return document


def render_docs_html_live_safely(html_source: str, *, companion_css: str = "", companion_js: str = "") -> str:
    live_document = build_docs_html_live_document(
        html_source,
        companion_css=companion_css,
        companion_js=companion_js,
    )
    escaped_srcdoc = escape(live_document)
    iframe_html = (
        '<div class="docs-html-live-wrap">'
        '<iframe class="docs-html-live-frame" '
        'sandbox="allow-scripts" '
        'referrerpolicy="no-referrer" '
        f'srcdoc="{escaped_srcdoc}"></iframe>'
        "</div>"
    )
    return mark_safe(iframe_html)


def load_docs_html_companion_assets(source_path: Path, request=None) -> tuple[str, str]:
    if source_path.suffix.lower() != ".html":
        return "", ""

    base_path = source_path.with_suffix("")
    companion_css_path = base_path.with_suffix(".css")
    companion_js_path = base_path.with_suffix(".js")

    def _can_read(asset_path: Path) -> bool:
        if request is None:
            return True
        try:
            asset_relative_path = relative_from_root(asset_path)
        except (ValueError, OSError):
            return False
        return has_docs_read_access(request, asset_relative_path)

    def _read_asset(asset_path: Path) -> str:
        if not asset_path.exists() or not asset_path.is_file() or not _can_read(asset_path):
            return ""
        try:
            return asset_path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            return ""

    return _read_asset(companion_css_path), _read_asset(companion_js_path)


def resolve_docs_render_profile(file_extension: str | None) -> dict[str, str]:
    try:
        normalized_extension = normalize_file_extension(file_extension, allow_empty=True)
    except ValueError:
        normalized_extension = ""
    if not normalized_extension:
        normalized_extension = DOCS_FILE_EXTENSION

    extension_profile = DOCS_RENDER_PROFILES_BY_EXTENSION.get(normalized_extension)
    if not extension_profile:
        extension_profile = DOCS_DEFAULT_RENDER_PROFILE

    return {
        "extension": normalized_extension,
        "mode": extension_profile["mode"],
        "css_class": extension_profile["css_class"],
    }


def get_docs_save_extension_options() -> list[str]:
    options = []
    for extension, profile in DOCS_RENDER_PROFILES_BY_EXTENSION.items():
        if (
            profile.get("mode") == DOCS_RENDER_MODE_MARKDOWN
            or profile.get("css_class") != "docs-plain-text"
        ):
            options.append(extension)

    if DOCS_FILE_EXTENSION in options:
        ordered = [DOCS_FILE_EXTENSION]
        ordered.extend(sorted(ext for ext in options if ext != DOCS_FILE_EXTENSION))
        return ordered
    return sorted(options)


def render_docs_content(
    content: str,
    file_extension: str | None,
    *,
    source_path: Path | None = None,
    request=None,
) -> tuple[str, dict[str, str]]:
    profile = resolve_docs_render_profile(file_extension)
    if profile["css_class"] == "docs-html":
        companion_css = ""
        companion_js = ""
        if source_path is not None:
            companion_css, companion_js = load_docs_html_companion_assets(source_path, request=request)
        rendered = render_docs_html_live_safely(
            content,
            companion_css=companion_css,
            companion_js=companion_js,
        )
    elif profile["mode"] == DOCS_RENDER_MODE_MARKDOWN:
        rendered = render_markdown_safely(content)
    else:
        rendered = render_plain_text_safely(content)
    return str(rendered), profile


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


def build_acl_candidate_paths(path_value: str | None) -> list[str]:
    normalized = normalize_relative_path(path_value, allow_empty=True)
    if not normalized:
        return [""]

    candidates = [normalized]
    parts = normalized.split("/")
    while len(parts) > 1:
        parts = parts[:-1]
        candidates.append("/".join(parts))
    candidates.append("")
    return candidates


def get_docs_acl_rule_map(request) -> dict[str, DocsAccessRule]:
    rule_map = getattr(request, "_docs_acl_rule_map", None)
    if rule_map is None:
        rules = DocsAccessRule.objects.prefetch_related(
            "read_users",
            "read_groups",
            "write_users",
            "write_groups",
        ).all()
        rule_map = {rule.path: rule for rule in rules}
        setattr(request, "_docs_acl_rule_map", rule_map)
    return rule_map


def get_effective_docs_acl_rule(request, path_value: str | None) -> tuple[DocsAccessRule | None, str]:
    normalized = normalize_relative_path(path_value, allow_empty=True)
    cache = getattr(request, "_docs_acl_effective_cache", None)
    if cache is None:
        cache = {}
        setattr(request, "_docs_acl_effective_cache", cache)
    if normalized in cache:
        return cache[normalized]

    rule_map = get_docs_acl_rule_map(request)
    for candidate in build_acl_candidate_paths(normalized):
        rule = rule_map.get(candidate)
        if rule is not None:
            cache[normalized] = (rule, candidate)
            return rule, candidate

    cache[normalized] = (None, "")
    return None, ""


def has_descendant_docs_acl_rule(request, path_value: str | None) -> bool:
    normalized = normalize_relative_path(path_value, allow_empty=True)

    cache = getattr(request, "_docs_acl_descendant_rule_cache", None)
    if cache is None:
        cache = {}
        setattr(request, "_docs_acl_descendant_rule_cache", cache)
    if normalized in cache:
        return cache[normalized]

    rule_map = get_docs_acl_rule_map(request)
    if not normalized:
        has_descendant_rule = any(rule_path != "" for rule_path in rule_map.keys())
        cache[normalized] = has_descendant_rule
        return has_descendant_rule

    prefix = normalized + "/"
    has_descendant_rule = any(rule_path.startswith(prefix) for rule_path in rule_map.keys())
    cache[normalized] = has_descendant_rule
    return has_descendant_rule


def get_docs_public_write_group() -> Group:
    group, _ = Group.objects.get_or_create(name=DOCS_PUBLIC_WRITE_GROUP_NAME)
    return group


def rule_has_public_group(rule: DocsAccessRule, group_relation: str) -> bool:
    groups = getattr(rule, group_relation).all()
    return any(group.name == DOCS_PUBLIC_WRITE_GROUP_NAME for group in groups)


def get_public_group_display_label(request) -> str:
    cached = getattr(request, "_docs_public_group_display_label", None)
    if isinstance(cached, str) and cached:
        return cached
    docs_text = get_docs_text(resolve_ui_lang(request, None))
    label = docs_text.get("permission_public_group_label", "전체")
    setattr(request, "_docs_public_group_display_label", label)
    return label


def is_docs_public_write_enabled(request, path_value: str | None) -> bool:
    rule, _ = get_effective_docs_acl_rule(request, path_value)
    if rule is None:
        return False
    return rule_has_public_group(rule, "write_groups")


def get_write_acl_display_labels(request, path_value: str | None) -> list[str]:
    rule, _ = get_effective_docs_acl_rule(request, path_value)
    if rule is None:
        return []

    labels = []
    group_names = sorted(
        {
            group.name
            for group in rule.write_groups.all()
            if group.name and group.name != DOCS_PUBLIC_WRITE_GROUP_NAME
        },
        key=lambda value: value.lower(),
    )
    user_names = sorted(
        {
            user.get_username()
            for user in rule.write_users.all()
            if user.get_username()
        },
        key=lambda value: value.lower(),
    )

    labels.extend(f"#{group_name}" for group_name in group_names)
    labels.extend(f"@{username}" for username in user_names)
    return labels


def get_request_user_group_ids(request) -> set[int]:
    cached = getattr(request, "_docs_acl_user_group_ids", None)
    if cached is not None:
        return cached

    user = getattr(request, "user", None)
    if not (user and user.is_authenticated):
        cached = set()
    else:
        cached = set(user.groups.values_list("id", flat=True))
    setattr(request, "_docs_acl_user_group_ids", cached)
    return cached


def user_matches_docs_acl_rule(
    request,
    rule: DocsAccessRule,
    *,
    user_relation: str,
    group_relation: str,
) -> bool:
    user = getattr(request, "user", None)
    if user and user.is_superuser:
        return True
    if not (user and user.is_authenticated):
        return False

    user_id = getattr(user, "id", None)
    allowed_users = getattr(rule, user_relation).all()
    if user_id and any(allowed_user.id == user_id for allowed_user in allowed_users):
        return True

    user_group_ids = get_request_user_group_ids(request)
    if not user_group_ids:
        return False

    allowed_groups = getattr(rule, group_relation).all()
    rule_group_ids = {group.id for group in allowed_groups}
    return bool(user_group_ids & rule_group_ids)


def has_docs_read_access(request, path_value: str | None) -> bool:
    if is_docs_acl_admin(request):
        return True

    rule, _ = get_effective_docs_acl_rule(request, path_value)
    if rule is None:
        return True
    if rule_has_public_group(rule, "read_groups"):
        return True

    read_user_ids = {user.id for user in rule.read_users.all()}
    read_group_ids = {
        group.id
        for group in rule.read_groups.all()
        if group.name != DOCS_PUBLIC_WRITE_GROUP_NAME
    }

    if not read_user_ids and not read_group_ids:
        return True

    return user_matches_docs_acl_rule(
        request,
        rule,
        user_relation="read_users",
        group_relation="read_groups",
    )


def has_docs_write_access(request, path_value: str | None) -> bool:
    user = getattr(request, "user", None)
    if user and user.is_superuser:
        return True

    normalized_path = normalize_relative_path(path_value, allow_empty=True)
    rule, matched_rule_path = get_effective_docs_acl_rule(request, path_value)
    has_descendant_rule = has_descendant_docs_acl_rule(request, normalized_path)
    if rule is None:
        # Root directory keeps editor-default write access even when
        # descendant ACL rules exist. This allows DocsEditors to create
        # new files/folders at unconfigured root scope by default.
        if normalized_path == "":
            return is_docs_editor(request)
        if has_descendant_rule:
            return False
        return is_docs_editor(request)
    if matched_rule_path != normalized_path and has_descendant_rule:
        return False
    if rule_has_public_group(rule, "write_groups"):
        # Safety guard for legacy-invalid ACL data:
        # public-write ACL is only valid on markdown files, never on directories.
        try:
            target_path, _ = resolve_path(normalized_path, must_exist=True)
        except (ValueError, FileNotFoundError):
            return True
        if target_path.is_dir():
            return False
        return True
    if not is_docs_editor(request):
        return False

    return user_matches_docs_acl_rule(
        request,
        rule,
        user_relation="write_users",
        group_relation="write_groups",
    )


def has_docs_directory_write_access(request, path_value: str | None) -> bool:
    user = getattr(request, "user", None)
    if user and user.is_superuser:
        return True

    rule, _ = get_effective_docs_acl_rule(request, path_value)
    if rule is None:
        return is_docs_editor(request)

    if rule_has_public_group(rule, "write_groups"):
        # public-write ACL is only valid on markdown files, never on directories.
        return False

    if not is_docs_editor(request):
        return False

    return user_matches_docs_acl_rule(
        request,
        rule,
        user_relation="write_users",
        group_relation="write_groups",
    )


def move_docs_acl_rules(source_path: str, destination_path: str) -> None:
    source_normalized = normalize_relative_path(source_path, allow_empty=True)
    destination_normalized = normalize_relative_path(destination_path, allow_empty=True)
    if source_normalized == destination_normalized:
        return

    rules = list(DocsAccessRule.objects.filter(path=source_normalized))
    if source_normalized:
        rules += list(
            DocsAccessRule.objects.filter(path__startswith=source_normalized + "/").exclude(
                path=source_normalized
            )
        )

    for rule in rules:
        old_path = rule.path
        suffix = old_path[len(source_normalized):] if source_normalized else old_path
        new_path = destination_normalized + suffix
        if not destination_normalized:
            new_path = suffix.lstrip("/")

        target_rule = DocsAccessRule.objects.filter(path=new_path).exclude(pk=rule.pk).first()
        if target_rule:
            merged_read_user_ids = set(target_rule.read_users.values_list("id", flat=True)) | set(
                rule.read_users.values_list("id", flat=True)
            )
            merged_read_group_ids = set(target_rule.read_groups.values_list("id", flat=True)) | set(
                rule.read_groups.values_list("id", flat=True)
            )
            merged_write_user_ids = set(target_rule.write_users.values_list("id", flat=True)) | set(
                rule.write_users.values_list("id", flat=True)
            )
            merged_write_group_ids = set(target_rule.write_groups.values_list("id", flat=True)) | set(
                rule.write_groups.values_list("id", flat=True)
            )
            target_rule.read_users.set(merged_read_user_ids)
            target_rule.read_groups.set(merged_read_group_ids)
            target_rule.write_users.set(merged_write_user_ids)
            target_rule.write_groups.set(merged_write_group_ids)
            rule.delete()
            continue

        rule.path = new_path
        rule.save(update_fields=["path", "updated_at"])


def delete_docs_acl_rules_for_path(path_value: str) -> None:
    normalized = normalize_relative_path(path_value, allow_empty=True)
    if not normalized:
        DocsAccessRule.objects.filter(path="").delete()
        return

    DocsAccessRule.objects.filter(path=normalized).delete()
    DocsAccessRule.objects.filter(path__startswith=normalized + "/").delete()


def list_directory_entries(directory: Path, request=None) -> list[dict]:
    entries = []
    for child in sorted(directory.iterdir(), key=lambda p: (0 if p.is_dir() else 1, p.name.lower())):
        if child.is_dir():
            entry = build_entry(child)
            if request is not None and not has_docs_read_access(request, entry["path"]):
                continue
            if request is not None:
                entry["can_edit"] = has_docs_write_access(request, entry["path"])
                entry["can_write_children"] = has_docs_directory_write_access(request, entry["path"])
                entry["is_public_write"] = False
                entry["write_acl_labels"] = get_write_acl_display_labels(request, entry["path"])
            entries.append(entry)
            continue
        if child.is_file():
            entry = build_entry(child)
            if request is not None and not has_docs_read_access(request, entry["path"]):
                continue
            if request is not None:
                entry["can_edit"] = has_docs_write_access(request, entry["path"])
                entry["can_write_children"] = False
                entry["is_public_write"] = is_docs_public_write_enabled(request, entry["path"])
                entry["write_acl_labels"] = get_write_acl_display_labels(request, entry["path"])
            entries.append(entry)
    return entries


def list_all_directories(request=None) -> list[str]:
    root = docs_root_dir()
    directories = []
    if request is None or has_docs_directory_write_access(request, ""):
        directories.append("")
    for directory in sorted([p for p in root.rglob("*") if p.is_dir()], key=lambda p: p.as_posix().lower()):
        rel_path = relative_from_root(directory)
        if request is not None and not has_docs_directory_write_access(request, rel_path):
            continue
        directories.append(rel_path)
    return directories


def build_docs_list_url(base_url: str, relative_path: str) -> str:
    normalized = normalize_relative_path(relative_path, allow_empty=True)
    if not normalized:
        return base_url
    encoded = "/".join(quote(segment, safe="") for segment in normalized.split("/"))
    return f"{base_url}/{encoded}/list"


def build_docs_breadcrumbs(base_url: str, current_dir: str) -> list[dict]:
    breadcrumbs = [{"label": "docs", "url": base_url, "is_current": current_dir == "", "path": ""}]
    if not current_dir:
        return breadcrumbs

    parts = [part for part in current_dir.split("/") if part]
    for index, part in enumerate(parts):
        parent_path = "/".join(parts[: index + 1])
        breadcrumbs.append(
            {
                "label": part,
                "url": build_docs_list_url(base_url, parent_path),
                "is_current": index == len(parts) - 1,
                "path": parent_path,
            }
        )
    return breadcrumbs


def is_docs_editor(request) -> bool:
    user = getattr(request, "user", None)
    if not (user and user.is_authenticated):
        return False
    if user.is_superuser:
        return True
    return user.has_perm(DOCS_EDIT_PERMISSION_CODE)


def is_docs_acl_admin(request) -> bool:
    user = getattr(request, "user", None)
    if not (user and user.is_authenticated):
        return False
    return bool(user.is_staff or user.is_superuser)


def require_docs_editor_json(view_func):
    @wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        if not is_docs_editor(request):
            return json_error("문서 수정 권한이 필요합니다.", status=403)
        return view_func(request, *args, **kwargs)

    return _wrapped


def require_docs_acl_admin_json(view_func):
    @wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        if not is_docs_acl_admin(request):
            return json_error("권한 관리는 관리자만 사용할 수 있습니다.", status=403)
        return view_func(request, *args, **kwargs)

    return _wrapped


def resolve_next_url(request, fallback_url: str) -> str:
    candidate = (request.POST.get("next") or request.GET.get("next") or "").strip()
    if candidate and url_has_allowed_host_and_scheme(
        url=candidate,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        return candidate
    return fallback_url


def get_markdown_help_candidates(ui_lang: str | None) -> list[Path]:
    docs_root = docs_root_dir()
    help_root = docs_root / MARKDOWN_HELP_DIRECTORY
    markdown_help_candidates: list[Path] = []
    if ui_lang == "en":
        markdown_help_candidates.append(help_root / MARKDOWN_HELP_FILENAME_EN)
        markdown_help_candidates.append(help_root / MARKDOWN_HELP_FILENAME_KO)
        markdown_help_candidates.append(help_root / MARKDOWN_HELP_FILENAME_EN_DOT_LEGACY)
        markdown_help_candidates.append(help_root / MARKDOWN_HELP_FILENAME_KO_DOT_LEGACY)
    else:
        markdown_help_candidates.append(help_root / MARKDOWN_HELP_FILENAME_KO)
        markdown_help_candidates.append(help_root / MARKDOWN_HELP_FILENAME_EN)
        markdown_help_candidates.append(help_root / MARKDOWN_HELP_FILENAME_KO_DOT_LEGACY)
        markdown_help_candidates.append(help_root / MARKDOWN_HELP_FILENAME_EN_DOT_LEGACY)
    markdown_help_candidates.append(help_root / MARKDOWN_HELP_FILENAME_LEGACY)

    # Backward compatibility for older deployments that still have root-level help files.
    if ui_lang == "en":
        markdown_help_candidates.append(docs_root / MARKDOWN_HELP_FILENAME_EN)
        markdown_help_candidates.append(docs_root / MARKDOWN_HELP_FILENAME_KO)
        markdown_help_candidates.append(docs_root / MARKDOWN_HELP_FILENAME_EN_DOT_LEGACY)
        markdown_help_candidates.append(docs_root / MARKDOWN_HELP_FILENAME_KO_DOT_LEGACY)
    else:
        markdown_help_candidates.append(docs_root / MARKDOWN_HELP_FILENAME_KO)
        markdown_help_candidates.append(docs_root / MARKDOWN_HELP_FILENAME_EN)
        markdown_help_candidates.append(docs_root / MARKDOWN_HELP_FILENAME_KO_DOT_LEGACY)
        markdown_help_candidates.append(docs_root / MARKDOWN_HELP_FILENAME_EN_DOT_LEGACY)
    markdown_help_candidates.append(docs_root / MARKDOWN_HELP_FILENAME_LEGACY)
    return markdown_help_candidates


def resolve_markdown_help_file(ui_lang: str | None) -> Path | None:
    for markdown_help_path in get_markdown_help_candidates(ui_lang):
        if markdown_help_path.exists() and markdown_help_path.is_file():
            return markdown_help_path
    return None


def get_page_help_candidates(ui_lang: str | None, page_type: str) -> list[Path]:
    help_root = docs_root_dir() / MARKDOWN_HELP_DIRECTORY
    base_name = PAGE_HELP_FILE_BASENAMES.get(page_type)
    if not base_name:
        return []

    preferred_lang = "en" if ui_lang == "en" else "ko"
    secondary_lang = "ko" if preferred_lang == "en" else "en"
    return [
        help_root / f"{base_name}_{preferred_lang}{DOCS_FILE_EXTENSION}",
        help_root / f"{base_name}_{secondary_lang}{DOCS_FILE_EXTENSION}",
        help_root / f"{base_name}.{preferred_lang}{DOCS_FILE_EXTENSION}",
        help_root / f"{base_name}.{secondary_lang}{DOCS_FILE_EXTENSION}",
        help_root / f"{base_name}{DOCS_FILE_EXTENSION}",
    ]


def resolve_page_help_file(ui_lang: str | None, page_type: str) -> Path | None:
    for page_help_path in get_page_help_candidates(ui_lang, page_type):
        if page_help_path.exists() and page_help_path.is_file():
            return page_help_path
    return None


def build_page_help_html(ui_lang: str | None, page_type: str, docs_text: dict) -> str:
    page_help_path = resolve_page_help_file(ui_lang, page_type)
    try:
        if page_help_path is not None:
            return render_markdown_safely(page_help_path.read_text(encoding="utf-8"))
        fallback_markdown = (
            f"# {docs_text.get('help_button', 'Help')}\n\n"
            f"{docs_text['markdown_help_fallback_missing']}"
        )
    except OSError:
        fallback_markdown = (
            f"# {docs_text.get('help_button', 'Help')}\n\n"
            f"{docs_text['markdown_help_fallback_read_error']}"
        )
    return render_markdown_safely(fallback_markdown)


def build_docs_help_url(ui_lang: str | None, docs_base_url: str) -> str:
    help_file = resolve_markdown_help_file(ui_lang)
    if help_file is None:
        return docs_base_url

    help_relative = relative_from_root(help_file)
    help_slug = markdown_slug_from_relative(help_relative)

    if ui_lang in SUPPORTED_UI_LANGS:
        return reverse("main:docs_view_lang", kwargs={"ui_lang": ui_lang, "doc_path": help_slug})
    return reverse("main:docs_view", kwargs={"doc_path": help_slug})


def docs_common_context(request, ui_lang):
    context = {}
    apply_ui_context(request, context, ui_lang)
    docs_text = get_docs_text(ui_lang)

    if ui_lang in SUPPORTED_UI_LANGS:
        docs_base_url = reverse("main:docs_root_lang", kwargs={"ui_lang": ui_lang})
        docs_write_url = reverse("main:docs_write_lang", kwargs={"ui_lang": ui_lang})
        docs_login_url = reverse("main:docs_login_lang", kwargs={"ui_lang": ui_lang})
        docs_logout_url = reverse("main:docs_logout_lang", kwargs={"ui_lang": ui_lang})
    else:
        docs_base_url = reverse("main:docs_root")
        docs_write_url = reverse("main:docs_write")
        docs_login_url = reverse("main:docs_login")
        docs_logout_url = reverse("main:docs_logout")
    docs_help_url = build_docs_help_url(ui_lang, docs_base_url)

    context.update(
        {
            "meta_title": DOCS_META_TITLE,
            "meta_og_title": DOCS_META_TITLE,
            "meta_site_name": DOCS_META_TITLE,
            "meta_description": DOCS_META_DESCRIPTION,
            "meta_og_description": DOCS_META_DESCRIPTION,
            "docs_base_url": docs_base_url,
            "docs_write_url": docs_write_url,
            "docs_login_url": docs_login_url,
            "docs_logout_url": docs_logout_url,
            "docs_auth_next": request.get_full_path(),
            "docs_logout_next": docs_base_url,
            "docs_help_url": docs_help_url,
            "docs_api_list_url": reverse("main:docs_api_list"),
            "docs_api_save_url": reverse("main:docs_api_save"),
            "docs_api_preview_url": reverse("main:docs_api_preview"),
            "docs_api_rename_url": reverse("main:docs_api_rename"),
            "docs_api_delete_url": reverse("main:docs_api_delete"),
            "docs_api_mkdir_url": reverse("main:docs_api_mkdir"),
            "docs_api_move_url": reverse("main:docs_api_move"),
            "docs_api_download_url": reverse("main:docs_api_download"),
            "docs_api_acl_url": reverse("main:docs_api_acl"),
            "docs_api_acl_options_url": reverse("main:docs_api_acl_options"),
            "docs_can_edit": has_docs_directory_write_access(request, ""),
            "docs_can_manage_acl": is_docs_acl_admin(request),
            "docs_file_extension_options": get_docs_save_extension_options(),
            "docs_text": docs_text,
        }
    )
    return context


def docs_csrf_failure(request, reason="", template_name="403_csrf.html"):
    path = request.path or ""
    logout_match = DOCS_LOGOUT_PATH_PATTERN.match(path)
    if logout_match:
        matched_lang = (logout_match.group(1) or "").strip().lower()
        if matched_lang in SUPPORTED_UI_LANGS:
            return redirect(reverse("main:docs_root_lang", kwargs={"ui_lang": matched_lang}))
        return redirect_to_localized_route(request, "main:docs_root_lang")
    return default_csrf_failure(request, reason=reason, template_name=template_name)


def docs_root(request, ui_lang=None):
    return docs_list(request, folder_path="", ui_lang=ui_lang)


def docs_root_legacy_redirect(request):
    return redirect_to_localized_route(request, "main:docs_root_lang")


def docs_list_root_legacy_redirect(request):
    return redirect_to_localized_route(request, "main:docs_root_lang")


def docs_write_legacy_redirect(request):
    return redirect_to_localized_route(request, "main:docs_write_lang")


def docs_login_legacy_redirect(request):
    return redirect_to_localized_route(request, "main:docs_login_lang")


def docs_logout_legacy_redirect(request):
    return redirect_to_localized_route(request, "main:docs_logout_lang")


def docs_list_legacy_redirect(request, folder_path):
    return redirect_to_localized_route(request, "main:docs_list_lang", folder_path=folder_path)


def docs_view_legacy_redirect(request, doc_path):
    return redirect_to_localized_route(request, "main:docs_view_lang", doc_path=doc_path)


def _resolve_docs_login_target_user(username_value: str | None):
    username = (username_value or "").strip()
    if not username:
        return None
    UserModel = get_user_model()
    try:
        return UserModel.objects.get(username=username)
    except UserModel.DoesNotExist:
        return None


def _get_docs_login_guard(user):
    if user is None:
        return None
    guard, _ = DocsLoginAttemptGuard.objects.get_or_create(user=user)
    return guard


def _is_docs_login_captcha_required(user) -> bool:
    if user is None:
        return False
    guard = DocsLoginAttemptGuard.objects.filter(user=user).only("captcha_required").first()
    return bool(guard and guard.captcha_required)


def _register_docs_login_failure(user):
    guard = _get_docs_login_guard(user)
    if guard is None:
        return
    guard.failed_attempts = int(guard.failed_attempts or 0) + 1
    if guard.failed_attempts >= DOCS_LOGIN_CAPTCHA_THRESHOLD:
        guard.captcha_required = True
    guard.save(update_fields=["failed_attempts", "captcha_required", "updated_at"])


def _reset_docs_login_guard(user):
    if user is None:
        return
    guard = DocsLoginAttemptGuard.objects.filter(user=user).first()
    if guard is None:
        return
    guard.failed_attempts = 0
    guard.captcha_required = False
    guard.save(update_fields=["failed_attempts", "captcha_required", "updated_at"])


def _verify_docs_turnstile_token(token: str | None, remote_ip: str | None) -> bool:
    secret_key = str(getattr(settings, "TURNSTILE_SECRET_KEY", "") or "").strip()
    if not secret_key:
        return False
    response_token = str(token or "").strip()
    if not response_token:
        return False

    payload = {
        "secret": secret_key,
        "response": response_token,
    }
    if remote_ip:
        payload["remoteip"] = str(remote_ip).strip()

    try:
        response = httpx.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data=payload,
            timeout=5.0,
        )
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError):
        return False
    return bool(data.get("success"))


def _clear_docs_login_captcha(request):
    request.session.pop(DOCS_LOGIN_CAPTCHA_QUESTION_SESSION_KEY, None)
    request.session.pop(DOCS_LOGIN_CAPTCHA_ANSWER_SESSION_KEY, None)


def _build_docs_login_captcha(request, refresh: bool = False) -> str:
    if not refresh:
        existing_question = str(request.session.get(DOCS_LOGIN_CAPTCHA_QUESTION_SESSION_KEY, "") or "").strip()
        existing_answer = str(request.session.get(DOCS_LOGIN_CAPTCHA_ANSWER_SESSION_KEY, "") or "").strip()
        if existing_question and existing_answer:
            return existing_question

    left = secrets.randbelow(8) + 2
    right = secrets.randbelow(8) + 2
    question = f"{left} + {right} = ?"
    request.session[DOCS_LOGIN_CAPTCHA_QUESTION_SESSION_KEY] = question
    request.session[DOCS_LOGIN_CAPTCHA_ANSWER_SESSION_KEY] = str(left + right)
    request.session.modified = True
    return question


def _verify_docs_login_captcha_answer(request) -> bool:
    expected = str(request.session.get(DOCS_LOGIN_CAPTCHA_ANSWER_SESSION_KEY, "") or "").strip()
    provided = str(request.POST.get("docs-captcha-answer", "") or "").strip()
    if not expected or not provided:
        return False
    return provided == expected


@require_http_methods(["GET", "POST"])
def docs_login(request, ui_lang=None):
    resolved_lang = resolve_ui_lang(request, ui_lang)
    context = docs_common_context(request, resolved_lang)
    docs_text = context["docs_text"]
    next_url = resolve_next_url(request, context["docs_base_url"])

    if request.user.is_authenticated:
        return redirect(next_url)

    form = AuthenticationForm(request, data=request.POST or None)
    login_error_message = ""
    show_captcha = False
    captcha_question = ""
    turnstile_site_key = str(getattr(settings, "TURNSTILE_SITE_KEY", "") or "").strip()
    turnstile_secret_key = str(getattr(settings, "TURNSTILE_SECRET_KEY", "") or "").strip()

    if request.method == "POST":
        username_value = request.POST.get("username", "")
        target_user = _resolve_docs_login_target_user(username_value)
        show_captcha = _is_docs_login_captcha_required(target_user)

        if show_captcha:
            captcha_question = _build_docs_login_captcha(request)
            if not turnstile_site_key or not turnstile_secret_key:
                login_error_message = docs_text.get(
                    "auth_login_captcha_unavailable",
                    "캡챠 설정이 준비되지 않았습니다. 관리자에게 문의해주세요.",
                )
            elif not _verify_docs_login_captcha_answer(request) or not _verify_docs_turnstile_token(
                request.POST.get("cf-turnstile-response", ""),
                request.META.get("REMOTE_ADDR", ""),
            ):
                login_error_message = docs_text.get("auth_login_captcha_error", "캡챠 인증에 실패했습니다. 다시 시도해주세요.")
                captcha_question = _build_docs_login_captcha(request, refresh=True)
            elif form.is_valid():
                authed_user = form.get_user()
                _reset_docs_login_guard(authed_user)
                _clear_docs_login_captcha(request)
                auth_login(request, authed_user)
                return redirect(next_url)
            else:
                login_error_message = docs_text.get("auth_login_error", "아이디 또는 비밀번호를 확인해주세요.")
                captcha_question = _build_docs_login_captcha(request, refresh=True)
                if target_user is not None:
                    _register_docs_login_failure(target_user)
                    show_captcha = _is_docs_login_captcha_required(target_user)
        elif form.is_valid():
            authed_user = form.get_user()
            _reset_docs_login_guard(authed_user)
            _clear_docs_login_captcha(request)
            auth_login(request, authed_user)
            return redirect(next_url)
        else:
            login_error_message = docs_text.get("auth_login_error", "아이디 또는 비밀번호를 확인해주세요.")
            if target_user is not None:
                _register_docs_login_failure(target_user)
                show_captcha = _is_docs_login_captcha_required(target_user)
                if show_captcha:
                    captcha_question = _build_docs_login_captcha(request, refresh=True)
    context.update(
        {
            "docs_login_form": form,
            "docs_login_next": next_url,
            "docs_login_error_message": login_error_message,
            "docs_login_show_captcha": show_captcha,
            "docs_turnstile_site_key": turnstile_site_key,
            "docs_login_captcha_question": captcha_question,
        }
    )
    return render(request, "docs/login.html", context)


@require_http_methods(["POST"])
@csrf_protect
def docs_logout(request, ui_lang=None):
    resolved_lang = resolve_ui_lang(request, ui_lang)
    context = docs_common_context(request, resolved_lang)
    next_url = resolve_next_url(request, context["docs_base_url"])
    auth_logout(request)
    return redirect(next_url)


def docs_list(request, folder_path="", ui_lang=None):
    resolved_lang = resolve_ui_lang(request, ui_lang)
    context = docs_common_context(request, resolved_lang)
    docs_text = context["docs_text"]

    try:
        directory, current_dir = resolve_path(folder_path, must_exist=True)
    except (ValueError, FileNotFoundError):
        raise Http404("폴더를 찾을 수 없습니다.")

    if not directory.is_dir():
        raise Http404("폴더를 찾을 수 없습니다.")
    if not has_docs_read_access(request, current_dir):
        raise PermissionDenied("문서를 볼 권한이 없습니다.")

    context.update(
        {
            "current_dir": current_dir,
            "current_dir_display": current_dir or "/",
            "current_path_label": f"/docs/{current_dir}" if current_dir else "/docs",
            "current_dir_can_edit": has_docs_write_access(request, current_dir),
            "current_dir_can_write_children": has_docs_directory_write_access(request, current_dir),
            "breadcrumbs": build_docs_breadcrumbs(context["docs_base_url"], current_dir),
            "initial_entries": list_directory_entries(directory, request=request),
            "page_help_html": build_page_help_html(resolved_lang, "list", docs_text),
        }
    )
    return render(request, "docs/list.html", context)


def docs_view(request, doc_path, ui_lang=None):
    resolved_lang = resolve_ui_lang(request, ui_lang)
    context = docs_common_context(request, resolved_lang)
    docs_text = context["docs_text"]

    try:
        file_path, relative_file_path = normalize_docs_relative_path(doc_path, must_exist=True)
    except (ValueError, FileNotFoundError):
        raise Http404("문서를 찾을 수 없습니다.")
    if not has_docs_read_access(request, relative_file_path):
        raise PermissionDenied("문서를 볼 권한이 없습니다.")

    content = file_path.read_text(encoding="utf-8")
    rendered_content_html, render_profile = render_docs_content(
        content,
        file_path.suffix.lower(),
        source_path=file_path,
        request=request,
    )
    slug_path = markdown_slug_from_relative(relative_file_path)
    parent_dir = str(Path(relative_file_path).parent).replace("\\", "/")
    if parent_dir == ".":
        parent_dir = ""

    context.update(
        {
            "doc_title": file_path.name,
            "doc_relative_path": relative_file_path,
            "doc_slug_path": slug_path,
            "doc_parent_dir": parent_dir,
            "doc_can_edit": has_docs_write_access(request, relative_file_path),
            "doc_content_html": rendered_content_html,
            "doc_content_mode": render_profile["mode"],
            "doc_content_class": render_profile["css_class"],
            "view_breadcrumbs": build_docs_breadcrumbs(context["docs_base_url"], parent_dir),
            "view_current_file_name": file_path.name,
            "page_help_html": build_page_help_html(resolved_lang, "view", docs_text),
        }
    )
    return render(request, "docs/view.html", context)


def docs_write(request, ui_lang=None):
    resolved_lang = resolve_ui_lang(request, ui_lang)
    context = docs_common_context(request, resolved_lang)
    docs_text = context["docs_text"]

    requested_path = request.GET.get("path", "")
    requested_dir = request.GET.get("dir", "")

    mode = "create"
    original_relative_path = ""
    initial_filename = ""
    initial_extension = DOCS_FILE_EXTENSION
    initial_filename_input = ""
    initial_dir = ""
    initial_content = ""
    write_current_file_name = ""
    write_public_direct_save = False

    if requested_path:
        try:
            file_path, original_relative_path = normalize_markdown_relative_path(requested_path, must_exist=True)
        except (ValueError, FileNotFoundError):
            raise Http404("수정할 문서를 찾을 수 없습니다.")
        if not has_docs_write_access(request, original_relative_path):
            raise PermissionDenied("문서를 수정할 권한이 없습니다.")
        write_public_direct_save = is_docs_public_write_enabled(request, original_relative_path)

        mode = "edit"
        initial_filename = file_path.stem
        initial_extension = file_path.suffix.lower() if file_path.suffix else DOCS_FILE_EXTENSION
        initial_filename_input = f"{initial_filename}{initial_extension}"
        write_current_file_name = file_path.name
        parent_dir = str(Path(original_relative_path).parent).replace("\\", "/")
        initial_dir = "" if parent_dir == "." else parent_dir
        initial_content = file_path.read_text(encoding="utf-8")
    elif requested_dir:
        initial_dir = normalize_relative_path(requested_dir)
        target_dir, _ = resolve_path(initial_dir, must_exist=True)
        if not target_dir.is_dir():
            raise Http404("대상 폴더를 찾을 수 없습니다.")
        if not has_docs_directory_write_access(request, initial_dir):
            raise PermissionDenied("문서를 수정할 권한이 없습니다.")
    else:
        if not has_docs_directory_write_access(request, ""):
            raise PermissionDenied("문서를 수정할 권한이 없습니다.")

    markdown_help_path = resolve_markdown_help_file(resolved_lang)
    try:
        if markdown_help_path is not None:
            markdown_help_content = markdown_help_path.read_text(encoding="utf-8")
        else:
            markdown_help_content = (
                f"# {docs_text['markdown_help_fallback_title']}\n\n"
                f"{docs_text['markdown_help_fallback_missing']}"
            )
    except OSError:
        markdown_help_content = (
            f"# {docs_text['markdown_help_fallback_title']}\n\n"
            f"{docs_text['markdown_help_fallback_read_error']}"
        )

    context.update(
        {
            "write_mode": mode,
            "original_relative_path": original_relative_path,
            "initial_filename": initial_filename,
            "initial_extension": initial_extension,
            "write_is_markdown": initial_extension == DOCS_FILE_EXTENSION,
            "initial_filename_input": initial_filename_input,
            "initial_dir": initial_dir,
            "initial_content": initial_content,
            "available_directories": list_all_directories(request=request),
            "markdown_help_html": render_markdown_safely(markdown_help_content),
            "page_help_html": build_page_help_html(resolved_lang, "write", docs_text),
            "write_breadcrumbs": build_docs_breadcrumbs(context["docs_base_url"], initial_dir),
            "write_current_file_name": write_current_file_name,
            "write_public_direct_save": write_public_direct_save,
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


def parse_id_list(raw_value, field_name: str) -> list[int]:
    if raw_value in (None, ""):
        return []
    if not isinstance(raw_value, list):
        raise ValueError(f"{field_name} 형식이 올바르지 않습니다.")

    parsed_ids = []
    for item in raw_value:
        try:
            parsed = int(item)
        except (TypeError, ValueError):
            raise ValueError(f"{field_name} 형식이 올바르지 않습니다.")
        if parsed <= 0:
            continue
        parsed_ids.append(parsed)
    return sorted(set(parsed_ids))


def parse_path_values(payload: dict, allow_empty: bool) -> list[str]:
    if "paths" in payload:
        raw_paths = payload.get("paths")
        if not isinstance(raw_paths, list):
            raise ValueError("paths 형식이 올바르지 않습니다.")
        if len(raw_paths) == 0:
            raise ValueError("경로를 입력해주세요.")
        candidates = raw_paths
    else:
        candidates = [payload.get("path")]

    parsed_paths = []
    seen_paths = set()
    for candidate in candidates:
        normalized = normalize_relative_path(candidate, allow_empty=allow_empty)
        if normalized in seen_paths:
            continue
        seen_paths.add(normalized)
        parsed_paths.append(normalized)
    return parsed_paths


@require_http_methods(["GET"])
@require_docs_acl_admin_json
def docs_api_acl_options(request):
    public_group = get_docs_public_write_group()
    User = get_user_model()
    users = [
        {
            "id": user.id,
            "username": user.get_username(),
        }
        for user in User.objects.filter(is_active=True).order_by("username")
    ]
    groups = [
        {
            "id": public_group.id,
            "name": public_group.name,
            "label": get_public_group_display_label(request),
            "is_public_all": True,
        }
    ] + [
        {
            "id": group.id,
            "name": group.name,
            "label": group.name,
            "is_public_all": False,
        }
        for group in Group.objects.exclude(id=public_group.id).order_by("name")
    ]
    return JsonResponse({"ok": True, "users": users, "groups": groups})


@require_http_methods(["GET", "POST"])
@csrf_protect
@require_docs_acl_admin_json
def docs_api_acl(request):
    if request.method == "GET":
        rel_path_raw = request.GET.get("path", "")
        try:
            rel_path = normalize_relative_path(rel_path_raw, allow_empty=True)
            target_path_obj, rel_path = resolve_path(rel_path, must_exist=True)
        except (ValueError, FileNotFoundError) as exc:
            return json_error(str(exc), status=404)
    else:
        try:
            payload = parse_json_body(request)
        except ValueError as exc:
            return json_error(str(exc), status=400)

    if request.method == "GET":
        rule = DocsAccessRule.objects.filter(path=rel_path).prefetch_related(
            "read_users",
            "read_groups",
            "write_users",
            "write_groups",
        ).first()
        read_user_ids = sorted([user.id for user in rule.read_users.all()]) if rule else []
        read_group_ids = sorted([group.id for group in rule.read_groups.all()]) if rule else []
        write_user_ids = sorted([user.id for user in rule.write_users.all()]) if rule else []
        write_group_ids = sorted([group.id for group in rule.write_groups.all()]) if rule else []
        return JsonResponse(
            {
                "ok": True,
                "path": rel_path,
                "read_user_ids": read_user_ids,
                "read_group_ids": read_group_ids,
                "write_user_ids": write_user_ids,
                "write_group_ids": write_group_ids,
            }
        )

    try:
        read_user_ids = parse_id_list(payload.get("read_user_ids"), "read_user_ids")
        read_group_ids = parse_id_list(payload.get("read_group_ids"), "read_group_ids")
        write_user_ids = parse_id_list(payload.get("write_user_ids"), "write_user_ids")
        write_group_ids = parse_id_list(payload.get("write_group_ids"), "write_group_ids")
        path_values = parse_path_values(payload, allow_empty=True)
    except (ValueError, FileNotFoundError) as exc:
        return json_error(str(exc), status=400)

    resolved_targets: list[tuple[Path, str]] = []
    seen_paths = set()
    try:
        for path_value in path_values:
            resolved_path_obj, resolved_relative = resolve_path(path_value, must_exist=True)
            if resolved_relative in seen_paths:
                continue
            seen_paths.add(resolved_relative)
            resolved_targets.append((resolved_path_obj, resolved_relative))
    except (ValueError, FileNotFoundError) as exc:
        return json_error(str(exc), status=404)

    all_user_ids = sorted(set(read_user_ids) | set(write_user_ids))
    all_group_ids = sorted(set(read_group_ids) | set(write_group_ids))
    public_group_id = get_docs_public_write_group().id

    if any(path_obj.is_dir() for path_obj, _ in resolved_targets) and (
        public_group_id in read_group_ids or public_group_id in write_group_ids
    ):
        return json_error("폴더에는 전체 권한을 설정할 수 없습니다.", status=400)

    User = get_user_model()
    valid_user_ids = set(User.objects.filter(id__in=all_user_ids, is_active=True).values_list("id", flat=True))
    valid_group_ids = set(Group.objects.filter(id__in=all_group_ids).values_list("id", flat=True))
    if len(valid_user_ids) != len(all_user_ids) or len(valid_group_ids) != len(all_group_ids):
        return json_error("존재하지 않는 사용자 또는 그룹이 포함되어 있습니다.", status=400)

    target_paths = [relative_path for _, relative_path in resolved_targets]
    if not all_user_ids and not all_group_ids:
        DocsAccessRule.objects.filter(path__in=target_paths).delete()
        response_payload = {
            "ok": True,
            "paths": target_paths,
            "read_user_ids": [],
            "read_group_ids": [],
            "write_user_ids": [],
            "write_group_ids": [],
        }
        if len(target_paths) == 1:
            response_payload["path"] = target_paths[0]
        return JsonResponse(response_payload)

    read_users_queryset = User.objects.filter(id__in=read_user_ids)
    write_users_queryset = User.objects.filter(id__in=write_user_ids)
    read_groups_queryset = Group.objects.filter(id__in=read_group_ids)
    write_groups_queryset = Group.objects.filter(id__in=write_group_ids)

    with transaction.atomic():
        for target_path in target_paths:
            rule, _ = DocsAccessRule.objects.get_or_create(path=target_path)
            rule.read_users.set(read_users_queryset)
            rule.read_groups.set(read_groups_queryset)
            rule.write_users.set(write_users_queryset)
            rule.write_groups.set(write_groups_queryset)

    response_payload = {
        "ok": True,
        "paths": target_paths,
        "read_user_ids": read_user_ids,
        "read_group_ids": read_group_ids,
        "write_user_ids": write_user_ids,
        "write_group_ids": write_group_ids,
    }
    if len(target_paths) == 1:
        response_payload["path"] = target_paths[0]
    return JsonResponse(response_payload)


@require_http_methods(["GET"])
def docs_api_list(request):
    rel_path = request.GET.get("path", "")

    try:
        target_dir, normalized = resolve_path(rel_path, must_exist=True)
    except (ValueError, FileNotFoundError) as exc:
        return json_error(str(exc), status=404)

    if not target_dir.is_dir():
        return json_error("폴더 경로가 아닙니다.", status=400)
    if not has_docs_read_access(request, normalized):
        return json_error("문서를 볼 권한이 없습니다.", status=403)

    return JsonResponse(
        {
            "ok": True,
            "path": normalized,
            "entries": list_directory_entries(target_dir, request=request),
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
    if not has_docs_write_access(request, source_relative):
        return json_error("문서를 수정할 권한이 없습니다.", status=403)
    if source_path.is_file() and is_docs_public_write_enabled(request, source_relative):
        return json_error("전체 허용 파일은 이름을 바꿀 수 없습니다.", status=403)

    parent = source_path.parent
    if source_path.is_file():
        source_extension = source_path.suffix.lower()
        try:
            source_extension = normalize_file_extension(source_extension)
        except ValueError:
            return json_error("문서 파일만 이름을 바꿀 수 있습니다.", status=400)
        candidate_name = validate_name(new_name, for_file=True, file_extension=source_extension)
        destination = parent / f"{candidate_name}{source_extension}"
    else:
        destination = parent / new_name

    if destination.exists() and destination.resolve() != source_path.resolve():
        return json_error("같은 이름의 항목이 이미 존재합니다.", status=409)

    source_path.rename(destination)
    relative_destination = relative_from_root(destination)
    move_docs_acl_rules(source_relative, relative_destination)

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
        path_values = parse_path_values(payload, allow_empty=False)
    except (ValueError, FileNotFoundError) as exc:
        return json_error(str(exc), status=400)

    resolved_targets: list[tuple[Path, str]] = []
    seen_paths = set()
    try:
        for path_value in path_values:
            target_path, target_relative = resolve_path(path_value, must_exist=True)
            if target_relative in seen_paths:
                continue
            seen_paths.add(target_relative)
            resolved_targets.append((target_path, target_relative))
    except (ValueError, FileNotFoundError) as exc:
        return json_error(str(exc), status=400)

    for target_path, target_relative in resolved_targets:
        if target_relative == "":
            return json_error("루트 폴더는 삭제할 수 없습니다.", status=400)
        if not has_docs_write_access(request, target_relative):
            return json_error("문서를 수정할 권한이 없습니다.", status=403)
        if target_path.is_file() and is_docs_public_write_enabled(request, target_relative):
            return json_error("전체 허용 파일은 삭제할 수 없습니다.", status=403)
        if target_path.is_file():
            try:
                normalize_file_extension(target_path.suffix.lower())
            except ValueError:
                return json_error("문서 파일만 삭제할 수 있습니다.", status=400)

    selected_directory_paths = {
        target_relative
        for target_path, target_relative in resolved_targets
        if target_path.is_dir()
    }
    effective_targets: list[tuple[Path, str]] = []
    for target_path, target_relative in resolved_targets:
        is_descendant_of_selected_directory = any(
            target_relative != selected_dir and target_relative.startswith(f"{selected_dir}/")
            for selected_dir in selected_directory_paths
        )
        if is_descendant_of_selected_directory:
            continue
        effective_targets.append((target_path, target_relative))

    deleted_paths = []
    for target_path, target_relative in effective_targets:
        if target_path.is_dir():
            shutil.rmtree(target_path)
        else:
            target_path.unlink()
        delete_docs_acl_rules_for_path(target_relative)
        deleted_paths.append(target_relative)

    return JsonResponse({"ok": True, "deleted_paths": deleted_paths})


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
    if not has_docs_directory_write_access(request, parent_dir):
        return json_error("문서를 수정할 권한이 없습니다.", status=403)

    target_path = parent_path / folder_name
    if target_path.exists():
        return json_error("같은 이름의 폴더가 이미 존재합니다.", status=409)

    target_path.mkdir(parents=False, exist_ok=False)
    return JsonResponse({"ok": True, "path": relative_from_root(target_path)})


@require_http_methods(["POST"])
@csrf_protect
def docs_api_move(request):
    try:
        payload = parse_json_body(request)
        source_path_value = normalize_relative_path(payload.get("source_path"), allow_empty=False)
        target_dir_value = normalize_relative_path(payload.get("target_dir"), allow_empty=True)
        source_path, source_relative = resolve_path(source_path_value, must_exist=True)
        target_dir_path, target_dir_relative = resolve_path(target_dir_value, must_exist=True)
    except (ValueError, FileNotFoundError) as exc:
        return json_error(str(exc), status=400)

    if source_relative == "":
        return json_error("루트 폴더는 이동할 수 없습니다.", status=400)
    if not target_dir_path.is_dir():
        return json_error("이동 대상 경로가 폴더가 아닙니다.", status=400)
    if not has_docs_write_access(request, source_relative):
        return json_error("문서를 수정할 권한이 없습니다.", status=403)
    if source_path.is_file() and is_docs_public_write_enabled(request, source_relative):
        return json_error("전체 허용 파일은 이동할 수 없습니다.", status=403)
    if not has_docs_directory_write_access(request, target_dir_relative):
        return json_error("문서를 수정할 권한이 없습니다.", status=403)

    source_parent_relative = normalize_relative_path(
        str(Path(source_relative).parent).replace("\\", "/"),
        allow_empty=True,
    )
    if source_parent_relative == ".":
        source_parent_relative = ""
    if source_parent_relative == target_dir_relative:
        response = {
            "ok": True,
            "path": source_relative,
            "type": "dir" if source_path.is_dir() else "file",
        }
        if source_path.is_file():
            response["slug_path"] = markdown_slug_from_relative(source_relative)
        return JsonResponse(response)

    destination_path = target_dir_path / source_path.name
    if destination_path.exists():
        return json_error("같은 이름의 항목이 이미 존재합니다.", status=409)

    if source_path.is_dir():
        source_resolved = source_path.resolve()
        target_resolved = target_dir_path.resolve()
        if target_resolved == source_resolved or source_resolved in target_resolved.parents:
            return json_error("폴더를 자기 자신 또는 하위 폴더로 이동할 수 없습니다.", status=400)

    source_path.rename(destination_path)
    destination_relative = relative_from_root(destination_path)
    move_docs_acl_rules(source_relative, destination_relative)

    response = {
        "ok": True,
        "path": destination_relative,
        "type": "dir" if destination_path.is_dir() else "file",
    }
    if destination_path.is_file():
        response["slug_path"] = markdown_slug_from_relative(destination_relative)
    return JsonResponse(response)


@require_http_methods(["POST"])
@csrf_protect
def docs_api_preview(request):
    try:
        payload = parse_json_body(request)
        preview_relative_path = normalize_relative_path(payload.get("path"), allow_empty=True)
        if preview_relative_path:
            file_path, relative_file_path = normalize_docs_relative_path(
                preview_relative_path, must_exist=True
            )
            if not has_docs_read_access(request, relative_file_path):
                return json_error("문서를 볼 권한이 없습니다.", status=403)
            content = file_path.read_text(encoding="utf-8")
            rendered_html, render_profile = render_docs_content(
                content,
                file_path.suffix.lower(),
                source_path=file_path,
                request=request,
            )
            return JsonResponse(
                {
                    "ok": True,
                    "html": rendered_html,
                    "path": relative_file_path,
                    "slug_path": markdown_slug_from_relative(relative_file_path),
                    "title": file_path.name,
                    "render_mode": render_profile["mode"],
                    "render_class": render_profile["css_class"],
                }
            )

        original_relative_path = normalize_relative_path(payload.get("original_path"), allow_empty=True)
        preview_extension = normalize_file_extension(payload.get("extension"), allow_empty=True)
        content = payload.get("content", "")
        if not isinstance(content, str):
            raise ValueError("문서 내용 형식이 올바르지 않습니다.")
    except ValueError as exc:
        return json_error(str(exc), status=400)

    source_extension = preview_extension or DOCS_FILE_EXTENSION
    source_path = None
    if original_relative_path:
        try:
            source_path, source_relative = normalize_docs_relative_path(
                original_relative_path, must_exist=True
            )
        except (ValueError, FileNotFoundError) as exc:
            return json_error(str(exc), status=400)
        source_extension = source_path.suffix.lower() if source_path.suffix else DOCS_FILE_EXTENSION
        if not has_docs_write_access(request, source_relative):
            return json_error("문서를 수정할 권한이 없습니다.", status=403)
    else:
        if not has_docs_directory_write_access(request, ""):
            return json_error("문서를 수정할 권한이 없습니다.", status=403)

    rendered_html, render_profile = render_docs_content(
        content,
        source_extension,
        source_path=source_path,
        request=request,
    )
    return JsonResponse(
        {
            "ok": True,
            "html": rendered_html,
            "render_mode": render_profile["mode"],
            "render_class": render_profile["css_class"],
        }
    )


@require_http_methods(["POST"])
@csrf_protect
def docs_api_save(request):
    try:
        payload = parse_json_body(request)
        original_relative_path = normalize_relative_path(payload.get("original_path"), allow_empty=True)
        target_dir = normalize_relative_path(payload.get("target_dir"), allow_empty=True)
        requested_extension = normalize_file_extension(payload.get("extension"), allow_empty=True)
        content = payload.get("content", "")
        if not isinstance(content, str):
            raise ValueError("문서 내용 형식이 올바르지 않습니다.")

        target_dir_path, target_dir_rel = resolve_path(target_dir, must_exist=True)
        if not target_dir_path.is_dir():
            raise ValueError("저장 위치가 폴더가 아닙니다.")
        source_path = None
        source_relative = ""
        source_is_public_write = False
        source_extension = DOCS_FILE_EXTENSION
        if original_relative_path:
            source_path, source_relative = normalize_markdown_relative_path(
                original_relative_path, must_exist=True
            )
            source_extension = source_path.suffix.lower() if source_path.suffix else DOCS_FILE_EXTENSION
            if not has_docs_write_access(request, source_relative):
                return json_error("문서를 수정할 권한이 없습니다.", status=403)
            source_is_public_write = is_docs_public_write_enabled(request, source_relative)

        target_extension = requested_extension or source_extension or DOCS_FILE_EXTENSION
        if source_is_public_write:
            target_extension = source_extension

        filename = validate_name(
            payload.get("filename"),
            for_file=True,
            file_extension=target_extension,
        )
        destination = target_dir_path / f"{filename}{target_extension}"
        destination_exists = destination.exists()
        is_same_as_source = bool(
            source_path is not None and destination_exists and destination.resolve() == source_path.resolve()
        )

        if source_is_public_write and not is_same_as_source:
            return json_error("전체 허용 파일은 위치나 이름을 바꿀 수 없습니다.", status=403)

        if source_path is None or not is_same_as_source:
            if not has_docs_directory_write_access(request, target_dir_rel):
                return json_error("문서를 수정할 권한이 없습니다.", status=403)

        if destination.exists():
            if source_path is None or destination.resolve() != source_path.resolve():
                return json_error("같은 이름의 파일이 이미 존재합니다.", status=409)

    except (ValueError, FileNotFoundError) as exc:
        return json_error(str(exc), status=400)

    destination.write_text(content, encoding="utf-8")

    if source_path is not None and destination.resolve() != source_path.resolve():
        move_docs_acl_rules(source_relative, relative_from_root(destination))
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
        file_path, rel_path = normalize_docs_relative_path(request.GET.get("path"), must_exist=True)
    except (ValueError, FileNotFoundError):
        raise Http404("다운로드할 파일을 찾을 수 없습니다.")
    if not has_docs_read_access(request, rel_path):
        raise PermissionDenied("문서를 볼 권한이 없습니다.")

    return FileResponse(file_path.open("rb"), as_attachment=True, filename=file_path.name)
