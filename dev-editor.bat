@echo off
rem Start the TDV dev suite: editor at http://localhost:8321/tools/editor.html
cd /d "%~dp0"
start "" http://localhost:8321/tools/editor.html
node scripts/devserver.js
pause
