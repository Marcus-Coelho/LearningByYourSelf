# ROADMAP — Próximas implementações

Lista do que o dono do projeto decidiu implementar, em ordem. Só entra aqui o que foi
explicitamente aprovado — críticas/sugestões não aceitas ficam de fora de propósito.
Ao concluir um item, marcar `[x]` e anotar a data/commit.

## 1. [ ] Auto-pause nos áudios (Listening e Dictation)

Pausar o áudio automaticamente em intervalos, dando tempo do usuário escrever o que ouviu,
sem precisar ficar apertando pause manualmente (hoje existe o `Ctrl+Space`, mas o ideal é o
próprio player pausar sozinho).

- Já existe um lembrete disso no commit `dfe3ce5` ("incluso dictaton page, need to implement
  automatic pause") — a ideia nasceu junto com o Modo Ditado, mas vale para o Listening também.
- Pontos de partida no código: `AudioPlayerControls` (o player compartilhado, em `App.js`),
  `ListeningClozeExercise` e `DictationExercise`.
- Decisões em aberto: pausar a cada N segundos? A cada frase (exigiria timestamps por
  sentença, que os JSONs de tracks hoje não têm)? Botão liga/desliga do modo auto-pause no
  próprio player?

## 2. [ ] Sorteio de lacunas do Listening priorizando as palavras-alvo da unit

Hoje o sorteio de lacunas (`buildListeningSentenceModel` em `App.js`) evita stopwords
(`LISTENING_STOPWORDS`) mas não sabe qual é o vocabulário que a unit ensina — pode apagar uma
palavra qualquer em vez da palavra-alvo (ex.: na unit de Food, apagar algo genérico em vez de
"aubergine").

- Objetivo: as lacunas devem cair preferencialmente nas palavras-alvo da unit (o vocabulário
  em destaque/negrito no PDF da unit), com as demais palavras como fallback.
- Provável necessidade de um novo índice de dados: lista de palavras-alvo por unit (extraível
  dos PDFs `_L` via PyMuPDF, pelo estilo/negrito da fonte — mesmo tipo de extração já feita em
  `grammar_elem_index.json`), cruzada com as `sentences` de cada track na hora de sortear.
- Não alterar o formato dos JSONs de tracks existentes sem necessidade — um arquivo novo de
  "palavras-alvo por unit" é menos invasivo.

## 3. [ ] Trilha de estudo (resolver "não existe trilha, só biblioteca")

O app não responde "o que eu devo estudar hoje e por quê" — não há sequência sugerida, meta
diária, nem noção de "você domina X% do nível A1".

- Objetivo em três partes (podem ser fases separadas):
  1. **Sequência sugerida**: uma ordem de estudo recomendada cruzando os 3 cursos (não só
     "próxima unit não visitada" por curso, que é o que o Today's Plan já faz).
  2. **Meta diária**: alvo configurável (ex.: 1 unit nova + revisões do dia + 1 listening),
     com indicação visível de "meta de hoje cumprida".
  3. **% de domínio do nível**: "você domina X% do A1" — derivável do que já existe
     (`getUnitBadgeStatus`/`tallyUnitStatuses`, usados pelo Progress Dashboard).
- Pontos de partida no código: `TodayPlanCard` (Home), `findNextUnvisitedByCourse`,
  Progress Dashboard (`activePage === 'dashboard'`), fila de revisão (`loadDueReviews`).
- Persistência: seguir o padrão `u:<nome>:<chave>` do `localStorage` (ver CLAUDE.md).

## 4. [ ] Speaking (shadowing com reconhecimento de voz do Edge/Chrome)

Nova tela "Speaking" usando a `SpeechRecognition` API nativa do navegador (Edge/Chrome —
fala → texto, grátis, sem chave de API), reaproveitando os mesmos tracks/áudio do
Listening/Dictation (`LISTENING_SOURCES`).

- Fluxo planejado (fase 1 — shadowing):
  1. Mesma estrutura de 3 telas do Listening/Dictation (hub → fonte → exercício); o item
     "Speaking" do menu lateral já existe como placeholder (`IconMic`, link morto `#link-3`).
  2. O app toca uma frase do áudio (frase↔áudio já mapeados nas `sentences` dos tracks).
  3. Usuário clica no microfone e **repete a frase** (`recognition.lang = 'en-US'`).
  4. Comparação transcrição × frase original palavra a palavra (mesma normalização/LCS já
     usada no Dictation — `scoreDictationAnswer` é o modelo) com destaque verde/vermelho.
  5. Score % por track em namespace próprio (`u:<nome>:speaking:<trackId>:stats`), seguindo
     o mesmo isolamento Listening/Dictation — nunca misturar os namespaces.
- **Complemento barato**: gravar a voz do usuário com `MediaRecorder` e oferecer "ouvir
  nativo" / "ouvir você" — autoavaliação por comparação.
- Limitações conhecidas (aceitas): o reconhecimento do Chrome/Edge roda em nuvem (precisa de
  internet), e o reconhecedor às vezes "corrige" pronúncia ruim pelo contexto — o feedback é
  aproximado, não fonético. Avaliação fonética de verdade (Azure Speech etc.) fica para uma
  eventual fase 2, só se a fase 1 se provar útil no dia a dia.
- A API não existe no Firefox/Safari antigo — a tela deve detectar
  (`window.SpeechRecognition || window.webkitSpeechRecognition`) e mostrar um aviso claro em
  vez de quebrar.

## 5. [ ] Contador de tempo de estudo + streak de dias (Dashboard)

Parte da sugestão original do Dashboard que ficou de fora quando ele foi implementado:
"sequência de dias (streak), tempo de estudo — motivação visível". O Progress Dashboard
atual mostra palavras/revisões/units/exercícios, mas **não mede tempo nem dias seguidos**,
porque o app não tem nenhum registro de atividade diária — essa infraestrutura precisa ser
criada primeiro (foi deliberadamente pulada na implementação do Dashboard pra não inventar
logging sem aprovação do dono).

- **O que criar**: um log leve de atividade em `localStorage` (padrão `u:<nome>:<chave>`,
  ver CLAUDE.md) — ex.: minutos ativos por dia (`activity:<YYYY-MM-DD>` → minutos), gravado
  de tempos em tempos enquanto o usuário está numa tela de estudo (leitura, exercícios,
  Listening, Dictation), com detecção de ociosidade (não contar tempo com a aba aberta e o
  usuário longe — ex.: parar de somar depois de N min sem interação/áudio tocando).
- **O que mostrar no Dashboard**: tempo de estudo de hoje/da semana e o streak (dias
  seguidos com pelo menos X min de estudo). Possível cartão extra nos stat tiles existentes.
- **Decisões em aberto** (perguntar ao dono antes de implementar): cronômetro visível
  durante o estudo ou registro silencioso que só aparece no Dashboard? Qual o mínimo de
  minutos pra um dia contar no streak?
- Como qualquer chave nova `u:<nome>:*`, entra automaticamente no backup/restore existente.
