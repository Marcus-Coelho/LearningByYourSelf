# ROADMAP — Próximas implementações

Lista do que o dono do projeto decidiu implementar, em ordem. Só entra aqui o que foi
explicitamente aprovado — críticas/sugestões não aceitas ficam de fora de propósito.
Ao concluir um item, marcar `[x]` e anotar a data/commit.

## 1. [~] Auto-pause nos áudios (Listening e Dictation) — DADOS COMPLETOS, FALTA VALIDAR

Pausar o áudio automaticamente nos silêncios reais entre frases, dando tempo do usuário
escrever o que ouviu; `Ctrl+Space` retoma de onde parou.

**Status (2026-07-19): pontos de pausa gerados pros 307 tracks do English Vocabulary B e
pros 52 tracks do American English A1 no Dictation** (piloto original aprovado pelo dono em
2026-07-16, commits `788db9d`/`6d28319`, era só `unit4-a`/`unit4-b`). O que já existe:
- Pontos de pausa detectados offline por análise de silêncio (Python: `soundfile`+`numpy`,
  sem ffmpeg — limiar -35dB relativo ao pico, silêncio ≥ 0.85s = pausa de frase, trechos
  > 8s divididos recursivamente na maior pausa interna disponível — reduzido de 15s/0.4s
  depois que o dono notou trechos longos demais pra escrever de uma vez; American1 usa piso
  de 0.15s em vez de 0.4s pro corte interno, porque o diálogo é bem mais contínuo, com menos
  silêncio real entre falas que a leitura do Vocabulary). Descarte do cabeçalho falado do
  início: Vocabulary descarta até 2 pausas iniciais ("Unit N letra. Título"), American1
  descarta só 1 (o áudio fala só "CD X Track Y"). Dados em
  `meu-leitor-pdf/src/dictation_pause_points.json`; o script gerador vive no scratchpad da
  sessão (mesma política dos outros geradores — não persiste no repo, os parâmetros estão
  documentados aqui e no PROJECT_SUMMARY.md).
- No player: pausa por detecção de **cruzamento** do ponto (não proximidade — ver
  PROJECT_SUMMARY, houve um bug real de insta-repause), toggle on/off, pílula roxa pulsante
  "Paused — Ctrl+Space to continue", pílula verde de fim de áudio, botão "↺ Replay last part".
- Limitação conhecida, sem solução acústica possível: uns 6-7 tracks do American1 (a maioria
  no CD2, ex. `cd2-track10`) têm trechos com silêncio real zero (diálogo gravado sem
  intervalo entre falas) — ficam sem divisão extra mesmo no limiar mais sensível; 2 tracks do
  Vocabulary (`unit15-c`, `unit37-b`) ficam sem nenhum ponto por terem só 2-3 frases curtas
  sem pausa ≥ 0.85s entre elas. Auto-pause simplesmente não dispara nesses casos — comportamento
  seguro (áudio toca normal), não um erro.

**Falta para fechar o item**:
- Validar por amostragem os pontos gerados (Vocabulary completo + American1 completo) —
  ainda não ouvido track a track pelo dono.
- Decidir se o Listening também ganha auto-pause (a infraestrutura de pontos serve igual).

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
