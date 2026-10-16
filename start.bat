@chcp 65001 >nul
@echo off
title 204 DINING iPad Menu Server
cd /d "%~dp0"

echo ===============================================================
echo        ✦ 204 DINING iPad Menu Server Starting... ✦
echo ===============================================================
echo.

:: 3000번 포트를 점유 중인 기존 프로세스가 있다면 정리
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo [안내] 기존 3000번 포트 프로세스(PID: %%a)를 종료하고 재시작합니다...
    taskkill /F /PID %%a >nul 2>&1
)

:: 기존 cloudflared 터널 프로세스가 남아있다면 정리
taskkill /F /IM cloudflared.exe >nul 2>&1

echo.
echo [서버 시작 중...]
echo.
node server.js
pause
