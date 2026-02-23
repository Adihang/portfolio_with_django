#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="${NGINX_LOG_DIR:-/opt/homebrew/var/log/nginx}"
ACTIVE_LOG="${ACTIVE_LOG:-$LOG_DIR/access_json.log}"
DATE_TAG="$(date '+%Y-%m-%d')"
ROTATED_LOG="$LOG_DIR/access_json_${DATE_TAG}.log"

mkdir -p "$LOG_DIR"

if [[ -f "$ACTIVE_LOG" ]]; then
    if [[ -f "$ROTATED_LOG" ]]; then
        cat "$ACTIVE_LOG" >> "$ROTATED_LOG"
        : > "$ACTIVE_LOG"
    else
        mv "$ACTIVE_LOG" "$ROTATED_LOG"
    fi
fi

touch "$ACTIVE_LOG"

# Reopen nginx log file handles after rotate.
if [[ -x "/opt/homebrew/opt/nginx/bin/nginx" ]]; then
    /opt/homebrew/opt/nginx/bin/nginx -s reopen >/dev/null 2>&1 || true
elif command -v nginx >/dev/null 2>&1; then
    nginx -s reopen >/dev/null 2>&1 || true
fi

# Compress rotated logs from yesterday and older.
find "$LOG_DIR" -type f -name 'access_json_*.log' -mtime +1 -exec gzip -f {} + 2>/dev/null || true

# Keep only last 30 days.
find "$LOG_DIR" -type f \( -name 'access_json_*.log' -o -name 'access_json_*.log.gz' \) -mtime +30 -delete || true
