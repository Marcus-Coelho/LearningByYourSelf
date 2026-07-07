# Mesma lógica de porta do StartLearning.bat, recalculada aqui de novo (não
# recebe argumento) pra este arquivo continuar funcionando sozinho se
# disparado na mão: fixa (C:, o PC) = 3000, removível (pendrive) = 3001.
# Ver StartLearning.bat para o porquê (isolar localStorage/usuários entre a
# cópia do PC e a do pendrive, mesmo copiando os mesmos arquivos entre elas).
$port = 3000
try {
    if ((Get-Volume -DriveLetter $PSScriptRoot.Substring(0, 1) -ErrorAction Stop).DriveType -eq 'Removable') {
        $port = 3001
    }
} catch {
    # Não deu pra checar o tipo de unidade - segue com a porta padrão (3000).
}

$ok = $false
for ($i = 0; $i -lt 120; $i++) {
    try {
        # 127.0.0.1 (nao "localhost"): nessa maquina, Invoke-WebRequest trava
        # ate dar timeout contra "localhost" (tenta IPv6 antes do IPv4 e nunca
        # cai pro IPv4 a tempo), mesmo com o servidor respondendo normalmente.
        Invoke-WebRequest -Uri "http://127.0.0.1:$port" -UseBasicParsing -TimeoutSec 2 | Out-Null
        $ok = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}
if ($ok) {
    Start-Process "http://localhost:$port"
}
