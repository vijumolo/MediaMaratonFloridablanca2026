@echo off
title MMF 2026 - Portal de Resultados y Diplomas
echo.
echo =============================================================
echo    MEDIA MARATON DE FLORIDABLANCA 2026 - RESULTADOS
echo =============================================================
echo.
echo  Iniciando servidor local en http://localhost:8000 ...
echo  Por favor, mantén esta ventana abierta mientras usas la App.
echo.
echo  Presiona Ctrl+C en esta ventana para cerrar el servidor.
echo.

:: Open default browser
start http://localhost:8000

:: Start python server
python -m http.server 8000
