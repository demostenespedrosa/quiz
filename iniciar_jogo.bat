@echo off
title Linux Arena: Duo do Milhao - Servidor da Sala
echo ============================================================
echo   Iniciando Linux Arena: Duo do Milhao...
echo   Deixe esta janela aberta durante o campeonato em sala!
echo ============================================================
start "" http://localhost:3000/tv.html
node server.js
pause
