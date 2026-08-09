#!/usr/bin/env bash
# Setup do "LearningByYourSelf" (leitor de PDF + audio) dentro do Termux (Android).
#
# Uso (rodar cada linha separadamente, nao colar tudo de uma vez):
#   pkg update -y && pkg upgrade -y
#   pkg install -y nodejs git
#   termux-setup-storage
#   git clone https://github.com/Marcus-Coelho/LearningByYourSelf.git ~/LearningByYourSelf
#   bash ~/LearningByYourSelf/AndroidSetup.sh
#
# O clone tem que ficar no armazenamento PRIVADO do Termux (~/LearningByYourSelf,
# dentro de $HOME) - NAO em ~/storage/shared/... - porque "npm install" cria
# links simbolicos, e o armazenamento compartilhado do Android nao suporta
# isso (da erro EACCES/symlink). Se voce baixar material do OneDrive, ele
# pode continuar caindo no compartilhado normalmente: crie/preencha uma pasta
# "LearningByYourSelf" la (visivel no app "Arquivos" como "Armazenamento
# interno/LearningByYourSelf") que este script sincroniza sozinho pra dentro
# do projeto a cada execucao.
#
# Pode rodar de novo quantas vezes precisar (ele nao repete passos ja feitos).

# Se alguem rodar "sh AndroidSetup.sh" em vez de "bash AndroidSetup.sh" (no
# Termux, "sh" nao e o bash e nao entende a sintaxe usada abaixo, ex.
# ${BASH_SOURCE[0]}), religa sozinho sob bash em vez de falhar pela metade.
if [ -z "$BASH_VERSION" ]; then
  exec bash "$0" "$@"
fi

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$SCRIPT_DIR"

if [ ! -d "$HOME/storage/shared" ]; then
  echo ">>> Rode 'termux-setup-storage' primeiro, aceite a permissao na tela e tente de novo."
  exit 1
fi

echo "=== 1/4: Criando as pastas de material (se ainda nao existirem) ==="
mkdir -p "$REPO_DIR/Pre Intermediate and Intermediate"
mkdir -p "$REPO_DIR/American English Level 1"
mkdir -p "$REPO_DIR/Grammar Elemetary"
# 4o curso (American Accent) e opcional: se ficar vazio, so essa parte do app
# fica indisponivel (404) e o resto roda normal - por isso nao entra no
# bloqueio de NEEDS_MATERIAL abaixo.
mkdir -p "$REPO_DIR/3. Mastering the American Accent"

MATERIAL_FOLDERS=(
  "Pre Intermediate and Intermediate"
  "American English Level 1"
  "Grammar Elemetary"
  "3. Mastering the American Accent"
)

# O material baixado do OneDrive costuma cair no armazenamento COMPARTILHADO
# do Android (visivel no app "Arquivos" como "Armazenamento interno"), mas o
# projeto (com node_modules) precisa morar no armazenamento PRIVADO do Termux
# (aqui, $REPO_DIR) - symlink nao funciona no compartilhado (ver npm install
# mais abaixo). Este passo sincroniza o que estiver em
# ~/storage/shared/LearningByYourSelf/<pasta> para dentro do projeto, sem
# sobrescrever nada que ja exista aqui (cp -n).
SHARED_STAGING="$HOME/storage/shared/LearningByYourSelf"
if [ -d "$SHARED_STAGING" ]; then
  echo "=== 2/4: Sincronizando material de $SHARED_STAGING ==="
  for folder in "${MATERIAL_FOLDERS[@]}"; do
    if [ -d "$SHARED_STAGING/$folder" ]; then
      before="$(du -sh "$REPO_DIR/$folder" 2>/dev/null | cut -f1)"
      cp -rn "$SHARED_STAGING/$folder/." "$REPO_DIR/$folder/"
      after="$(du -sh "$REPO_DIR/$folder" 2>/dev/null | cut -f1)"
      echo "  $folder: $before -> $after"
    fi
  done
else
  echo "=== 2/4: Nenhuma pasta de staging em $SHARED_STAGING (pulando sincronizacao) ==="
fi

NEEDS_MATERIAL=0
[ -z "$(ls -A "$REPO_DIR/Pre Intermediate and Intermediate" 2>/dev/null)" ] && NEEDS_MATERIAL=1
[ -z "$(ls -A "$REPO_DIR/American English Level 1" 2>/dev/null)" ] && NEEDS_MATERIAL=1
[ -z "$(ls -A "$REPO_DIR/Grammar Elemetary" 2>/dev/null)" ] && NEEDS_MATERIAL=1

# "teacher_book/Grammar Bank" (American English Level 1) fica de fora de
# propósito: confirmado em setupProxy.js (2026-08-09) que o app so serve
# teacher_book/Units, teacher_book/practical_english e
# teacher_book/review_and_check_revisions - essa pasta nunca e lida, entao
# ficar vazia nao deveria bloquear a instalacao.
EMPTY_SUBFOLDERS="$(find "$REPO_DIR/Pre Intermediate and Intermediate" "$REPO_DIR/American English Level 1" "$REPO_DIR/Grammar Elemetary" -mindepth 1 -type d -empty -not -path "*/teacher_book/Grammar Bank" 2>/dev/null)"

if [ "$NEEDS_MATERIAL" = "1" ] || [ -n "$EMPTY_SUBFOLDERS" ]; then
  cat <<MSG

>>> AINDA FALTA COPIAR MATERIAL <<<
Pastas/subpastas ainda vazias dentro do projeto:
MSG
  if [ "$NEEDS_MATERIAL" = "1" ]; then
    for folder in "Pre Intermediate and Intermediate" "American English Level 1" "Grammar Elemetary"; do
      [ -z "$(ls -A "$REPO_DIR/$folder" 2>/dev/null)" ] && echo "  - $folder/ (vazia)"
    done
  fi
  [ -n "$EMPTY_SUBFOLDERS" ] && echo "$EMPTY_SUBFOLDERS" | sed 's/^/  - /'
  cat <<MSG

No app "Arquivos" do Android, baixe/exporte do OneDrive o CONTEUDO dessas
pastas (mesma estrutura interna do PC) para dentro de:
  Armazenamento interno / LearningByYourSelf / <pasta correspondente>

Depois rode de novo (este script sincroniza sozinho o que estiver la):
  bash "$SCRIPT_DIR/AndroidSetup.sh"

(A pasta "3. Mastering the American Accent" e opcional - se ficar vazia, so
esse 4o curso fica indisponivel, o resto do app funciona normal.)
MSG
  exit 0
fi

echo "=== 3/4: Instalando dependencias do app (pode demorar alguns minutos) ==="
cd "$REPO_DIR/meu-leitor-pdf"
npm install

echo "=== 4/4: Deixando o atalho de tela inicial pronto ==="
# Termux:Widget (app companheiro oficial do Termux, mesma fonte/F-Droid) le
# scripts em ~/.shortcuts/ e cria um icone de tela inicial pra cada um - um
# toque abre o Termux e ja roda o script, sem precisar digitar nada. Isso so
# PREPARA o script; o icone em si precisa ser adicionado a mao uma vez (ver
# instrucoes abaixo), o Android nao deixa um app criar widget sozinho.
mkdir -p "$HOME/.shortcuts"
cat > "$HOME/.shortcuts/LearningByYourSelf" <<SHORTCUT
#!/data/data/com.termux/files/usr/bin/bash
bash "$REPO_DIR/StartLearning.sh"
SHORTCUT
chmod +x "$HOME/.shortcuts/LearningByYourSelf"

cat <<MSG

Tudo pronto!

Para RODAR o app (sempre que for estudar), use:
  bash "$REPO_DIR/StartLearning.sh"

Depois abra o navegador do tablet em:
  http://localhost:3000

--- Atalho de tela inicial (opcional, faz o mesmo sem precisar abrir o Termux) ---
1. Instale o app "Termux:Widget" (F-Droid, MESMA fonte do seu Termux - Play
   Store e F-Droid nao se misturam).
2. Na tela inicial do Android: toque e segure a tela vazia -> Widgets ->
   "Termux:Widget" -> arraste pra tela.
3. Escolha "LearningByYourSelf" na lista (ja preparado por este script).
4. Um toque no icone abre o servidor sozinho.

Opcional (abrir o navegador sozinho, sem precisar tocar de novo depois do
atalho): instale o pacote "termux-api" (pkg install termux-api) e o app
"Termux:API" (mesma fonte). Sem isso, o atalho funciona igual, so que avisa
a URL no terminal em vez de abrir o navegador sozinho.

Opcional (tela "Ask AI" / Adele): so funciona se voce criar
  "$REPO_DIR/meu-leitor-pdf/.env.local"
com a linha:
  GEMINI_API_KEY=sua_chave_aqui
(chave gratuita em https://aistudio.google.com/apikey). Sem isso, so essa
tela fica indisponivel - o resto do app funciona normal.
MSG
