@echo off
REM Деплой v1.5.9 на VPS — пароль спросит в этом окне (3 раза меньше, если задать ECOBOT_SSH_PASSWORD в deploy.config.env)
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\deploy.ps1 -PromptPassword
pause
