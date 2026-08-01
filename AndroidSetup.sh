#!/usr/bin/env bash
# Setup do "LearningByYourSelf" (leitor de PDF + audio) dentro do Termux (Android).
#
# Uso (rodar cada linha separadamente, nao colar tudo de uma vez):
#   pkg update -y && pkg upgrade -y
#   pkg install -y nodejs git
#   termux-setup-storage
#   git clone https://github.com/Marcus-Coelho/LearningByYourSelf.git ~/storage/shared/LearningByYourSelf
#   bash ~/storage/shared/LearningByYourSelf/AndroidSetup.sh
#
# Pode rodar de novo quantas vezes precisar (ele nao repete passos ja feitos).
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$SCRIPT_DIR"

if [ ! -d "$HOME/storage/shared" ]; then
  echo ">>> Rode 'termux-setup-storage' primeiro, aceite a permissao na tela e tente de novo."
  exit 1
fi

echo "=== 1/3: Criando as pastas de material (se ainda nao existirem) ==="
mkdir -p "$REPO_DIR/Pre Intermediate and Intermediate"
mkdir -p "$REPO_DIR/American English Level 1"
mkdir -p "$REPO_DIR/Grammar Elemetary"

NEEDS_MATERIAL=0
[ -z "$(ls -A "$REPO_DIR/Pre Intermediate and Intermediate" 2>/dev/null)" ] && NEEDS_MATERIAL=1
[ -z "$(ls -A "$REPO_DIR/American English Level 1" 2>/dev/null)" ] && NEEDS_MATERIAL=1
[ -z "$(ls -A "$REPO_DIR/Grammar Elemetary" 2>/dev/null)" ] && NEEDS_MATERIAL=1

if [ "$NEEDS_MATERIAL" = "1" ]; then
  cat <<MSG

>>> AINDA FALTA COPIAR O MATERIAL <<<
Estas pastas foram criadas (algumas ainda vazias) dentro de:
  Armazenamento interno / LearningByYourSelf /
    - Pre Intermediate and Intermediate/
    - American English Level 1/
    - Grammar Elemetary/

Abra o app "Arquivos" do Android, baixe/exporte do OneDrive o CONTEUDO de cada
uma dessas pastas (exatamente como esta organizado no PC, com as mesmas
subpastas) e copie pra dentro das pastas acima.

Depois de copiar, rode de novo:
  bash "$SCRIPT_DIR/AndroidSetup.sh"
MSG
  exit 0
fi

echo "=== 2/3: Instalando dependencias do app (pode demorar alguns minutos) ==="
cd "$REPO_DIR/meu-leitor-pdf"
npm install

echo "=== 3/3: Pronto ==="
cat <<MSG

Tudo pronto!

Para RODAR o app (sempre que for estudar), use:
  cd "$REPO_DIR/meu-leitor-pdf"
  export NODE_OPTIONS=--openssl-legacy-provider
  npm start

Depois abra o navegador do tablet em:
  http://localhost:3000
MSG
