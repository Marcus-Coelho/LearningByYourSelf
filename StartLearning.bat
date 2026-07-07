@echo off
setlocal
set "PROJECT_DIR=%~dp0meu-leitor-pdf"
set BROWSER=none

rem Porta muda conforme o tipo de unidade onde este .bat está rodando: fixa
rem (HD/SSD do PC, ex. C:) usa a porta padrao 3000; removivel (pendrive) usa
rem 3001. Portas diferentes = origens diferentes no navegador = o localStorage
rem (usuarios cadastrados, progresso, notas, My Words...) nunca se mistura
rem entre a copia do PC e a copia do pendrive - mesmo copiando os mesmos
rem arquivos de um lado pro outro, ja que a porta e recalculada aqui sempre a
rem partir de ONDE o script esta rodando, nao fica salva em lugar nenhum.
set "SCRIPT_DRIVE=%~d0"
set "PORT=3000"
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "try { (Get-Volume -DriveLetter '%SCRIPT_DRIVE:~0,1%').DriveType } catch { 'Fixed' }"`) do set "DRIVE_TYPE=%%i"
if /I "%DRIVE_TYPE%"=="Removable" set "PORT=3001"

echo Fechando qualquer servidor antigo na porta %PORT%...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { taskkill /F /T /PID $_ }" >nul 2>&1

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
echo Fechando o servidor (porta %PORT%)...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { taskkill /F /T /PID $_ }" >nul 2>&1

endlocal
