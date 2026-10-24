@echo off
setlocal
cd /d "%~dp0"
title VIZU - Semana 12

where py >nul 2>nul
if not errorlevel 1 (
  py -3 --version >nul 2>nul
  if not errorlevel 1 (
    py -3 "%~dp0scripts\serve.py" %*
    goto finish
  )
)

where python >nul 2>nul
if errorlevel 1 (
  echo No se encontro Python 3. Instala Python y vuelve a ejecutar este archivo.
  goto finish
)
python "%~dp0scripts\serve.py" %*

:finish
if "%VIZZU_NO_PAUSE%"=="1" exit /b
pause
