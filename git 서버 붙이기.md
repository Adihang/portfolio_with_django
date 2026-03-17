
---

# 🚀 Hanplanet Git Integration — Full Stack 설계서

---

# 1. 🧠 전체 개념 (핵심 한 문장)

> Handrive는 파일을 보여주고, Git은 시간을 관리하며, Forgejo는 그 시간을 저장한다.

---

# 2. 🏗 전체 아키텍처

```text
[Client]
Handrive UI (React or Django Template)

        ↓

[Django Backend]
- 인증 (User)
- Git Repository 관리
- Forgejo API Proxy
- 권한 관리
- Git 작업 요청 (Queue)

        ↓

[Worker (Celery)]
- git clone / commit / push
- mirror import
- 파일 sync

        ↓

[Forgejo]
- Git 저장소 (Bare Repo)
- PR / Branch / Collaborator

        ↓

[Storage]
- /repos/*.git (Bare Repo)
```

---

# 3. 🧩 핵심 설계 원칙

* ❌ `.git` 폴더 기준 판단 금지
* ✅ DB 매핑 기준으로 Git repo 판단
* ❌ Forgejo UI 사용 금지
* ✅ Forgejo는 API + Git 엔진
* ❌ 동기 처리 금지
* ✅ Git 작업은 반드시 Worker로

---

# 4. 🗄 Django 모델

## models.py

```python
from django.db import models
from django.contrib.auth.models import User


class GitUserMapping(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    forgejo_user_id = models.BigIntegerField()
    forgejo_username = models.CharField(max_length=255)


class GitRepository(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    repo_name = models.CharField(max_length=255)

    forgejo_repo_id = models.BigIntegerField()
    forgejo_owner = models.CharField(max_length=255)
    forgejo_repo_name = models.CharField(max_length=255)

    handrive_path = models.CharField(max_length=1024)

    status = models.CharField(max_length=50, default="pending_create")

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("handrive_path",)


class GitCollaborator(models.Model):
    repository = models.ForeignKey(GitRepository, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)

    permission = models.CharField(max_length=50)
```

---

# 5. ⚙️ Forgejo API 클라이언트

```python
import requests


class ForgejoClient:

    BASE_URL = "http://forgejo:3000"
    TOKEN = "ADMIN_TOKEN"

    def create_repo(self, username, repo_name):
        """
        Forgejo에 repository 생성

        - auto_init=False → 빈 repo 생성
        - 이후 우리가 직접 commit push
        """
        url = f"{self.BASE_URL}/api/v1/user/repos"

        res = requests.post(
            url,
            headers={"Authorization": f"token {self.TOKEN}"},
            json={
                "name": repo_name,
                "private": True,
                "auto_init": False
            }
        )

        res.raise_for_status()
        return res.json()
```

---

# 6. 🧠 서비스 계층

```python
from app.models import GitRepository
from .forgejo_client import ForgejoClient
from .tasks import create_repo_task, import_repo_task


class GitRepositoryService:

    def exists(self, path):
        """
        .git 여부가 아니라 DB 기준으로 판단
        """
        return GitRepository.objects.filter(handrive_path=path).exists()

    def create_repo(self, user, path, repo_name):
        """
        일반 폴더 → Git repo 생성

        실제 작업은 Worker에게 넘긴다
        """
        repo = GitRepository.objects.create(
            owner=user,
            repo_name=repo_name,
            handrive_path=path,
            status="pending_create"
        )

        create_repo_task.delay(repo.id)

        return repo

    def import_repo(self, user, path, repo_name):
        """
        기존 .git → 중앙 repo 이관
        """
        repo = GitRepository.objects.create(
            owner=user,
            repo_name=repo_name,
            handrive_path=path,
            status="pending_import"
        )

        import_repo_task.delay(repo.id)

        return repo
```

---

# 7. ⚡ Celery Worker (핵심)

## tasks.py

```python
from celery import shared_task
import subprocess
import os
from app.models import GitRepository
from .forgejo_client import ForgejoClient


@shared_task
def create_repo_task(repo_id):
    """
    일반 폴더 → Git repo 생성

    단계:
    1. Forgejo repo 생성
    2. clone
    3. 파일 복사
    4. commit & push
    """
    repo = GitRepository.objects.get(id=repo_id)
    client = ForgejoClient()

    forgejo_repo = client.create_repo(repo.owner.username, repo.repo_name)

    tmp = f"/tmp/{repo.repo_name}"

    subprocess.run(["git", "clone", forgejo_repo["clone_url"], tmp], check=True)
    subprocess.run(["cp", "-r", repo.handrive_path + "/.", tmp], check=True)

    subprocess.run(["git", "-C", tmp, "add", "."], check=True)
    subprocess.run(["git", "-C", tmp, "commit", "-m", "Initial commit"], check=True)
    subprocess.run(["git", "-C", tmp, "push"], check=True)

    repo.forgejo_repo_id = forgejo_repo["id"]
    repo.status = "active"
    repo.save()


@shared_task
def import_repo_task(repo_id):
    """
    기존 .git → mirror push
    """
    repo = GitRepository.objects.get(id=repo_id)
    client = ForgejoClient()

    forgejo_repo = client.create_repo(repo.owner.username, repo.repo_name)

    subprocess.run([
        "git", "-C", repo.handrive_path,
        "remote", "add", "forgejo", forgejo_repo["clone_url"]
    ], check=True)

    subprocess.run([
        "git", "-C", repo.handrive_path,
        "push", "--mirror", "forgejo"
    ], check=True)

    # .git 제거
    subprocess.run(["rm", "-rf", os.path.join(repo.handrive_path, ".git")])

    repo.forgejo_repo_id = forgejo_repo["id"]
    repo.status = "active"
    repo.save()
```

---

# 8. 🌐 API 설계

## 8.1 Repo 생성

```http
POST /api/git/repos/
```

```json
{
  "path": "/workspace/a",
  "repo_name": "a"
}
```

---

## 8.2 Repo 조회

```http
GET /api/git/repos/by-path/?path=/workspace/a
```

---

## 8.3 권한 변경

```http
POST /api/git/repos/{id}/collaborators/
```

---

## 8.4 Clone URL

```http
GET /api/git/repos/{id}/clone/
```

---

# 9. 🎯 Handrive UI 흐름

## 9.1 우클릭

```text
[폴더 우클릭]

- Git 리포지토리 생성
- Git 관리
```

---

## 9.2 생성 흐름

```text
클릭
→ 모달
→ repo 이름 입력
→ 생성
→ "생성 중..."
→ 완료
→ Git 관리 페이지 이동
```

---

## 9.3 Git 관리 화면

```text
/project-a

[탭]
- Overview
- Branch
- Pull Request
- Collaborator
- Settings
```

---

# 10. 🔐 Clone URL

```text
https://hanplanet.com/git/user/repo.git
```

👉 내부:

```text
Nginx → Forgejo
```

---

# 11. 🔄 CI/CD 확장

```text
git push
→ webhook
→ Celery
→ build
→ 게임 서버 배포
```

---

# 12. ⚠️ 핵심 함정 (이건 반드시 기억)

### 1. Git 작업 동기 처리하면 서버 죽는다

### 2. .git 유지하면 데이터 꼬인다

### 3. Forgejo UI 쓰면 UX 망한다

### 4. 권한 Django에서 안 잡으면 보안 터진다

---

# 13. 🧠 최종 결론

이 시스템은 단순 기능이 아니다.

```text
파일 시스템 + Git + 협업 + 배포
```

👉 이걸 합치면

> “개발 플랫폼”

---

# 🔬 마지막 한 줄

**“GitHub + Drive + DevOps를 합친 플랫폼”**을 만든다.
