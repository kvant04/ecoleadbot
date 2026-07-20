@echo off
REM Create deploy\ecoleadbot_deploy.tar.gz from project files
setlocal
set ROOT=%~dp0..
set STAGE=%TEMP%\ecoleadbot_pack
set ARCH=%~dp0ecoleadbot_deploy.tar.gz

if exist "%STAGE%" rmdir /s /q "%STAGE%"
mkdir "%STAGE%"

for %%F in (app.js index.html styles.css server.py rag_service.py requirements.txt Dockerfile docker-compose.yml .dockerignore) do (
  copy /Y "%ROOT%\%%F" "%STAGE%\%%F" >nul 2>&1
)
xcopy /E /I /Y "%ROOT%\deploy" "%STAGE%\deploy" >nul
xcopy /E /I /Y "%ROOT%\data" "%STAGE%\data" >nul
xcopy /E /I /Y "%ROOT%\assets" "%STAGE%\assets" >nul
xcopy /E /I /Y "%ROOT%\kb" "%STAGE%\kb" >nul
xcopy /E /I /Y "%ROOT%\prompts" "%STAGE%\prompts" >nul

tar -czf "%ARCH%" -C "%STAGE%" .
echo Created %ARCH%
for %%A in ("%ARCH%") do echo Size: %%~zA bytes
