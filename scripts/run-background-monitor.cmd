@echo off
cd /d "C:\Users\artur\ai-shopping"

if not exist ".asarvo" mkdir ".asarvo"

echo. >> ".asarvo\background-monitor.log"
echo ================================================== >> ".asarvo\background-monitor.log"
echo [%date% %time%] ASARVO Background Monitor START >> ".asarvo\background-monitor.log"

call npx.cmd --no-install tsx scripts\background-price-monitor.ts >> ".asarvo\background-monitor.log" 2>&1

echo [%date% %time%] ASARVO Background Monitor END exit=%errorlevel% >> ".asarvo\background-monitor.log"
