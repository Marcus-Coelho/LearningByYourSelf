@echo off
setlocal
set "PROJECT_DIR=%~dp0meu-leitor-pdf"
set BROWSER=none

echo Fechando qualquer servidor antigo na porta 3000...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { taskkill /F /T /PID $_ }" >nul 2>&1

cd /d "%PROJECT_DIR%"

if not exist node_modules (
  echo Primeira vez rodando aqui - instalando dependencias, aguarde...
  call npm install
)

rem Abre o navegador so quando o servidor realmente responder (evita abrir
rem cedo demais); BROWSER=none acima impede o create-react-app de abrir
rem uma segunda aba sozinho. Usa wscript+vbs (RunHidden.vbs) em vez de
rem "powershell /min" porque /min ainda deixava a janela do PowerShell
rem visivel em alguns PCs - wscript nunca cria janela nenhuma.
start "" wscript.exe "%~dp0RunHidden.vbs"

call npm start

echo.
echo Fechando o servidor (porta 3000)...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { taskkill /F /T /PID $_ }" >nul 2>&1

endlocal
