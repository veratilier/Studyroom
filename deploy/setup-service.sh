set -eu
sudo install -d -o studyroom -g studyroom -m 700 /etc/studyroom
sudo python3 - <<'PY'
import pathlib,secrets,pwd,os
p=pathlib.Path('/etc/studyroom/service.env')
if not p.exists():
 p.write_text('LOGIN_PASSWORD='+secrets.token_urlsafe(24)+'\nSESSION_SECRET='+secrets.token_urlsafe(48)+'\nSTUDYROOM_DATA_DIR=/var/lib/studyroom/data\nSTUDYROOM_CODEX_HOME=/var/lib/studyroom/codex\nCODEX_BIN=/usr/bin/codex\nALLOWED_ORIGIN=https://study.r-vera.com\nPORT=8788\nDAILY_AI_CALL_LIMIT=30\n')
 u=pwd.getpwnam('studyroom');os.chown(p,u.pw_uid,u.pw_gid);p.chmod(0o600)
PY
sudo tee /etc/systemd/system/studyroom-api.service >/dev/null <<'UNIT'
[Unit]
Description=Studyroom private course library and Codex tutor
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=studyroom
Group=studyroom
WorkingDirectory=/opt/studyroom/current
Environment=PATH=/opt/studyroom/node/bin:/usr/local/bin:/usr/bin:/bin
Environment=HOME=/var/lib/studyroom
ExecStart=/opt/studyroom/node/bin/node --env-file=/etc/studyroom/service.env agent-server/server.mjs
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/studyroom
TimeoutStopSec=95
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now studyroom-api
sudo systemctl is-active studyroom-api
curl -s -o /dev/null -w 'Unauthenticated API status: %{http_code}\n' -H 'Origin: https://study.r-vera.com' http://127.0.0.1:8788/courses
