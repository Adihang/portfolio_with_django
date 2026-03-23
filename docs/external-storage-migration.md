# External Storage Migration Runbook

이 문서는 Hanplanet에서 용량을 많이 차지하는 디렉터리를 외장 HDD로 옮길 때의 안전한 절차를 정리합니다.

권장 기본 전략:

- `media/` -> 외장 HDD로 이동 가능
- `forgejo/data/repos/` -> 외장 HDD로 이동 권장
- `forgejo/data/gitea.db` -> 내부 SSD 유지 권장

이유:

- `media/`는 정적 파일/업로드 저장소라서 경로만 안정적으로 유지되면 비교적 안전합니다.
- `forgejo/data/repos/`는 bare Git 저장소라서 용량은 크지만, SQLite보다 외장 디스크로 분리하기 쉽습니다.
- `forgejo/data/gitea.db`는 SQLite 파일이라 느린 HDD, 절전, 마운트 끊김에 더 민감합니다.

## 권장 최종 구조

예시 외장 볼륨 이름: `HANPLANET_HDD`

```text
/Volumes/HANPLANET_HDD/Hanplanet/
├─ media/
└─ forgejo-repos/
```

프로젝트 내부 경로는 그대로 유지하고, 심볼릭 링크로 연결합니다.

```text
/Users/imhanbyeol/Development/Hanplanet/media
  -> /Volumes/HANPLANET_HDD/Hanplanet/media

/Users/imhanbyeol/Development/Hanplanet/forgejo/data/repos
  -> /Volumes/HANPLANET_HDD/Hanplanet/forgejo-repos
```

이 방식의 장점:

- Django 설정 변경 최소화
- Nginx alias 변경 최소화
- Gitea 설정 변경 최소화
- 기존 코드와 launchd plist를 거의 그대로 유지 가능

## 사전 점검

외장 이동 전에 아래를 확인합니다.

### 1. 외장 볼륨이 항상 같은 경로로 마운트되는지 확인

```bash
ls /Volumes
```

볼륨명이 자주 바뀌면 안 됩니다.

### 2. 사용 중인 현재 경로 확인

```bash
cd /Users/imhanbyeol/Development/Hanplanet
du -sh media forgejo/data/repos forgejo/data/gitea.db
```

### 3. launchd 서비스 상태 확인

```bash
launchctl list | grep hanplanet
```

대상:

- `com.hanplanet.gunicorn`
- `com.hanplanet.gitea`
- `com.hanplanet.celery`

## 중단 순서

데이터 복사 전에 쓰기 작업이 멈춰 있어야 합니다.

```bash
launchctl kickstart -k gui/$(id -u)/com.hanplanet.celery
launchctl kickstart -k gui/$(id -u)/com.hanplanet.gitea
launchctl kickstart -k gui/$(id -u)/com.hanplanet.gunicorn
```

위 명령은 재시작이므로, 실제 이전 시점에는 아래처럼 중지하는 것이 더 안전합니다.

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.hanplanet.celery.plist
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.hanplanet.gitea.plist
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.hanplanet.gunicorn.plist
```

게임 서버, nginx는 이 작업과 직접 연관은 적지만, 보수적으로 같이 멈춰도 됩니다.

중지 후 확인:

```bash
lsof +D /Users/imhanbyeol/Development/Hanplanet/media 2>/dev/null | head
lsof +D /Users/imhanbyeol/Development/Hanplanet/forgejo/data 2>/dev/null | head
```

가능하면 열린 파일이 없어야 합니다.

## 1단계: media/ 외장 이동

### 1. 외장 경로 생성

```bash
mkdir -p /Volumes/HANPLANET_HDD/Hanplanet
mkdir -p /Volumes/HANPLANET_HDD/Hanplanet/media
```

### 2. rsync 복사

```bash
rsync -aH --info=progress2 \
  /Users/imhanbyeol/Development/Hanplanet/media/ \
  /Volumes/HANPLANET_HDD/Hanplanet/media/
```

### 3. 원본 백업 이름 변경

```bash
mv /Users/imhanbyeol/Development/Hanplanet/media \
   /Users/imhanbyeol/Development/Hanplanet/media.before-external
```

### 4. 심볼릭 링크 생성

```bash
ln -s /Volumes/HANPLANET_HDD/Hanplanet/media \
      /Users/imhanbyeol/Development/Hanplanet/media
```

### 5. 검증

```bash
ls -ld /Users/imhanbyeol/Development/Hanplanet/media
readlink /Users/imhanbyeol/Development/Hanplanet/media
```

## 2단계: forgejo/data/repos/ 외장 이동

`forgejo/data/` 전체를 옮기기보다 `repos/`만 옮기는 걸 권장합니다.

### 1. 외장 경로 생성

```bash
mkdir -p /Volumes/HANPLANET_HDD/Hanplanet/forgejo-repos
```

### 2. rsync 복사

```bash
rsync -aH --info=progress2 \
  /Users/imhanbyeol/Development/Hanplanet/forgejo/data/repos/ \
  /Volumes/HANPLANET_HDD/Hanplanet/forgejo-repos/
```

### 3. 원본 백업 이름 변경

```bash
mv /Users/imhanbyeol/Development/Hanplanet/forgejo/data/repos \
   /Users/imhanbyeol/Development/Hanplanet/forgejo/data/repos.before-external
```

### 4. 심볼릭 링크 생성

```bash
ln -s /Volumes/HANPLANET_HDD/Hanplanet/forgejo-repos \
      /Users/imhanbyeol/Development/Hanplanet/forgejo/data/repos
```

### 5. 검증

```bash
ls -ld /Users/imhanbyeol/Development/Hanplanet/forgejo/data/repos
readlink /Users/imhanbyeol/Development/Hanplanet/forgejo/data/repos
```

## 설정 변경 필요 여부

권장 구조대로 심볼릭 링크를 쓰면 아래 설정은 보통 수정할 필요가 없습니다.

- Django `MEDIA_ROOT`
- Nginx `alias /Users/imhanbyeol/Development/Hanplanet/media/`
- Forgejo `WORK_PATH`
- Forgejo `[repository] ROOT`

현재 참조 파일:

- [`config/settings.py`](../config/settings.py)
- [`nginx/nginx.autorun.conf`](../nginx/nginx.autorun.conf)
- [`forgejo/custom/conf/app.ini`](../forgejo/custom/conf/app.ini)

## 재기동 순서

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.hanplanet.gunicorn.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.hanplanet.gitea.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.hanplanet.celery.plist
```

이미 등록된 상태라면 보통 재기동만 하면 됩니다.

```bash
launchctl kickstart -k gui/$(id -u)/com.hanplanet.gunicorn
launchctl kickstart -k gui/$(id -u)/com.hanplanet.gitea
launchctl kickstart -k gui/$(id -u)/com.hanplanet.celery
```

## 재기동 후 검증

### Django / media

```bash
cd /Users/imhanbyeol/Development/Hanplanet
.venv/bin/python manage.py check
curl -I http://127.0.0.1:8000
```

실제 media 파일도 하나 확인합니다.

```bash
find /Users/imhanbyeol/Development/Hanplanet/media -type f | head -n 1
```

### Gitea / bare repo

```bash
curl -I http://127.0.0.1:3000
ls /Users/imhanbyeol/Development/Hanplanet/forgejo/data/repos
```

실제 repo 접근 확인:

```bash
cd /tmp
rm -rf hanplanet-repo-check
git clone https://git.hanplanet.com/<owner>/<repo>.git hanplanet-repo-check
```

### HanDrive Git 기능

아래를 브라우저에서 확인합니다.

- HanDrive 진입 가능
- repo 가상 폴더 목록 표시 정상
- repo 브랜치 열기 정상
- 파일 미리보기 정상

## 문제가 생겼을 때 롤백

심볼릭 링크 방식의 장점은 롤백이 간단하다는 점입니다.

### media 롤백

```bash
rm /Users/imhanbyeol/Development/Hanplanet/media
mv /Users/imhanbyeol/Development/Hanplanet/media.before-external \
   /Users/imhanbyeol/Development/Hanplanet/media
```

### repos 롤백

```bash
rm /Users/imhanbyeol/Development/Hanplanet/forgejo/data/repos
mv /Users/imhanbyeol/Development/Hanplanet/forgejo/data/repos.before-external \
   /Users/imhanbyeol/Development/Hanplanet/forgejo/data/repos
```

그 뒤 관련 서비스를 다시 올립니다.

## 위험 요소

### 외장 HDD 절전

외장 HDD가 sleep 상태로 들어가면 첫 접근 시 큰 지연이 생길 수 있습니다.

영향:

- HanDrive media 접근 지연
- Gitea clone/browse 지연

### 외장 볼륨 미마운트 상태로 부팅

가장 위험한 경우입니다.

문제:

- 심볼릭 링크는 살아 있지만 대상이 없어서 서비스가 실패
- Gitea는 repo root 접근 실패
- Django/Nginx는 media 파일 404

권장:

- 외장 볼륨을 항상 같은 이름으로 유지
- 재부팅 후 서비스보다 먼저 외장 디스크 마운트 확인

### Gitea DB까지 외장으로 이동

비권장입니다.

이유:

- SQLite는 I/O 안정성에 민감
- 느린 HDD나 마운트 흔들림이 바로 DB lock/손상 위험으로 이어질 수 있음

정말 공간이 부족하지 않다면, `gitea.db`는 내부 SSD에 유지하세요.

## 최종 권장안

현 시점의 가장 안전한 조합:

- `media/` -> 외장 HDD
- `forgejo/data/repos/` -> 외장 HDD
- `forgejo/data/gitea.db` -> 내부 SSD 유지
- 기존 경로는 그대로 두고 심볼릭 링크만 연결

이 구성이 코드 수정 없이 가장 안정적으로 작동할 가능성이 높습니다.
