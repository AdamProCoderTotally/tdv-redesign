@echo off
rem Build the Tower Defence V setup installer from the latest source.
rem Output: src-tauri\target\release\bundle\nsis\Tower Defence V_*_x64-setup.exe
cd /d "%~dp0"
call npm run installer
pause
