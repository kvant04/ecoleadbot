@echo off
REM Run from repo root in CMD or PowerShell:
REM   deploy\run_caddy_setup.cmd
echo Paste root password when asked...
type "%~dp0setup_caddy.sh" | ssh root@45.8.124.44 "bash -s"
pause
