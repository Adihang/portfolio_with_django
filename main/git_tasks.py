"""
Git 관련 Celery 비동기 태스크

핵심 원칙:
  - Git 작업은 반드시 Worker에서 실행 (동기 처리 금지)
  - select_for_update()로 동시 실행 방지
  - 항상 /tmp 임시 디렉토리 cleanup (finally 블록)
  - subprocess 실패 시 stderr를 error_message에 저장
"""
import logging
import os
import shutil
import subprocess
import uuid

from celery import shared_task
from django.db import transaction

from .forgejo_client import ForgejoClient
from .models import GitRepository

logger = logging.getLogger(__name__)

# launchd 환경에서 PATH 의존 제거 — 절대 경로 사용
GIT_BIN = "/usr/bin/git"


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


@shared_task
def create_repo_task(repo_id: int) -> None:
    """
    일반 Handrive 폴더 → Forgejo Git 저장소 생성

    단계:
      1. Forgejo repo 생성 (이미 존재하면 get fallback)
      2. clone URL 즉시 DB 저장
      3. shallow clone
      4. git user 설정
      5. rsync로 파일 복사 (.git 제외)
      6. 변경 사항 있을 때만 commit
      7. push
      8. status = active
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

        # Forgejo repo 생성 (이미 존재하면 get fallback)
        # 계정 관리는 Django 담당 — Gitea는 admin 단일 계정으로 운영
        try:
            forgejo_repo = client.create_repo(repo.owner.username, repo.repo_name)
        except Exception:
            forgejo_repo = client.get_repo(repo.repo_name)

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

        # shallow clone — 토큰 인증 포함 (private repo)
        authed_url = client.authed_clone_url(forgejo_repo["clone_url"])
        _run([GIT_BIN, "clone", "--depth=1", authed_url, tmp])

        # git user 설정 (launchd 환경에 전역 git config 없을 수 있음)
        _run([GIT_BIN, "-C", tmp, "config", "user.name", "hanplanet"], timeout=10)
        _run([GIT_BIN, "-C", tmp, "config", "user.email", "system@hanplanet"], timeout=10)

        # rsync로 파일 복사 (.git 폴더 제외)
        _run(["rsync", "-a", "--exclude=.git", repo.handrive_path + "/", tmp + "/"], timeout=60)

        # 변경 사항이 있을 때만 commit (빈 폴더 방어)
        status_result = subprocess.run(
            [GIT_BIN, "-C", tmp, "status", "--porcelain"],
            capture_output=True, text=True,
        )
        if status_result.stdout.strip():
            _run([GIT_BIN, "-C", tmp, "add", "."], timeout=30)
            _run([GIT_BIN, "-C", tmp, "commit", "-m", "Initial commit"], timeout=30)

        _run([GIT_BIN, "-C", tmp, "push", authed_url])

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
    기존 .git 폴더 → Forgejo mirror push 후 .git 제거

    단계:
      1. Forgejo repo 생성 (이미 존재하면 get fallback)
      2. clone URL 즉시 DB 저장
      3. forgejo remote 추가 (중복 제거 후)
      4. mirror push
      5. status = active 저장
      6. .git 폴더 삭제 (push 성공 이후)
    """
    repo = None

    try:
        with transaction.atomic():
            repo = GitRepository.objects.select_for_update().get(id=repo_id)

        if repo.status not in ("pending_create", "pending_import"):
            return

        client = ForgejoClient()

        try:
            forgejo_repo = client.create_repo(repo.owner.username, repo.repo_name)
        except Exception:
            forgejo_repo = client.get_repo(repo.repo_name)

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
            [GIT_BIN, "-C", repo.handrive_path, "remote", "remove", "forgejo"],
            capture_output=True, timeout=10,
        )
        authed_url = client.authed_clone_url(forgejo_repo["clone_url"])
        _run(
            [GIT_BIN, "-C", repo.handrive_path, "remote", "add", "forgejo", authed_url],
            timeout=10,
        )
        # 대용량 repo 대응 — timeout 넉넉하게
        _run(
            [GIT_BIN, "-C", repo.handrive_path, "push", "--mirror", "forgejo"],
            timeout=600,
        )

        # push 성공 확인 후 status 저장 (순서 중요: .git 삭제 전에 active 기록)
        repo.status = "active"
        repo.error_message = None
        repo.save(update_fields=["status", "error_message", "updated_at"])

        # push 완료 이후 .git 제거
        shutil.rmtree(os.path.join(repo.handrive_path, ".git"), ignore_errors=True)

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
