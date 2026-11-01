#!/usr/bin/env bash
# Локальный просмотр уже собранного курса; исходники и экспорты не изменяются.
set -euo pipefail
umask 077
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
action=${1:-status}
profile=${2:-student}
case "$profile" in student|full) ;; *) echo 'Ожидается профиль student или full.' >&2; exit 2 ;; esac
case "$action" in start|stop|status) ;; *) echo "Использование: $0 {start|stop|status} [student|full] [порт]" >&2; exit 2 ;; esac
key=$(printf '%s' "$repo" | cksum | awk '{print $1}')
state="${TMPDIR:-/tmp}/cybersecurity-nginx-${UID}-${key}-${profile}"
if [[ -L "$state" || ( -e "$state" && ! -O "$state" ) ]]; then
  echo "Небезопасный каталог состояния: $state" >&2; exit 1
fi
running() {
  [[ -f "$state/nginx.pid" ]] || return 1
  local pid
  read -r pid < "$state/nginx.pid"
  [[ "$pid" =~ ^[0-9]+$ && -r "/proc/$pid/cmdline" ]] || return 1
  [[ $(tr '\0' ' ' < "/proc/$pid/cmdline") == *"$state/nginx.conf"* ]]
}
show_url() {
  local port
  read -r port < "$state/port"
  echo "http://127.0.0.1:$port/"
  echo "http://127.0.0.1:$port/theory/access-control/access-control.html"
  echo "Состояние и журналы: $state"
}
case "$action" in
  status)
    if running; then show_url; else echo 'Локальный nginx остановлен.'; exit 1; fi
    ;;
  stop)
    if running; then
      nginx -p "$state/" -c "$state/nginx.conf" -s quit
      for ((attempt = 0; attempt < 50; attempt++)); do
        if ! running; then break; fi
        sleep 0.1
      done
      if running; then echo 'nginx ещё завершает работу; повторите status.' >&2; exit 1; fi
      echo 'Локальный nginx остановлен.'
    else echo 'Локальный nginx уже остановлен.'; fi
    ;;
  start)
    if running; then show_url; exit 0; fi
    command -v nginx >/dev/null || { echo 'Нужен установленный nginx.' >&2; exit 1; }
    command -v python3 >/dev/null || { echo 'Нужен python3 для подготовки конфигурации.' >&2; exit 1; }
    mkdir -p "$state"
    python3 - "$repo" "$profile" "$state" "${3:-0}" <<'PY'
from pathlib import Path
import socket
import sys
repo, profile, state, requested = sys.argv[1:]
repo, state = Path(repo), Path(state)
roots = {name: repo / name / '_output' / profile for name in ('theory', 'task', 'seminars')}
portal = repo / f'_site-{profile}'
for root in (portal, *roots.values()):
    if not (root / 'index.html').is_file():
        raise SystemExit(f'Нет готового экспорта: {root}/index.html. Сначала соберите нужный профиль.')
try:
    port = int(requested)
except ValueError:
    raise SystemExit('Порт должен быть числом.')
if port != 0 and not 1024 <= port <= 65535:
    raise SystemExit('Выберите свободный порт от 1024 до 65535.')
with socket.socket() as sock:
    sock.bind(('127.0.0.1', port))
    port = sock.getsockname()[1]
def quoted(path):
    return '"' + str(path).replace('\\', '\\\\').replace('"', '\\"').replace('$', '\\$') + '"'
locations = '\n'.join(
    f'    location = /{name} {{ return 302 /{name}/; }}\n'
    f'    location /{name}/ {{ alias {quoted(str(root) + "/")}; }}'
    for name, root in roots.items()
)
config = f'''worker_processes 1;
error_log {quoted(state / 'error.log')};
pid {quoted(state / 'nginx.pid')};
events {{ worker_connections 128; }}
http {{
  types {{
    text/html html htm; text/css css; application/javascript js mjs;
    application/json json; image/svg+xml svg; image/png png; image/jpeg jpg jpeg;
    image/gif gif; image/webp webp; image/x-icon ico; font/woff woff;
    font/woff2 woff2; application/pdf pdf; application/wasm wasm;
  }}
  default_type application/octet-stream;
  access_log {quoted(state / 'access.log')};
  client_body_temp_path {quoted(state / 'client-body')};
  proxy_temp_path {quoted(state / 'proxy')};
  fastcgi_temp_path {quoted(state / 'fastcgi')};
  uwsgi_temp_path {quoted(state / 'uwsgi')};
  scgi_temp_path {quoted(state / 'scgi')};
  server {{
    listen 127.0.0.1:{port};
    server_name localhost;
    root {quoted(portal)};
    index index.html;
    add_header Cache-Control "no-store";
{locations}
    location / {{ try_files $uri $uri/ =404; }}
  }}
}}
'''
(state / 'nginx.conf').write_text(config)
(state / 'port').write_text(f'{port}\n')
PY
    nginx -p "$state/" -c "$state/nginx.conf" -t
    nginx -p "$state/" -c "$state/nginx.conf"
    show_url
    ;;
esac
