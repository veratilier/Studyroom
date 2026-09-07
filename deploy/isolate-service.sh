set -eu
sudo install -d -m 755 /opt/studyroom/rootfs/usr /opt/studyroom/rootfs/etc /opt/studyroom/rootfs/opt/studyroom /opt/studyroom/rootfs/var/lib/studyroom /opt/studyroom/rootfs/tmp
for name in bin sbin lib lib64; do sudo ln -sfn usr/$name /opt/studyroom/rootfs/$name; done
sudo mkdir -p /etc/systemd/system/studyroom-api.service.d
sudo tee /etc/systemd/system/studyroom-api.service.d/isolation.conf >/dev/null <<'UNIT'
[Service]
RootDirectory=/opt/studyroom/rootfs
MountAPIVFS=true
BindReadOnlyPaths=/usr
BindReadOnlyPaths=/etc/ssl /etc/resolv.conf /etc/nsswitch.conf /etc/passwd /etc/group
BindReadOnlyPaths=/etc/studyroom /opt/studyroom/node /opt/studyroom/runtime /opt/studyroom/releases /opt/studyroom/current
BindPaths=/var/lib/studyroom
ProtectProc=invisible
ProcSubset=pid
UNIT
sudo systemctl daemon-reload
sudo systemctl restart studyroom-api
sleep 2
sudo systemctl status studyroom-api --no-pager
