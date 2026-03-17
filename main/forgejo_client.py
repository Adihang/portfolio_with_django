"""
Forgejo API 클라이언트

설정:
  settings.FORGEJO_BASE_URL    — Forgejo 서버 내부 URL (예: http://localhost:3000)
  settings.FORGEJO_ADMIN_TOKEN — Forgejo 관리자 API 토큰
"""
import secrets
import requests
from urllib.parse import urlparse, urlunparse
from django.conf import settings


class ForgejoClient:

    @property
    def _base_url(self) -> str:
        return str(getattr(settings, "FORGEJO_BASE_URL", "http://localhost:3000")).rstrip("/")

    @property
    def _token(self) -> str:
        return str(getattr(settings, "FORGEJO_ADMIN_TOKEN", ""))

    @property
    def _headers(self) -> dict:
        return {"Authorization": f"token {self._token}"}

    def authed_clone_url(self, clone_url: str) -> str:
        """clone_url에 admin 토큰을 삽입 — private repo clone/push용"""
        parsed = urlparse(clone_url)
        authed = parsed._replace(netloc=f"admin:{self._token}@{parsed.hostname}:{parsed.port or 3000}")
        return urlunparse(authed)

    # ──────────────────────────────────────────
    # User
    # ──────────────────────────────────────────

    def ensure_user(self, username: str, email: str = "") -> dict:
        """Gitea 유저가 없으면 생성, 있으면 그대로 반환"""
        get_url = f"{self._base_url}/api/v1/users/{username}"
        resp = requests.get(get_url, headers=self._headers, timeout=15)
        if resp.status_code == 200:
            return resp.json()

        # 없으면 admin API로 생성
        create_url = f"{self._base_url}/api/v1/admin/users"
        if not email:
            email = f"{username}@hanplanet.local"
        resp = requests.post(
            create_url,
            headers=self._headers,
            json={
                "username":              username,
                "email":                 email,
                "password":              secrets.token_urlsafe(24),
                "must_change_password":  False,
                "source_id":             0,
                "login_name":            username,
                "send_notify":           False,
            },
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()

    # ──────────────────────────────────────────
    # Repository
    # ──────────────────────────────────────────

    def create_repo(self, username: str, repo_name: str) -> dict:
        """Forgejo에 private 저장소 생성 (해당 유저 계정 아래)"""
        # 유저가 없으면 먼저 생성
        self.ensure_user(username)
        url = f"{self._base_url}/api/v1/admin/users/{username}/repos"
        resp = requests.post(
            url,
            headers=self._headers,
            json={
                "name":      repo_name,
                "private":   True,
                "auto_init": False,
            },
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()

    def get_repo(self, owner: str, repo_name: str) -> dict:
        """저장소 조회 — create 실패 시 fallback"""
        url = f"{self._base_url}/api/v1/repos/{owner}/{repo_name}"
        resp = requests.get(url, headers=self._headers, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def delete_repo(self, owner: str, repo_name: str) -> None:
        """저장소 삭제"""
        url = f"{self._base_url}/api/v1/repos/{owner}/{repo_name}"
        resp = requests.delete(url, headers=self._headers, timeout=15)
        if resp.status_code not in (204, 404):
            resp.raise_for_status()

    # ──────────────────────────────────────────
    # Collaborators
    # ──────────────────────────────────────────

    def add_collaborator(self, owner: str, repo_name: str, username: str, permission: str) -> None:
        """협업자 추가 (permission: read / write / admin)"""
        url = f"{self._base_url}/api/v1/repos/{owner}/{repo_name}/collaborators/{username}"
        resp = requests.put(
            url,
            headers=self._headers,
            json={"permission": permission},
            timeout=15,
        )
        resp.raise_for_status()

    def remove_collaborator(self, owner: str, repo_name: str, username: str) -> None:
        """협업자 제거"""
        url = f"{self._base_url}/api/v1/repos/{owner}/{repo_name}/collaborators/{username}"
        resp = requests.delete(url, headers=self._headers, timeout=15)
        if resp.status_code not in (204, 404):
            resp.raise_for_status()
