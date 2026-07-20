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

## 2. [x] Sorteio de lacunas do Listening priorizando as palavras-alvo da unit — 2026-07-19

Implementado como um toggle **"Only Unit Words" / "Random Words"** na tela de exercício do
Listening (`ListeningClozeExercise`, `App.js`) — só aparece no English Vocabulary B
(`isVocabularyTrack = Boolean(track.unit)`; American1 não tem `unit` no track e ainda não tem
palavras-alvo extraídas, então o toggle simplesmente não renderiza lá, comportamento igual a
antes). "Random Words" é o sorteio antigo, inalterado; "Only Unit Words" blanka TODA palavra
da fala que estiver em destaque/negrito no PDF `_L` da unit (não um subconjunto sorteado) —
pode dar zero lacunas numa fala sem vocabulário-alvo, ou várias numa fala que é a própria
lista de definições da unit (esperado nos dois casos).

- **Dados**: `vocabulary_target_words.json`, um array de palavras por unit (1-100), extraído
  via PyMuPDF dos 100 `_L.pdf` — bold/black com `size < 16` (abaixo das abas de seção A-E,
  títulos de seção e do cabeçalho gigante do número da unit, todos ≥ 16.6), frases de até 4
  palavras (acima disso normalmente é uma instrução em negrito, não vocabulário), sem
  stopwords (mesma lista de `LISTENING_STOPWORDS`, duplicada no script por não ter import
  compartilhado). Script no scratchpad da sessão (mesma política dos outros geradores).
- **Casamento**: exato primeiro, com fallback simples de singular/plural (±"s") — o PDF marca
  a palavra em negrito só na primeira aparição (ex. "nouns", plural), mas a mesma fala às
  vezes reusa a forma singular num exemplo seguinte ("night is a **noun**"); sem esse
  fallback esses casos ficavam sem lacuna.
- Verificado via Playwright ad-hoc: toggle aparece só no Vocabulary, `unit4-a` em "Only Unit
  Words" gera 26 lacunas nas 7 falas (todas palavras-alvo reais: pronoun, nouns, verbs,
  adjectives, adverb, prepositions, article, conjunction, link word — confirmado revelando
  "Show answers"), volta a 24 aleatórias em "Random Words"; American1 sem o toggle, sem
  regressão nos blanks aleatórios; zero erros no console.

## 3. [x] Trilha de estudo (resolver "não existe trilha, só biblioteca") — 2026-07-20

As 3 partes implementadas na Home, em cima do que já existia (`TodayPlanCard`) mais um card
novo (`DailyGoalCard`):

1. **Sequência sugerida cruzando os 3 cursos**: `findNextUnvisitedByCourse` não sugere mais
   sempre Vocabulary primeiro — os 3 candidatos (1 por curso, se houver algo não visitado) são
   ordenados pelo **% de units visitadas** de cada curso, do mais atrasado pro mais
   adiantado. Verificado ao vivo: depois de visitar a Unit 1 do Vocabulary, a sugestão seguinte
   já apontou pro American1 (ainda 0% visitado) em vez de continuar no Vocabulary. O 2º slot do
   plano ("Practice listening") também deixou de ser só o 2º curso da lista — agora é uma
   busca de verdade (`findUnpracticedListeningTrack`) pela primeira faixa de Listening/Dictation
   (nos 2 cursos, 359 tracks) que o usuário nunca tentou em nenhum dos dois modos.
2. **Meta diária configurável** (`DailyGoalCard`, abaixo do Today's Plan): 3 componentes
   togglináveis via "Customize goal" — aprender uma unit nova, zerar as revisões do dia,
   praticar Listening/Dictation. Todos os 3 são marcados uma vez e nunca desmarcados dentro do
   mesmo dia, em `u:<nome>:dailyGoal:<YYYY-MM-DD>` (data LOCAL, não `toISOString`/UTC) — um dia
   novo já nasce zerado porque a própria chave muda, sem lógica de "virou meia-noite". Marcado
   automaticamente: ao visitar uma unit NUNCA visitada antes (hook nos 3 `useEffect` que já
   marcavam `visitedUnits`/`american1VisitedSections`/`grammarElemVisitedUnits`), ao terminar
   um Listening ou Dictation (`onPracticed`, novo prop em `ListeningClozeExercise`/
   `DictationExercise`), e ao REAVALIAR um item que já estava vencido em `reviewQueue` (hook
   dentro de `scheduleReview`, único ponto usado pelas 4 telas de autoavaliação — **não** é
   `reviewQueue.length === 0`, ver "Correção 2026-07-20" abaixo). Preferência de quais
   componentes contam fica em `u:<nome>:dailyGoalPrefs`, independente do progresso do dia.
3. **% de domínio geral**: pendurado no tile "Units mastered (all courses) — overall mastery"
   do Progress Dashboard (não virou um 7º tile) e repetido como frase no `DailyGoalCard` da
   Home ("You've mastered X% of your courses so far") — mastered/total somados dos 3
   `courseProgress` (mesmos `getUnitBadgeStatus`/`getVocabularyUnitBadgeStatus`/
   `tallyUnitStatuses` de sempre). Esse cálculo foi içado pra cima no corpo de `App()` (antes
   só existia dentro da IIFE do Dashboard) — agora é compartilhado entre a Home e o Dashboard,
   sem duplicar a lógica. **Não chamar de "% do A1"** — só American1 e Grammar Elem são A1 de
   verdade, o Vocabulary (English Vocabulary B) é Pre-Intermediate/Intermediate (pasta de
   origem "Pre Intermediate and Intermediate") e entra nessa soma também.

**Correção 2026-07-20** (2 problemas que o dono notou testando um usuário recém-criado):
- "Today's Goal" mostrava 1/3 já no primeiro acesso, sem o usuário ter feito nada — porque
  "Clear today's reviews" tinha sido implementado como `reviewQueue.length === 0` ("nada
  pendente" = "feito"), e um usuário novo nunca tem nada agendado, então a fila já nasce
  vazia. Trocado por uma flag de verdade (`dailyGoalToday.reviews`), marcada só quando o
  usuário reavalia um item que JÁ estava na fila de vencidos (checado dentro de
  `scheduleReview`, comparando `course`+`id` contra `reviewQueue` no momento da avaliação) —
  reavaliar conteúdo novo (nunca esteve na fila) não conta.
- O rótulo "A1 level mastery" foi copiado direto da redação original deste item ("você domina
  X% do nível A1") sem checar se os 3 cursos são A1 de verdade — não são (ver item 3 acima).
  Renomeado pra "overall mastery" / "your courses" nos dois lugares onde aparecia (Dashboard e
  DailyGoalCard); a conta em si (soma dos 3 cursos) não mudou, só o nome.

Verificado via Playwright ad-hoc (dev server local, não persistido): usuário novo mostra 0/3
(antes da correção mostrava 1/3) e a frase "You've mastered 0% of your courses so far."
(antes "...of the A1 level..."); visita de unit → "Learn a new unit" vira ✓; conclusão de um
Listening → "Practice Listening or Dictation" vira ✓ e mostra "🎉 Goal complete for today!";
uma revisão vencida (injetada via localStorage, simulando o passar do tempo) fica
**des**marcada até o usuário efetivamente reavaliá-la, só então "Clear today's reviews" vira
✓; desmarcar um componente em "Customize goal" tira ele da lista e sobrevive a um reload;
Dashboard mostra "Units mastered (all courses) — overall mastery"; zero erros no console em
qualquer etapa.

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
