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

# Busca atualizacao antes de subir o servidor. O tablet e um clone PROPRIO: o
# que e feito no PC so chega aqui pelo GitHub, e ate 2026-10-12 isso exigia um
# "git pull" na mao no Termux - o app ficava numa versao velha sem avisar (foi
# assim que o titulo antigo da aba sobreviveu no tablet depois de corrigido no
# PC).
#
# Tres cuidados pra isso NUNCA impedir o app de abrir, que e o que importa
# aqui (o "set -e" la em cima derrubaria o script num comando que falha):
#   - "|| echo" em volta, entao falha de rede/sem internet so imprime um aviso;
#   - "--ff-only": se o clone do tablet tiver commit proprio ou divergir, NAO
#     tenta merge nem rebase sozinho - desiste e avisa, pra nao criar conflito
#     no meio de uma sessao de estudo;
#   - so roda se existir git E for mesmo um clone (.git), pra uma copia solta
#     de arquivos continuar funcionando igual.
#
# Dependencia nova no package.json ainda pede "npm install" na mao - o teste
# abaixo so cobre a primeira execucao, quando nao ha node_modules nenhum.
if command -v git >/dev/null 2>&1 && [ -d "$SCRIPT_DIR/.git" ]; then
  echo "Procurando atualizacoes..."
  git -C "$SCRIPT_DIR" pull --ff-only \
    || echo ">>> Nao deu pra atualizar agora - seguindo com a versao que ja esta aqui."
fi

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
