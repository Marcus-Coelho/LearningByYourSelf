#!/usr/bin/env bash
# Equivalente Android/Termux do StartLearning.bat (ver esse arquivo pro porque
# de cada decisao espelhada aqui) - sobe o dev server e abre o navegador
# quando ele responder de verdade. Nao existe cenario de pendrive no Android
# (o clone tem que morar no armazenamento PRIVADO do Termux, ver
# AndroidSetup.sh), entao a porta e sempre 3000, sem a deteccao de tipo de
# unidade que o .bat faz no Windows.
#
# Chamado pelo atalho de tela inicial (Termux:Widget) que o AndroidSetup.sh
# deixa pronto em ~/.shortcuts/, ou direto:
#   bash ~/LearningByYourSelf/StartLearning.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/meu-leitor-pdf"
PORT=3000

cd "$PROJECT_DIR"

if [ ! -d node_modules ]; then
  echo "Primeira vez rodando aqui - instalando dependencias, aguarde..."
  npm install
fi

export NODE_OPTIONS=--openssl-legacy-provider

# Abre o navegador so quando o servidor responder de verdade (mesma logica
# de polling do OpenWhenReady.ps1 no Windows), em segundo plano, sem travar
# o "npm start" abaixo. Precisa do pacote termux-api + app Termux:API pra
# abrir sozinho (termux-open-url); sem isso, so avisa a URL no terminal - o
# "npm start" continua funcionando normalmente do mesmo jeito.
(
  for _ in $(seq 1 120); do
    if curl -s -o /dev/null "http://127.0.0.1:$PORT"; then
      if command -v termux-open-url >/dev/null 2>&1; then
        termux-open-url "http://localhost:$PORT"
      else
        echo ">>> Servidor pronto! Abra o navegador em http://localhost:$PORT"
      fi
      break
    fi
    sleep 1
  done
) &

npm start
