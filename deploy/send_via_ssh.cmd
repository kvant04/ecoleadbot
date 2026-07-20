@echo off
REM Send archive via SSH stdin (works when scp fails)
REM Run from repo root in CMD (not on VPS):
REM   deploy\send_via_ssh.cmd

set HOST=45.8.124.44
set USER=root
set ARCH=deploy\ecoleadbot_deploy.tar.gz

if not exist %ARCH% (
  echo Missing %ARCH% - run deploy\pack_local.cmd first
  exit /b 1
)

echo Uploading %ARCH% to %USER%@%HOST%:/tmp/ecoleadbot_deploy.tar.gz
echo Enter root password when asked...
ssh %USER%@%HOST% "cat > /tmp/ecoleadbot_deploy.tar.gz" < %ARCH%
if errorlevel 1 (
  echo Upload failed
  exit /b 1
)

echo OK. Now in SSH session run:
echo   bash /opt/ecoleadbot/deploy/vps_remote_unpack.sh
echo Or paste commands from deploy/SSH_INSTALL.txt
