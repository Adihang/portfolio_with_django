"""
Git 관련 Celery 비동기 태스크

핵심 원칙:
  - Git 작업은 반드시 Worker에서 실행 (동기 처리 금지)
  - select_for_update()로 동시 실행 방지
  - 항상 /tmp 임시 디렉토리 cleanup (finally 블록)
  - subprocess 실패 시 stderr를 error_message에 저장
"""
import io
import logging
import os
import shutil
import subprocess
import uuid

from celery import shared_task
from django.db import transaction

from django.conf import settings

from .forgejo_client import ForgejoClient
from .models import GitRepository, GitUserMapping

logger = logging.getLogger(__name__)


def _make_placeholder_png() -> bytes:
    """profile-placeholder.svg 디자인을 Pillow로 PNG 재현.
    Forgejo 아바타 API는 SVG 미지원이므로 PNG로 변환.
    """
    from PIL import Image, ImageDraw

    size = 256
    body_color = (154, 167, 184, 255)   # #9aa7b8

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 배경 원 (그라데이션 #f1f4f8→#dde3eb 를 단색으로 근사)
    draw.ellipse([8, 8, 247, 247], fill=(225, 229, 235, 255))

    # 머리: circle cx=128, cy=100, r=44
    draw.ellipse([84, 56, 172, 144], fill=body_color)

    # 몸통: SVG path M50 214 c8-42 39-67 78-67 → 타원 중심 (128,214), 반축 78×67
    # 외부 원 마스크가 y=247 이하를 자연스럽게 클리핑
    draw.ellipse([50, 147, 206, 281], fill=body_color)

    # 외부 원 마스크로 클리핑
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([8, 8, 247, 247], fill=255)
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.paste(img, mask=mask)

    buf = io.BytesIO()
    result.save(buf, format="PNG")
    return buf.getvalue()


def _get_avatar_bytes(user) -> bytes:
    """유저 프로필 사진 바이너리 반환. 없으면 placeholder PNG."""
    try:
        profile = user.portfolio_profile
        if profile.profile_img:
            with open(profile.profile_img.path, "rb") as f:
                return f.read()
    except Exception:
        pass
    return _make_placeholder_png()

# launchd 환경에서 PATH 의존 제거 — 절대 경로 사용
GIT_BIN = "/usr/bin/git"


def _abs_handrive_path(owner, relative_path: str) -> str:
    """handrive_path (docs_root 기준 상대 경로) → 절대 파일시스템 경로.
    슈퍼유저: docs_root = BASE_DIR
    일반 유저: docs_root = MEDIA_ROOT/HanDrive
    """
    from pathlib import Path
    if owner.is_superuser:
        root = Path(settings.BASE_DIR).resolve()
    else:
        root = (Path(settings.MEDIA_ROOT) / "HanDrive").resolve()
    return str((root / relative_path).resolve())


def _ensure_gitea_user_token(client: ForgejoClient, user) -> "GitUserMapping":
    """Gitea 계정 + PAT 준비 후 GitUserMapping 저장/갱신.
    이미 매핑과 토큰이 있으면 API 호출 없이 기존 레코드 반환.
    """
    try:
        mapping = GitUserMapping.objects.get(user=user)
        if mapping.forgejo_token:
            return mapping
    except GitUserMapping.DoesNotExist:
        mapping = None

    # 토큰이 없거나 매핑이 없는 경우 — Gitea 유저 생성 + PAT 발급
    gitea_user, token = client.ensure_user_with_token(
        user.username,
        getattr(user, "email", "") or "",
    )
    mapping, _ = GitUserMapping.objects.update_or_create(
        user=user,
        defaults={
            "forgejo_user_id":  gitea_user["id"],
            "forgejo_username": gitea_user["login"],
            "forgejo_token":    token,
        },
    )
    return mapping


def _run(cmd: list, timeout: int = 60, **kwargs):
    """subprocess 래퍼 — 실패 시 stderr 포함 예외 발생"""
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        **kwargs,
    )
    if result.returncode != 0:
        raise Exception(f"{cmd[0]} failed: {result.stderr.strip()}")
    return result


def _setup_local_git(client: ForgejoClient, abs_path: str, repo, mapping) -> None:
    """HanDrive 폴더의 .git을 유저 인증 URL·git config로 세팅.

    - origin 없으면 add, 있으면 set-url
    - user.name / user.email 을 repo owner 기준으로 설정
    """
    user_url = client.user_authed_clone_url(
        repo.forgejo_clone_http_url,
        mapping.forgejo_username,
        mapping.forgejo_token,
    )

    origin_check = subprocess.run(
        [GIT_BIN, "-C", abs_path, "remote", "get-url", "origin"],
        capture_output=True, timeout=10,
    )
    if origin_check.returncode == 0:
        _run([GIT_BIN, "-C", abs_path, "remote", "set-url", "origin", user_url], timeout=10)
    else:
        _run([GIT_BIN, "-C", abs_path, "remote", "add", "origin", user_url], timeout=10)

    owner = repo.owner
    _run([GIT_BIN, "-C", abs_path, "config", "user.name", owner.username], timeout=10)
    _run([GIT_BIN, "-C", abs_path, "config", "user.email",
          getattr(owner, "email", "") or f"{owner.username}@hanplanet.local"], timeout=10)


@shared_task
def create_repo_task(repo_id: int) -> None:
    """
    일반 Handrive 폴더 → Forgejo Git 저장소 생성

    단계:
      1. Forgejo repo 생성 (이미 존재하면 get fallback)
      2. clone URL 즉시 DB 저장
      3. shallow clone (→ /tmp)
      4. git user 설정
      5. rsync로 파일 복사 (.git 제외)
      6. README.md 없으면 자동 생성
      7. 변경 사항 있을 때만 commit
      8. push
      9. /tmp/.git → HanDrive 폴더에 복사 (.git 세팅)
     10. origin을 유저 인증 URL로 재설정
     11. status = active
    """
    tmp = f"/tmp/{repo_id}_{uuid.uuid4().hex}"
    repo = None

    try:
        with transaction.atomic():
            repo = GitRepository.objects.select_for_update().get(id=repo_id)

        # idempotency 보호 — pending 상태일 때만 실행
        if repo.status not in ("pending_create", "pending_import"):
            return

        client = ForgejoClient()

        # Gitea 유저 준비 + PAT 발급 (없는 경우만)
        mapping = _ensure_gitea_user_token(client, repo.owner)

        # handrive_path → 절대 경로 변환
        abs_path = _abs_handrive_path(repo.owner, repo.handrive_path)

        # Forgejo repo 생성 (이미 존재하면 get fallback)
        try:
            forgejo_repo = client.create_repo(repo.owner.username, repo.repo_name)
        except Exception:
            forgejo_repo = client.get_repo(repo.owner.username, repo.repo_name)

        # clone URL 즉시 저장 (push 전에 미리 보존)
        repo.forgejo_repo_id        = forgejo_repo["id"]
        repo.forgejo_owner          = forgejo_repo["owner"]["login"]
        repo.forgejo_repo_name      = forgejo_repo["name"]
        repo.forgejo_clone_http_url = forgejo_repo["clone_url"]
        repo.forgejo_clone_ssh_url  = forgejo_repo.get("ssh_url", "")
        repo.save(update_fields=[
            "forgejo_repo_id", "forgejo_owner", "forgejo_repo_name",
            "forgejo_clone_http_url", "forgejo_clone_ssh_url", "updated_at",
        ])

        # shallow clone — 내부 URL 사용 (공개 도메인은 Celery에서 접근 불가)
        internal_url = client.internal_authed_clone_url(
            forgejo_repo["owner"]["login"], forgejo_repo["name"]
        )
        _run([GIT_BIN, "clone", "--depth=1", internal_url, tmp])

        # git user 설정 (launchd 환경에 전역 git config 없을 수 있음)
        _run([GIT_BIN, "-C", tmp, "config", "user.name", "hanplanet"], timeout=10)
        _run([GIT_BIN, "-C", tmp, "config", "user.email", "system@hanplanet"], timeout=10)

        # rsync로 파일 복사 (.git 폴더 제외)
        _run(["rsync", "-a", "--exclude=.git", abs_path + "/", tmp + "/"], timeout=60)

        # README.md 없으면 자동 생성 (repo 이름을 heading으로)
        readme_path = os.path.join(tmp, "README.md")
        if not os.path.exists(readme_path):
            with open(readme_path, "w", encoding="utf-8") as f:
                f.write(f"# {repo.repo_name}\n")

        # 변경 사항이 있을 때만 commit
        status_result = subprocess.run(
            [GIT_BIN, "-C", tmp, "status", "--porcelain"],
            capture_output=True, text=True,
        )
        if status_result.stdout.strip():
            _run([GIT_BIN, "-C", tmp, "add", "."], timeout=30)
            _run([GIT_BIN, "-C", tmp, "commit", "-m", "Initial commit"], timeout=30)

        _run([GIT_BIN, "-C", tmp, "push", internal_url])

        # HanDrive 폴더에 .git 설치
        # (create_repo는 .git 없는 폴더 대상이므로 기존 .git이 있으면 교체)
        abs_git_path = os.path.join(abs_path, ".git")
        if os.path.exists(abs_git_path):
            shutil.rmtree(abs_git_path)
        shutil.copytree(os.path.join(tmp, ".git"), abs_git_path)

        # origin을 유저 인증 URL로 재설정 + git config
        _setup_local_git(client, abs_path, repo, mapping)

        repo.status = "active"
        repo.error_message = None
        repo.save(update_fields=["status", "error_message", "updated_at"])

    except Exception as exc:
        logger.exception(
            "create_repo_task failed",
            extra={"repo_id": repo_id, "user_id": repo.owner_id if repo else None},
        )
        if repo:
            repo.status = "failed"
            repo.error_message = str(exc)
            try:
                repo.save(update_fields=["status", "error_message", "updated_at"])
            except Exception:
                pass

    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@shared_task
def import_repo_task(repo_id: int) -> None:
    """
    기존 .git 폴더 → Forgejo mirror push 후 origin 재설정

    단계:
      1. Forgejo repo 생성 (이미 존재하면 get fallback)
      2. clone URL 즉시 DB 저장
      3. forgejo remote 추가 (중복 제거 후)
      4. mirror push
      5. status = active 저장
      6. forgejo remote 제거
      7. origin을 유저 인증 URL로 재설정 (.git 유지)
    """
    repo = None

    try:
        with transaction.atomic():
            repo = GitRepository.objects.select_for_update().get(id=repo_id)

        if repo.status not in ("pending_create", "pending_import"):
            return

        client = ForgejoClient()

        # Gitea 유저 준비 + PAT 발급 (없는 경우만)
        mapping = _ensure_gitea_user_token(client, repo.owner)

        # handrive_path → 절대 경로 변환
        abs_path = _abs_handrive_path(repo.owner, repo.handrive_path)

        try:
            forgejo_repo = client.create_repo(repo.owner.username, repo.repo_name)
        except Exception:
            forgejo_repo = client.get_repo(repo.owner.username, repo.repo_name)

        repo.forgejo_repo_id        = forgejo_repo["id"]
        repo.forgejo_owner          = forgejo_repo["owner"]["login"]
        repo.forgejo_repo_name      = forgejo_repo["name"]
        repo.forgejo_clone_http_url = forgejo_repo["clone_url"]
        repo.forgejo_clone_ssh_url  = forgejo_repo.get("ssh_url", "")
        repo.save(update_fields=[
            "forgejo_repo_id", "forgejo_owner", "forgejo_repo_name",
            "forgejo_clone_http_url", "forgejo_clone_ssh_url", "updated_at",
        ])

        # remote 중복 방지: 먼저 제거 시도 (없어도 무시)
        subprocess.run(
            [GIT_BIN, "-C", abs_path, "remote", "remove", "forgejo"],
            capture_output=True, timeout=10,
        )
        internal_url = client.internal_authed_clone_url(
            forgejo_repo["owner"]["login"], forgejo_repo["name"]
        )
        _run(
            [GIT_BIN, "-C", abs_path, "remote", "add", "forgejo", internal_url],
            timeout=10,
        )
        # 대용량 repo 대응 — timeout 넉넉하게
        _run(
            [GIT_BIN, "-C", abs_path, "push", "--mirror", "forgejo"],
            timeout=600,
        )

        # push 성공 확인 후 status 저장 (순서 중요: remote 재설정 전에 active 기록)
        repo.status = "active"
        repo.error_message = None
        repo.save(update_fields=["status", "error_message", "updated_at"])

        # forgejo remote 제거 후 origin을 유저 인증 URL로 재설정 (.git 유지)
        subprocess.run(
            [GIT_BIN, "-C", abs_path, "remote", "remove", "forgejo"],
            capture_output=True, timeout=10,
        )
        _setup_local_git(client, abs_path, repo, mapping)

    except Exception as exc:
        logger.exception(
            "import_repo_task failed",
            extra={"repo_id": repo_id, "user_id": repo.owner_id if repo else None},
        )
        if repo:
            repo.status = "failed"
            repo.error_message = str(exc)
            try:
                repo.save(update_fields=["status", "error_message", "updated_at"])
            except Exception:
                pass


@shared_task(bind=True, max_retries=2, ignore_result=True)
def sync_gitea_password(self, user_id: int, raw_password: str):
    """Django 로그인/회원가입 시 Gitea 비밀번호를 Django 비밀번호와 동기화.
    GitUserMapping(= Gitea 계정)이 없으면 조용히 종료.
    """
    try:
        mapping = GitUserMapping.objects.select_related("user").get(user_id=user_id)
    except GitUserMapping.DoesNotExist:
        return

    try:
        client = ForgejoClient()
        client._set_user_password(mapping.forgejo_username, raw_password)
    except Exception as exc:
        logger.warning("sync_gitea_password failed for user_id=%s: %s", user_id, exc)
        raise self.retry(exc=exc, countdown=10)


@shared_task(bind=True, max_retries=2, ignore_result=True)
def sync_gitea_avatar_task(self, user_id: int):
    """Hanplanet 프로필 사진 → Forgejo 아바타 동기화.
    프로필 사진이 없으면 placeholder PNG 사용.
    GitUserMapping이 없으면 조용히 종료 (아직 Git 미사용 유저).
    """
    try:
        mapping = GitUserMapping.objects.select_related("user").get(user_id=user_id)
    except GitUserMapping.DoesNotExist:
        return

    if not mapping.forgejo_token:
        logger.debug("sync_gitea_avatar_task: no token for user_id=%s, skipping", user_id)
        return

    try:
        image_bytes = _get_avatar_bytes(mapping.user)
        client = ForgejoClient()
        client.update_user_avatar(mapping.forgejo_token, image_bytes)
        logger.info("sync_gitea_avatar_task: avatar synced for user_id=%s", user_id)
    except Exception as exc:
        logger.warning("sync_gitea_avatar_task failed for user_id=%s: %s", user_id, exc)
        raise self.retry(exc=exc, countdown=30)
