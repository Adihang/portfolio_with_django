#!/bin/bash
# Gitea 초기 설정 스크립트 (Homebrew 설치 전제)
# 실행: cd forgejo && bash setup.sh
set -e

BASE="$(cd "$(dirname "$0")" && pwd)"
GITEA_BIN="/opt/homebrew/bin/gitea"
CONF="$BASE/custom/conf/app.ini"
WORK="$BASE"

if [ ! -f "$GITEA_BIN" ]; then
    echo "gitea가 없습니다. 먼저 설치하세요: brew install gitea"
    exit 1
fi

mkdir -p "$BASE/data/repos" "$BASE/log"

echo "=== Gitea 최초 실행 (DB 초기화) ==="
"$GITEA_BIN" web --config "$CONF" --work-path "$WORK" &
GITEA_PID=$!
sleep 5

echo ""
echo "=== 관리자 계정 생성 ==="
"$GITEA_BIN" admin user create \
  --config "$CONF" --work-path "$WORK" \
  --username admin \
  --password 'change-me' \
  --email admin@localhost \
  --admin \
  --must-change-password=false

echo ""
echo "=== Admin Token 발급 ==="
"$GITEA_BIN" admin user generate-access-token \
  --config "$CONF" --work-path "$WORK" \
  --username admin \
  --token-name hanplanet-admin \
  --raw

echo ""
echo "========================================================"
echo "위 토큰을 config/secrets.json 에 추가하세요:"
echo '  "FORGEJO_BASE_URL": "http://localhost:3000",'
echo '  "FORGEJO_ADMIN_TOKEN": "<위 토큰>",'
echo '  "PUBLIC_GIT_BASE_URL": "http://localhost:3000"'
echo "========================================================"
echo ""
echo "launchd 서비스 등록:"
echo "  cp ../deploy/launchd/com.hanplanet.gitea.plist ~/Library/LaunchAgents/"
echo "  launchctl load ~/Library/LaunchAgents/com.hanplanet.gitea.plist"

# graceful shutdown
kill -TERM $GITEA_PID
wait $GITEA_PID 2>/dev/null || true
echo ""
echo "=== 설정 완료. Gitea 종료됨 (launchd로 재시작 필요) ==="
