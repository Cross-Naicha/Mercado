@echo off
setlocal
cd /d "%~dp0"
title Mercado
set "mercadoPython=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
if exist "%mercadoPython%" (
  "%mercadoPython%" iniciar.py %*
) else (
  python.exe iniciar.py %*
)
if errorlevel 1 (
  echo.
  echo No se pudo iniciar Mercado. Revisa el mensaje de arriba.
  pause
)
