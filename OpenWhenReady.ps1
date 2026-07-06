$ok = $false
for ($i = 0; $i -lt 120; $i++) {
    try {
        # 127.0.0.1 (nao "localhost"): nessa maquina, Invoke-WebRequest trava
        # ate dar timeout contra "localhost" (tenta IPv6 antes do IPv4 e nunca
        # cai pro IPv4 a tempo), mesmo com o servidor respondendo normalmente.
        Invoke-WebRequest -Uri "http://127.0.0.1:3000" -UseBasicParsing -TimeoutSec 2 | Out-Null
        $ok = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}
if ($ok) {
    Start-Process "http://localhost:3000"
}
