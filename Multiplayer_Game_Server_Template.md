Context
git push / git pull 시 터미널에서 hanplanet.com 페이지를 열어 이미 로그인된
Django 세션으로 Git 인증을 처리하는 기능.
OAuth2 Device Authorization Grant (RFC 8628) 방식:

git-credential-hanplanet 스크립트가 /api/git/auth/device/ 에 device code 요청
터미널에 URL 출력 + 자동으로 브라우저 열기
이미 hanplanet.com에 로그인된 유저 → 승인 버튼 클릭
스크립트가 /api/git/auth/token/ 폴링 → Gitea PAT 수신
git 자격증명으로 반환 (username + token)


변경 파일
파일작업main/models.pyGitDeviceCode 모델 추가main/migrations/0032_*.py마이그레이션main/views.pydevice/approve/token 뷰 3개 추가main/urls.pyURL 4개 추가templates/git_auth_approve.html승인 페이지 템플릿deploy/scripts/git-credential-hanplanet셸 스크립트 (신규)

1. 모델: GitDeviceCode (main/models.py)
pythonclass GitDeviceCode(models.Model):
    device_code = models.CharField(max_length=64, unique=True)  # UUID hex, 스크립트가 폴링에 사용
    user_code   = models.CharField(max_length=16, unique=True)  # 대문자 8자, URL 쿼리 파라미터
    user        = models.ForeignKey(AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    expires_at  = models.DateTimeField()   # 생성 + 5분
    approved    = models.BooleanField(default=False)
    created_at  = models.DateTimeField(auto_now_add=True)

2. 뷰 (main/views.py)
POST /api/git/auth/device/  — 인증 없음

device_code = uuid4().hex
user_code = secrets.token_hex(4).upper()  (8자 대문자)
expires_at = now() + 5분
DB 저장
반환:

json{
  "device_code": "...",
  "user_code": "ABCD1234",
  "verification_uri": "https://www.hanplanet.com/git-auth/?code=ABCD1234",
  "expires_in": 300
}
GET /git-auth/?code=XXXX  — @login_required

GitDeviceCode.objects.get(user_code=code, approved=False) (만료 체크 포함)
만료/없으면 에러 페이지
정상이면 승인 템플릿 렌더링

POST /api/git/auth/approve/  — @login_required

body: {"user_code": "ABCD1234"}
device.user = request.user; device.approved = True; device.save()
반환: {"ok": true}

POST /api/git/auth/token/  — 인증 없음 (device_code로 식별)

body: {"device_code": "..."}
만료: {"status": "expired"}
미승인: {"status": "pending"}
승인됨:

GitUserMapping 에서 forgejo_token 조회
토큰 없으면 ForgejoClient().ensure_user_with_token() 호출 후 저장
device code 삭제 (일회성)
반환: {"status": "ok", "username": "...", "token": "..."}




3. URL (main/urls.py — 기존 git API 블록에 추가)
pythonpath('api/git/auth/device/',  views.git_auth_device,  name='git_auth_device'),
path('api/git/auth/token/',   views.git_auth_token,   name='git_auth_token'),
path('api/git/auth/approve/', views.git_auth_approve, name='git_auth_approve'),
path('git-auth/',             views.git_auth_page,    name='git_auth_page'),

4. 승인 페이지 템플릿 (templates/git_auth_approve.html)

"HanDrive Git 접근 요청" 제목
{{ user_code }} 표시 (터미널의 코드와 일치 확인용)
승인 / 거절 버튼 (JS로 POST /api/git/auth/approve/)
승인 후: "인증 완료 — 터미널로 돌아가세요" 메시지


5. 셸 스크립트 (deploy/scripts/git-credential-hanplanet)
bash#!/usr/bin/env bash
# git credential helper — hanplanet.com Device Flow
# 설치: git config --global credential.https://git.hanplanet.com.helper \
#          /path/to/git-credential-hanplanet

set -e
BASE_URL="https://www.hanplanet.com"
ACTION="$1"

[[ "$ACTION" != "get" ]] && exit 0

# host 입력 파싱 (git이 stdin으로 넘겨줌)
while IFS='=' read -r key value; do
    [[ "$key" == "host" ]] && HOST="$value"
done

# 우리 서버가 아니면 패스
[[ "$HOST" != *hanplanet.com* && "$HOST" != *localhost:3000* ]] && exit 0

# 1. device code 요청
RESP=$(curl -sf -X POST "$BASE_URL/api/git/auth/device/")
DEVICE_CODE=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['device_code'])")
USER_CODE=$(echo "$RESP"   | python3 -c "import sys,json; print(json.load(sys.stdin)['user_code'])")
VERIFY_URL=$(echo "$RESP"  | python3 -c "import sys,json; print(json.load(sys.stdin)['verification_uri'])")

echo "==> HanDrive Git 인증이 필요합니다" >&2
echo "==> 브라우저에서 승인해주세요: $VERIFY_URL" >&2
echo "==> 인증 코드: $USER_CODE" >&2

# 2. 브라우저 자동 열기
open "$VERIFY_URL" 2>/dev/null || xdg-open "$VERIFY_URL" 2>/dev/null || true

# 3. 폴링 (5초 간격, 최대 5분)
for i in $(seq 1 60); do
    sleep 5
    RESULT=$(curl -sf -X POST "$BASE_URL/api/git/auth/token/" \
        -H "Content-Type: application/json" \
        -d "{\"device_code\":\"$DEVICE_CODE\"}") || continue
    STATUS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
    if [[ "$STATUS" == "ok" ]]; then
        USERNAME=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['username'])")
        TOKEN=$(echo "$RESULT"    | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
        echo "username=$USERNAME"
        echo "password=$TOKEN"
        exit 0
    elif [[ "$STATUS" == "expired" ]]; then
        echo "==> 인증 시간이 초과되었습니다." >&2
        exit 1
    fi
done

echo "==> 인증 시간이 초과되었습니다." >&2
exit 1
사용자 설치 방법 (UI 또는 문서에 표시)
bash# 스크립트 다운로드 & 실행 권한
curl -o ~/git-credential-hanplanet https://www.hanplanet.com/git-auth/credential-helper/
chmod +x ~/git-credential-hanplanet

# git 전역 설정
git config --global credential.https://git.hanplanet.com.helper ~/git-credential-hanplanet

보안 고려사항

device_code: UUID hex 64자 — 추측 불가
user_code: 8자 랜덤 hex 대문자 — 짧아서 사람이 확인하기 좋음
만료: 5분 (expire 후 자동 무효)
일회성: 토큰 발급 후 device code 즉시 삭제
approve는 @login_required — 미로그인 시 로그인 페이지로 리다이렉트


검증

python manage.py migrate — GitDeviceCode 테이블 확인
수동 테스트:

bash   # device code 요청
   curl -X POST http://localhost:8000/api/git/auth/device/
   # → {device_code, user_code, verification_uri}

   # 브라우저에서 verification_uri 접속 → 승인

   # 토큰 폴링
   curl -X POST http://localhost:8000/api/git/auth/token/ \
     -H "Content-Type: application/json" \
     -d '{"device_code":"..."}'
   # → {status: "ok", username: "...", token: "..."}

스크립트 설치 후 git clone http://git.hanplanet.com/... 테스트

어때?Context
git push / git pull 시 터미널에서 hanplanet.com 페이지를 열어 이미 로그인된
Django 세션으로 Git 인증을 처리하는 기능.
OAuth2 Device Authorization Grant (RFC 8628) 방식:

git-credential-hanplanet 스크립트가 /api/git/auth/device/ 에 device code 요청
터미널에 URL 출력 + 자동으로 브라우저 열기
이미 hanplanet.com에 로그인된 유저 → 승인 버튼 클릭
스크립트가 /api/git/auth/token/ 폴링 → Gitea PAT 수신
git 자격증명으로 반환 (username + token)


변경 파일
파일작업main/models.pyGitDeviceCode 모델 추가main/migrations/0032_*.py마이그레이션main/views.pydevice/approve/token 뷰 3개 추가main/urls.pyURL 4개 추가templates/git_auth_approve.html승인 페이지 템플릿deploy/scripts/git-credential-hanplanet셸 스크립트 (신규)

1. 모델: GitDeviceCode (main/models.py)
pythonclass GitDeviceCode(models.Model):
    device_code = models.CharField(max_length=64, unique=True)  # UUID hex, 스크립트가 폴링에 사용
    user_code   = models.CharField(max_length=16, unique=True)  # 대문자 8자, URL 쿼리 파라미터
    user        = models.ForeignKey(AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    expires_at  = models.DateTimeField()   # 생성 + 5분
    approved    = models.BooleanField(default=False)
    created_at  = models.DateTimeField(auto_now_add=True)

2. 뷰 (main/views.py)
POST /api/git/auth/device/  — 인증 없음

device_code = uuid4().hex
user_code = secrets.token_hex(4).upper()  (8자 대문자)
expires_at = now() + 5분
DB 저장
반환:

json{
  "device_code": "...",
  "user_code": "ABCD1234",
  "verification_uri": "https://www.hanplanet.com/git-auth/?code=ABCD1234",
  "expires_in": 300
}
GET /git-auth/?code=XXXX  — @login_required

GitDeviceCode.objects.get(user_code=code, approved=False) (만료 체크 포함)
만료/없으면 에러 페이지
정상이면 승인 템플릿 렌더링

POST /api/git/auth/approve/  — @login_required

body: {"user_code": "ABCD1234"}
device.user = request.user; device.approved = True; device.save()
반환: {"ok": true}

POST /api/git/auth/token/  — 인증 없음 (device_code로 식별)

body: {"device_code": "..."}
만료: {"status": "expired"}
미승인: {"status": "pending"}
승인됨:

GitUserMapping 에서 forgejo_token 조회
토큰 없으면 ForgejoClient().ensure_user_with_token() 호출 후 저장
device code 삭제 (일회성)
반환: {"status": "ok", "username": "...", "token": "..."}




3. URL (main/urls.py — 기존 git API 블록에 추가)
pythonpath('api/git/auth/device/',  views.git_auth_device,  name='git_auth_device'),
path('api/git/auth/token/',   views.git_auth_token,   name='git_auth_token'),
path('api/git/auth/approve/', views.git_auth_approve, name='git_auth_approve'),
path('git-auth/',             views.git_auth_page,    name='git_auth_page'),

4. 승인 페이지 템플릿 (templates/git_auth_approve.html)

"HanDrive Git 접근 요청" 제목
{{ user_code }} 표시 (터미널의 코드와 일치 확인용)
승인 / 거절 버튼 (JS로 POST /api/git/auth/approve/)
승인 후: "인증 완료 — 터미널로 돌아가세요" 메시지


5. 셸 스크립트 (deploy/scripts/git-credential-hanplanet)
bash#!/usr/bin/env bash
# git credential helper — hanplanet.com Device Flow
# 설치: git config --global credential.https://git.hanplanet.com.helper \
#          /path/to/git-credential-hanplanet

set -e
BASE_URL="https://www.hanplanet.com"
ACTION="$1"

[[ "$ACTION" != "get" ]] && exit 0

# host 입력 파싱 (git이 stdin으로 넘겨줌)
while IFS='=' read -r key value; do
    [[ "$key" == "host" ]] && HOST="$value"
done

# 우리 서버가 아니면 패스
[[ "$HOST" != *hanplanet.com* && "$HOST" != *localhost:3000* ]] && exit 0

# 1. device code 요청
RESP=$(curl -sf -X POST "$BASE_URL/api/git/auth/device/")
DEVICE_CODE=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['device_code'])")
USER_CODE=$(echo "$RESP"   | python3 -c "import sys,json; print(json.load(sys.stdin)['user_code'])")
VERIFY_URL=$(echo "$RESP"  | python3 -c "import sys,json; print(json.load(sys.stdin)['verification_uri'])")

echo "==> HanDrive Git 인증이 필요합니다" >&2
echo "==> 브라우저에서 승인해주세요: $VERIFY_URL" >&2
echo "==> 인증 코드: $USER_CODE" >&2

# 2. 브라우저 자동 열기
open "$VERIFY_URL" 2>/dev/null || xdg-open "$VERIFY_URL" 2>/dev/null || true

# 3. 폴링 (5초 간격, 최대 5분)
for i in $(seq 1 60); do
    sleep 5
    RESULT=$(curl -sf -X POST "$BASE_URL/api/git/auth/token/" \
        -H "Content-Type: application/json" \
        -d "{\"device_code\":\"$DEVICE_CODE\"}") || continue
    STATUS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
    if [[ "$STATUS" == "ok" ]]; then
        USERNAME=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['username'])")
        TOKEN=$(echo "$RESULT"    | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
        echo "username=$USERNAME"
        echo "password=$TOKEN"
        exit 0
    elif [[ "$STATUS" == "expired" ]]; then
        echo "==> 인증 시간이 초과되었습니다." >&2
        exit 1
    fi
done

echo "==> 인증 시간이 초과되었습니다." >&2
exit 1
사용자 설치 방법 (UI 또는 문서에 표시)
bash# 스크립트 다운로드 & 실행 권한
curl -o ~/git-credential-hanplanet https://www.hanplanet.com/git-auth/credential-helper/
chmod +x ~/git-credential-hanplanet

# git 전역 설정
git config --global credential.https://git.hanplanet.com.helper ~/git-credential-hanplanet

보안 고려사항

device_code: UUID hex 64자 — 추측 불가
user_code: 8자 랜덤 hex 대문자 — 짧아서 사람이 확인하기 좋음
만료: 5분 (expire 후 자동 무효)
일회성: 토큰 발급 후 device code 즉시 삭제
approve는 @login_required — 미로그인 시 로그인 페이지로 리다이렉트


검증

python manage.py migrate — GitDeviceCode 테이블 확인
수동 테스트:

bash   # device code 요청
   curl -X POST http://localhost:8000/api/git/auth/device/
   # → {device_code, user_code, verification_uri}

   # 브라우저에서 verification_uri 접속 → 승인

   # 토큰 폴링
   curl -X POST http://localhost:8000/api/git/auth/token/ \
     -H "Content-Type: application/json" \
     -d '{"device_code":"..."}'
   # → {status: "ok", username: "...", token: "..."}

스크립트 설치 후 git clone http://git.hanplanet.com/... 테스트