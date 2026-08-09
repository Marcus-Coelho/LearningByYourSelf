# CLAUDE.md — Guia Operacional

## Quick Start

```bash
cd meu-leitor-pdf
npm install
npm start
```

Aplicação roda em `http://localhost:3000` (ou `3001` em pendrive, auto-detectado por `OpenWhenReady.ps1`).

**Requisitos:** Pastas irmãs devem existir na raiz:
- `Pre Intermediate and Intermediate/EVIU_P_I/` — PDFs e áudios do curso Vocabulary (100 units)
- `American English Level 1/` — PDFs e áudios do curso American English A1 (12 units + 5 CDs)
- `Grammar Elemetary/` — PDFs e áudios do curso Grammar English A1 (115 units)

Essas pastas são ignoradas por git (`.gitignore`), não são commitadas.

**Exceção — American Accent** (`3. Mastering the American Accent/`): o caminho é resolvido por
TENTATIVA em `setupProxy.js` (não é mais um absoluto fixo, desde 2026-07-26), nesta ordem:
1. pasta **irmã** das outras 3, dentro da árvore do projeto — é assim na cópia do pendrive, que
   precisa ser autocontida pra rodar em qualquer PC;
2. `C:\Users\marcu\OneDrive\Documentos\A_INGLES\LIVROS\3. Mastering the American Accent` — onde
   a pasta ainda mora no PC do dono, fora da árvore do projeto.

Quem existir primeiro vence, então as duas cópias funcionam sem nenhuma edição manual. Se
nenhum caminho existir, só esse curso fica indisponível (rotas 404) — o resto do app roda
normal.

**Opcional — tela "Ask AI"**: precisa de `GEMINI_API_KEY` em `meu-leitor-pdf/.env.local` (copie de `.env.local.example`, chave gratuita em https://aistudio.google.com/apikey). Sem essa chave o resto do app funciona normal, só essa tela responde erro 500 explicando o que falta.

`npm run build` **funciona e compila normalmente** — é usado o tempo todo durante o desenvolvimento pra verificar que uma mudança não quebrou nada (é o jeito padrão de "checar erros de sintaxe/JSX" nesse projeto, sem precisar do dev server rodando). O que **não existe** é hospedagem em produção: o build gerado não seria funcional publicado num servidor, porque `setupProxy.js` (áudio/PDF) só funciona sob `npm start` — ver "Decisões Imutáveis" abaixo.

---

## Arquitetura

### Estrutura Física

```
meu-leitor-pdf/
├── src/
│   ├── App.js (arquivo único, ~10000 linhas — tudo aqui: 4 cursos, Listening, Dictation,
│   │           My Words, Dashboard, Sound Bank, etc.)
│   ├── App.css (~3700 linhas, também um arquivo único)
│   ├── GrammarVocabExercises.js / .css (ÚNICA tela em arquivo próprio — ver a seção
│   │           "Grammar & Vocabulary Exercises"; não é precedente pra novas telas)
│   ├── grammar_vocab_exercises_grammar.json / _vocab.json / _similar.json (exercícios
│   │           dessa tela — dados editáveis com cuidado, não índices gerados de PDF)
│   ├── setupProxy.js (middleware do dev server — serve áudio/PDF das pastas irmãs)
│   ├── exercises_coords.json / answers_coords.json / audio_anchors_coords.json (Vocabulary)
│   ├── american1_index.json / american1_audio_anchors.json / american1_references.json /
│   │   american1_reference_audio_anchors.json / american1_transcriptions_audio_anchors.json /
│   │   american1_videos.json (American English A1)
│   ├── grammar_elem_index.json / grammar_elem_appendix_index.json / grammar_elem_audio.json
│   │   (Grammar English A1)
│   ├── listening_vocabulary.json / listening_american1.json (tracks de Listening/Dictation)
│   ├── dictation_pause_points.json (pontos de auto-pause do Dictation, por trackId —
│   │   gerado por detecção de silêncio em Python; cobre os 307 tracks do English
│   │   Vocabulary B e os 52 do American English A1)
│   └── (todos os "*_coords*.json"/"*_index*.json"/"*_anchors*.json" são índices GERADOS —
│         não editar à mão, ver "Dados Gerados" abaixo)
├── package.json
└── public/
    └── (nenhum áudio/PDF de curso aqui — servidos via setupProxy.js; só assets estáticos
        do app, ex. openCourse.png da Home)
```

### Padrão de Desenvolvimento

- **Nenhum roteamento** — tudo é estado local (`activePage`, `selectedUnit`, etc.), um único componente `App()`
- **Praticamente nenhum componente em arquivo separado** — funções/componentes adicionais moram todos dentro de `App.js` (ex.: `WordbookPage`, `ListeningClozeExercise`, `DictationExercise`, `ReviewCard`, `TodayPlanCard`). **Única exceção:** a tela Grammar & Vocabulary Exercises (`GrammarVocabExercises.js`/`.css`), por volume de dados/UI — ver a seção dela; tela nova continua indo pra dentro de `App.js`
- **LocalStorage única** — sem backend, sem servidor, sem contas de verdade
- **`npm run build` compila** (usado como verificação de sintaxe/regressão), mas **não há deploy/hospedagem** — ver acima

---

## Cursos & Recursos

**Nível de cada curso** (`courses[id].level`, `App.js`): American English A1 e Grammar
English A1 são "Beginner" (CEFR A1 de verdade); English Vocabulary B é "Intermediate" (a
pasta de origem do material se chama "Pre Intermediate and Intermediate" — nível acima dos
outros dois, apesar do "B" no nome não deixar isso óbvio). American Accent também é
"Intermediate" — não é sobre dificuldade de leitura, mas o livro pressupõe alguma base de
vocabulário/gramática pra fazer sentido (é sobre refinar pronúncia, não aprender do zero).
Avisado ao usuário (rótulo "Beginner"/"Intermediate" padronizado, classe
`.course-level-heading`) nas telas Courses, Listening, Dictation e Progress Dashboard, sempre
na ordem `COURSE_LEVEL_ORDER` (American1, Grammar Elem, Vocabulary, American Accent). Um novo
curso: definir o `level` dele em `courses` e incluir o id em `COURSE_LEVEL_ORDER` já basta
pras 4 telas acima pegarem sozinhas.

### 1. Vocabulary — "English Vocabulary B" (100 units)
- Leitura: PDF `_L` (leitura) com áudio ancorado na margem esquerda
- Exercícios: PDF `_E` (exercícios), recortado unit-por-unit, com gabarito
- Índices: `exercises_coords.json`, `answers_coords.json`, `audio_anchors_coords.json`

### 2. American English A1 (12 units, seções A/B/C/especial)
- Leitura: seções de 2 páginas, merged em memória via `pdf-lib` (`setupProxy.js`)
- Áudio ancorado sobre selos impressos de CD/faixa (detecção por template OpenCV, 5 CDs)
- Sound Bank, Vocabulary/Grammar Bank (referências), Practical English (vídeos), transcrições —
  ver `american1_references.json`/`american1_videos.json`/`american1_reference_audio_anchors.json`
- Índice principal: `american1_audio_anchors.json`

### 3. Grammar English A1 (115 units + Appendixes + Additional Exercises)
- "Essential Grammar in Use, unit by unit" — leitura + exercícios + áudio curto por unit
- Índices: `grammar_elem_index.json` (títulos), `grammar_elem_appendix_index.json`,
  `grammar_elem_audio.json`

### 4. American Accent (livro "Mastering the American Accent", Lisa Mojsin — 9 capítulos)
- Curso de **pronúncia**, não de conteúdo — sem "unit", é um livro corrido de 211 páginas (140
  usadas, capítulos 1-9; a "Native Language Guide", páginas 149-210, fica fora). PDF único (não
  um arquivo por página como os outros 3) + 390 faixas de áudio já pré-recortadas por conceito
  (sem merge de PDF nem detecção visual de selo — cada faixa já é um arquivo próprio, e o
  número "Track N" impresso no livro bate 1:1 com o número no início do nome do arquivo)
- **Leitura por "tela"**, não por página fixa 1:1: `american_accent_index.json` agrupa 1+
  páginas do PDF numa tela sempre que o conteúdo de uma faixa de áudio atravessa a quebra de
  página impressa — ver "Dados Gerados" abaixo pra como isso é detectado e a lista de exceções
  manuais conhecidas. Progresso é por **página real do livro** (não por tela nem por unit
  inexistente) — visitar uma tela de 2 páginas marca as 2 pro cálculo de "Your Progress"
- Player **fixo no topo**, não ancorado sobre o PDF (diferente do Vocabulary/American1) — uma
  página pode ter 2-3 faixas, então um botão por coordenada não escalava; mesmo padrão do
  Grammar Elem (link simples ao lado do conteúdo, não um selo posicionado em cima da página)
- Identificação da tela mostra capítulo+título entre parênteses (`chapter.topic`, extraído do
  rodapé corrido do livro) e página+subtítulo entre parênteses (`screen.topic`, o heading real
  tamanho 18 daquela tela, "se houver") — ex. "Chapter Eight (Sound Like A True Native
  Speaker) · p. 115–117 (Linking Words for Smoother Speech Flow)"
- **Dictation/Listening/Speaking Wave 1** (53 faixas, `listening_american_accent.json`, dentro
  de `LISTENING_SOURCES` — aparece nos 3 automaticamente): texto das "Practice Sentences"/
  "Sentence Pairs for Practice"/"Sentences for Practice" extraído do PDF (âncora do selo
  "Track N" — fica na MARGEM da página, alinhado com o heading que narra, não agrupado no fim
  como a extração de texto simples sugere) + pontos de pausa por detecção de silêncio
  (soundfile/numpy, recuo de 0.15s — ver "Auto-pause" no ROADMAP). Título do exercício nas 3
  telas inclui `(Track N)` — o número real da faixa no livro, não só a posição sequencial
- **Pares mínimos com lacuna forçada no Listening** (`track.targetWords`, tracks 71, 80, 88,
  100, 255, 280): faixas de "Sentence Pairs for Practice" cujo par de frases muda só 1 palavra
  parecida/confusa (ex. pest/past, lock/luck, bald/bold, fool/full) ou 1 palavra que muda de
  acento (politics/politician — extraído direto da formatação **bold** do PDF, não chutado)
  SEMPRE escondem essas palavras específicas no Listening, sem toggle — diferente do
  `wordMode`/"Only Unit Words" opcional do Vocabulary. Nem toda "Sentence Pairs for Practice"
  entra aqui — só as que são de verdade sobre confusão de som/acento (331/333/280-parcial são
  sobre tipo de pergunta/entonação, não confusão sonora, então ficam com lacuna aleatória)

### Ask AI (menu principal, fora dos 4 cursos, 2026-07-25)

Tela de Q&A pra dúvidas sobre a língua inglesa em geral (gramática, vocabulário, pronúncia,
expressões idiomáticas, uso — não só gramática, ver "Correção 2026-07-25" abaixo): um campo de
texto, botão "Ask", resposta abaixo. A IA se chama **Adele** (americana, EUA — pedido do dono,
2026-07-25), mascote desenhado em SVG puro (`AdeleMascot`, `App.js` — sem arquivo de imagem
externo, mesmo espírito dos ícones do resto do app).
- **Backend**: `POST /api/ask-grammar` (`setupProxy.js`) chama a API do Gemini
  (`src/geminiGrammarHelper.js`, modelo `gemini-flash-latest` — alias que a Google sempre
  aponta pro flash atual, escolhido depois de `gemini-2.5-flash` parar de aceitar contas novas
  no meio da implementação). Nome da rota/arquivo ficou "grammar" por já existir quando o
  escopo era mais estreito — não é mais literal, mas renomear não foi pedido.
  - Único endpoint do projeto que recebe corpo JSON — `express.json()` escopado só nesta rota
    (as outras usam GET com parâmetro na URL, nunca precisaram de body parser).
- **`systemInstruction`** (2026-07-25, reescrita depois que o dono mostrou uma resposta de
  outra IA que ele gostou): tutora completa/didática, não só uma frase curta — confirma o que
  está certo, explica a regra, dá exemplos, **chama exceções explicitamente**, e às vezes
  termina com um desafio curto ("fill in the blank"). Também corrige a pergunta do próprio
  usuário se tiver erro (linha "Corrected: ..." antes de responder, só quando havia erro de
  verdade).
- **Memória de só o ÚLTIMO turno** (`askAiLastExchange`, `App.js`, 2026-07-25): não é chat de
  verdade — não cresce, não persiste no `localStorage`, reseta ao sair da tela. O cliente
  reenvia `previousQuestion`/`previousAnswer` a cada request; o servidor não guarda nada entre
  requisições (mesmo padrão stateless de sempre, só que o cliente carrega 1 turno de contexto).
  Existe especificamente pra Adele poder propor um desafio numa resposta e avaliar a tentativa
  do usuário na pergunta seguinte — sem isso ela não teria como saber a que uma resposta tipo
  "He is always tired." se refere. Botão "Start a new topic" zera essa memória na mão.
- **Render do markdown-lite** (`renderAdeleMarkdown`, `App.js`): a resposta pode vir com
  `### heading`, `**bold**`, `- bullet` (pedido no prompt) e também `*italic*`/`> quote`/`***`
  como divisor (o modelo usa esses por conta própria mesmo sem pedir — mais robusto o renderer
  cobrir do que tentar proibir via prompt, LLM não obedece restrição de formatação com 100% de
  fidelidade). Parser feito à mão, sem lib de markdown nem `dangerouslySetInnerHTML` — só monta
  elementos React de verdade a partir do texto, zero risco de XSS mesmo com resposta hostil.
- **Chave**: `GEMINI_API_KEY` em `meu-leitor-pdf/.env.local` (gitignored, template em
  `.env.local.example`). Nome SEM prefixo `REACT_APP_` de propósito — o CRA só expõe pro bundle
  do navegador variáveis com esse prefixo; sem ele, a chave existe só no processo Node do dev
  server (onde `setupProxy.js`/`geminiGrammarHelper.js` rodam), nunca chega no cliente. Avaliado
  contra chamar a API direto do navegador — rejeitado porque exporia a chave no DevTools/aba de
  rede pra qualquer um roubar.
- Só funciona sob `npm start`, mesma limitação de sempre (não há servidor de produção). Sem a
  chave configurada, a rota responde 500 com mensagem explicando o que falta — o resto do app
  funciona normal.

### Grammar & Vocabulary Exercises (menu principal, fora dos 4 cursos)

Quiz **só de texto** — sem PDF, sem áudio, sem pasta irmã de material. Não substitui nem toca
nos cursos Grammar English A1 / English Vocabulary B "de verdade" (que continuam PDF+áudio unit
por unit): é prática extra, com dados próprios. `activePage: 'grammar-vocab-exercises'`, uma
tela só, entrada pelo menu lateral (ícone `IconQuiz`).

- **ÚNICA exceção real à regra "tudo dentro de `App.js`"** ([Decisões Imutáveis](#-design-decisions-por-que-é-assim)
  item 3): mora em `src/GrammarVocabExercises.js` + `src/GrammarVocabExercises.css`, arquivos
  próprios. Motivo: o volume de dados+UI dessa feature sozinha (>500 exercícios) inflaria
  `App.js`/`App.css` a ponto de piorar a navegação dos dois — decisão tomada ao encomendar os
  exercícios, não um deslize. **Isso não reabre a regra**: qualquer outra tela nova continua
  indo pra dentro de `App.js`. `App.js` importa só o componente default; **zero linhas novas em
  `App.css`**.
- Por causa disso, `userKey` é o **único named export** de `App.js` (`export const userKey`) —
  existe pra essa tela namespacear o `localStorage` igual ao resto do app sem duplicar a função.
  Não crescer essa lista de exports sem necessidade real.
- **3 seções, 2 mecânicas diferentes** (`SOURCES`, `kind`):
  - `grammar` (`multipleChoice`, 200 exercícios, 2 por unit, units 1-100 do "Essential Grammar
    in Use") — escritos **à mão** a partir dos títulos reais de `grammar_elem_index.json`,
    porque o app não tem o texto das lições extraído, só os títulos.
  - `vocabulary` (`multipleChoice`, 200 exercícios, 1-3 por unit nas units **4-100** — as 3
    primeiras não têm faixa de Listening da qual tirar uma frase real) — gerados por script,
    sempre *grounded* em dado real: palavra-alvo de `vocabulary_target_words.json` numa frase de
    `listening_vocabulary.json`, nunca inventada.
  - `similar` (`written`, 115 blocos, um por unit) — "Similar Exercises from Grammar
    Elementary": o aluno **digita** a resposta, não escolhe. Não é multiple choice **de
    propósito** — os 2 últimos exercícios de cada unit do livro são de produção, e é isso que os
    torna mais difíceis que os primeiros. Cada item traz um **array** de respostas aceitas (o
    próprio Key to Exercises lista variantes: "It isn't/it's not big enough", "nobody/no-one"),
    e `normalizeWrittenAnswer` ignora o que não é erro de gramática: maiúscula, espaço sobrando,
    ponto final e **tipo de apóstrofo** (o aluno digita `'` reto, o livro usa `’` curvo — sem
    isso "I'd buy" nunca casaria com "I’d buy"). Não remover essa normalização.
- **Qualidade dos distratores (2 rodadas de feedback do dono, não mexer sem motivo)**: frases
  que eram só LISTAS de palavras do PDF ("Forehead, cheek, ___, neck...") viravam exercício
  ambíguo (qualquer item da lista serve) — trocadas por frase de verdade quando havia uma pro
  mesmo unit/palavra-alvo; distratores quase-sinônimos da resposta certa ("totally"/"absolutely"
  pra "completely") foram trocados por palavras plausíveis que mudam o **sentido**, não só o
  registro. Distratores nunca são número ou contração solta (óbvios demais de descartar).
- **Persistência**: respostas em `u:<nome>:grammarVocabAnswers:<sourceId>` (localStorage, uma
  chave por seção). A posição atual (seção aberta) fica em **`sessionStorage`**, não
  localStorage (`grammarVocabExercisesPosition`) — é retomada dentro da sessão, de propósito
  não sobrevive a fechar o navegador. Reabrir pelo menu zera a posição e remonta o componente
  via `grammarVocabExercisesResetKey` (prop `key`).
- Precisa de `app-shell--allow-grow` (já na lista em `App.js`) — a lista de exercícios cresce
  além da viewport, ver "Quirks & Gotchas".

### Listening (menu principal, fora dos 4 cursos)
- Tela própria (`activePage: 'listening' → 'listening-tracks' → 'listening-exercise'`),
  reaproveita os mesmos tracks/áudio dos cursos (`listening_vocabulary.json`/
  `listening_american1.json`, agrupados em `LISTENING_SOURCES`)
- Exercício de "fill in the blank": mostra o texto com lacunas sorteadas, ouve e completa
- **"Only Unit Words" / "Random Words"** (toggle, só no Vocabulary — `isVocabularyTrack =
  Boolean(track.unit)`, American1 não tem esse campo nem palavras-alvo extraídas): "Only Unit
  Words" blanka toda ocorrência das palavras em destaque/negrito da unit
  (`vocabulary_target_words.json`, extraído dos `_L.pdf` via PyMuPDF); "Random Words" é o
  sorteio original, inalterado. Ver ROADMAP item 2
- Player: `WideAudioPlayer` (largura total — play/pause, ±5s, stop, A-B, loop do áudio
  inteiro, velocidades 0.5x-2x, barra de progresso). Usado SÓ aqui e no Dictation; o resto
  do app continua com os players compactos (pílula amarela)
- **`Ctrl+Space` pausa/retoma QUALQUER `<audio>` tocando na página, em QUALQUER tela** —
  atalho GLOBAL (`App.js`, `useEffect` logo no topo do componente, procura em
  `document.querySelectorAll('audio')`), não mais dois `useEffect` locais escopados ao
  próprio player do Listening/Dictation (removidos, 2026-07-24). Funciona também nas 9 telas
  de leitura (players ancorados/simples, que nunca tiveram esse atalho) e com o foco dentro
  do editor **contentEditable** do My Notes (que não é INPUT/TEXTAREA, então precisa checar
  `document.activeElement.isContentEditable` além das 3 tags de sempre pra não interceptar o
  Space normal de digitação ali). Space sozinho (sem Ctrl) continua funcionando fora de campo
  de texto, igual antes. Um listener `play` em capture (`document.addEventListener('play',
  ..., true)` — esse evento não faz bubble) guarda o último `<audio>` que tocou, pra
  Ctrl+Space conseguir RETOMAR mesmo se a pausa anterior tiver sido por clique no botão do
  player, não pelo teclado.

### Dictation (menu principal, "Modo Ditado")
- Mesmíssimos `LISTENING_SOURCES`/tracks do Listening, mas **sem mostrar o texto antes** —
  o aluno ouve e digita tudo numa caixa só; comparação palavra-a-palavra via LCS, com
  destaque verde (certo)/vermelho (errado) e score em %
- Estado/handlers/estatísticas (`localStorage` sob `dictation:<trackId>:stats`) **totalmente
  separados** do Listening (`listening:<trackId>:stats`) — nunca alterar um mexendo no outro
- **Auto-pause**: pausa sozinho nos silêncios entre frases (`dictation_pause_points.json`,
  cobre todo o Vocabulary e o American1 — ver ROADMAP item 1, ainda falta validar por
  amostragem e decidir se o Listening também ganha), com detecção por CRUZAMENTO do ponto
  (nunca por proximidade — proximidade re-pausava em cima do ponto ao usar "Replay last
  part"), toggle on/off, pílulas de estado (pausado/fim do áudio) e botão "↺ Replay last
  part". `Ctrl+Space` retoma (agora o atalho GLOBAL, ver Listening acima). **Cruzamento
  checado via `requestAnimationFrame`, não
  `timeupdate`** — o navegador só dispara `timeupdate` a cada ~250ms, atraso suficiente pra
  `audio.pause()` vazar pro comecinho da fala seguinte em falas coladas (relatado pelo dono,
  casos reais do American1 com pouco silêncio entre personagens); rAF (~60x/s) reduz essa
  folga a poucos ms. Se ainda vazar em algum caso pontual, o próximo passo é recuar os pontos
  mais cedo em `dictation_pause_points.json` (via script, nunca à mão — ver "Dados Gerados")
- A recuperação do casamento LCS é por DP de SUFIXOS + caminhada pra frente (palavra casa
  com a ocorrência mais CEDO no texto) — a versão prefixos+trás casava palavra repetida com
  uma ocorrência lá do fim, deixando o verde longe do contexto digitado; não regredir
- **Rótulos de personagem (`A:`, `Jenny:`, `Teacher ...`) são removidos do texto usado pra
  corrigir E do texto exibido** (`stripDictationSpeakerLabel`, `App.js`) — são convenção de
  transcrição, a voz do áudio não fala esse nome, então cobrar o aluno por não digitá-lo
  penalizava injustamente, e mostrar o nome solto no meio do exercício de Listening também
  não fazia sentido (pedido do dono, 2026-07-23 — antes só o Dictation limpava, o Listening
  usava `track.sentences` direto). Regra de dois-pontos é genérica; rótulos sem dois-pontos
  (só existem no American1, ex. "Teacher Good morning...", "Rob Hi. My name's...") usam uma
  lista fechada de nomes conhecidos — não generalizar pra "qualquer palavra maiúscula no
  início", isso apagaria começos de frase legítimos como "JetBlue flight...".
  `splitListeningSpeakerLabel` (Listening) reaproveita a mesma `stripDictationSpeakerLabel` —
  nunca duplicar essa lista/regex em dois lugares
- **Token sem nenhuma letra/dígito (ex.: um "—" solto entre frases) não conta pro score** —
  fica de fora do casamento LCS e renderiza sem cor (`dictation-word-neutral`, nem verde nem
  vermelho) na correção, mas continua aparecendo no texto reconstruído. Antes disso, um "—"
  virava um "wordResult" impossível de acertar (o aluno nunca digita "—"), sempre vermelho e
  descontando nota — contra o próprio aviso da tela ("Punctuation and capitalization don't
  matter"). Ver `isDictationPunctuationOnlyToken`/`scoreDictationAnswer`
- **"Unit 1A" no título do Dictation e do Listening (só American1)**: `track.unit`/`.letter`
  já existe pro Vocabulary (mostrado dentro do `listeningTrackLabel`, ex. "(unit 4A)"); pro
  American1 (sem esses campos, só `cd`/`track`) é derivado de `american1_audio_anchors.json`
  invertido (`AMERICAN1_CD_TRACK_TO_UNIT`, `App.js`) + um `Object.assign` de override manual
  pras 4 faixas sem âncora indexada (`cd2-track11`→3B, `cd2-track35`→4A, `cd4-track7`/
  `cd4-track8`→8A, informadas pelo dono). Ver `american1TrackUnitLabel`

### Trilha de estudo (Home — `TodayPlanCard` + `DailyGoalCard`)
- **`TodayPlanCard`**: "Learn something new" aponta pro curso mais ATRASADO em % de units
  visitadas (`findNextUnvisitedByCourse`, ordena por `courseId` cruzando os 4 cursos — não é
  mais sempre Vocabulary primeiro); "Practice listening" é uma faixa de Listening/Dictation de
  verdade nunca tentada em nenhum dos 2 modos (`findUnpracticedListeningTrack`, varre os 359
  tracks dos 2 cursos), não mais o 2º curso da lista de units. **"Review words" (My Words) é
  sempre o ÚLTIMO item** (pedido do dono, 2026-08-08) — mesma posição do "Practice N words" no
  `ReviewCard` da tela Courses, que também foi movido pro fim (antes abria a lista). Essa linha
  aparece mesmo com nada vencido, desde que tenham sido adicionadas palavras HOJE
  (`wordbookAddedTodayCount`): palavra nova só vence na virada do dia, então sem ela adicionar
  palavras não mudava nada visível na Home e parecia que não tinham sido salvas
- **`DailyGoalCard`**: meta diária com 3 componentes togglináveis via "Customize goal" —
  aprender unit nova, zerar revisões do dia, praticar Listening/Dictation. Os 3 usam uma flag
  própria em `dailyGoalToday` (nenhum é `reviewQueue.length === 0` — isso dava um check de
  graça pra usuário novo sem nada agendado ainda, corrigido em 2026-07-20): "reviews" só marca
  dentro de `scheduleReview`, quando o item reavaliado JÁ estava vencido (reavaliar conteúdo
  novo não conta) — checado **direto no localStorage**, nunca contra o state `reviewQueue`
  (bug real corrigido em 2026-07-24: `reviewQueue` só recarrega quando `activePage` MUDA de
  valor, mas navegar entre units com "Next Unit"/"Previous Unit" nunca muda `activePage`
  — fica sempre a mesma string, ex. `"grammarElem-unit"` — então uma revisão que vencesse
  DURANTE uma sessão de navegação assim nunca era reconhecida como vencida, mesmo reavaliando
  o item certo; state pode ficar desatualizado por tempo indeterminado, localStorage nunca) —
  **também marca ao TERMINAR uma sessão de flashcards do My Words**
  (`handleWordbookSessionComplete`, passado como `onSessionComplete` pro `WordbookPage`). Era
  por card avaliado (`handleGradeWord`) até 2026-08-08; mudou junto com a reciclagem do "Again"
  (ver "Revisão espaçada / My Words"): como a sessão só acaba quando toda palavra vencida foi
  respondida sem "Again", chegar ao fim já é prova de que a revisão inteira aconteceu, enquanto
  avaliar 1 card de 25 não era. **Avaliado e rejeitado no mesmo dia:** marcar por tempo de
  permanência na tela (ex. N × 4s) — proxy que erra pros dois lados (marca sozinho com a aba
  aberta e esquecida; deixa de marcar quem revisa rápido) e ainda exigiria pausar em
  `visibilitychange`/blur, tudo pra aproximar algo que o fim da sessão já mede exato; os outros 2 via `markDailyGoalDone`
  (visitar unit nunca visitada / terminar Listening ou Dictation, `onPracticed` prop em
  `ListeningClozeExercise`/`DictationExercise`). Progresso do dia em `dailyGoal:<YYYY-MM-DD>`
  (data LOCAL, nunca `toISOString`), nunca desmarcado — dia novo já nasce zerado porque a
  chave muda sozinha
- Cada item do `DailyGoalCard` tem um botão "i" (mesmo padrão do `UnitBadgeLegend`) explicando
  como cumprir aquele item — **um popover só, fora do `<ul>`**, não um por `<li>`: com os itens
  colados (6px de gap), um popover por linha cobria o botão "i" do vizinho de baixo e travava
  o clique nele (bug real, pego via Playwright). Texto de cada explicação em
  `DAILY_GOAL_EXPLANATIONS` tem que continuar batendo com a lógica real de quando cada
  componente marca — não é só rótulo solto
- `courseProgress` (status por unit/página dos 4 cursos) e `overallMasteryPercent` são computados uma
  vez no corpo de `App()`, compartilhados entre a Home e o Progress Dashboard — não duplicar
  esse cálculo se mexer em qualquer um dos dois. **Não chamar isso de "% do A1"** — só
  American1 e Grammar Elem são A1 de verdade, o Vocabulary (English Vocabulary B) é
  Pre-Intermediate/Intermediate e entra na mesma soma (rótulo já foi "A1 level" e corrigido
  pra "overall mastery" depois que o dono notou a inconsistência)

### Progress Dashboard ("Progress", menu principal)
- Tela só-leitura: cartões de estatística (palavras aprendidas/devidas, revisões pendentes,
  units dominadas nos 4 cursos + "% overall mastery" no mesmo tile, exercícios de
  Listening/Dictation praticados) + progresso por curso (barra segmentada não-visitado/
  visitado/avaliado/dominado) + atalho "Continue where you left off". Não escreve nada — só lê
  dados que os outros recursos já persistem

---

## Dados & Persistência

### LocalStorage Namespacing

Todas as chaves por usuário: `u:<nome>:<chave-base>` (`userKey(name, base)`)

```
# Vocabulary
u:<nome>:visitedUnits              — array de unit numbers
u:<nome>:notes:<unit>              — string, notas da unit
u:<nome>:answers:<exerciseId>      — string, resposta do user
u:<nome>:rating:<exerciseId>       — número 1-5, autoavaliação por EXERCÍCIO (tela "exercises")
u:<nome>:unit-rating:<unit>        — número 1-5, autoavaliação da UNIT inteira (tela de leitura,
                                      "Self-evaluation for this unit") — namespace separado de
                                      rating:, nunca usar o mesmo prefixo (contaminaria o
                                      cálculo de "Your Score", que é só a média por exercício)

# American English A1
u:<nome>:american1-visitedUnits    — array de "<unit>|<section>"
u:<nome>:american1-rating:<id>     — número 1-5
u:<nome>:notes:american1:<unit>    — string

# Grammar English A1
u:<nome>:grammarElem-visitedUnits  — array de unit numbers
u:<nome>:grammarElem-rating:<id>   — número 1-5

# American Accent
u:<nome>:americanAccent-visitedPages — array de NÚMEROS DE PÁGINA do PDF (não units — esse
                                      curso não tem unit, ver "Cursos & Recursos" item 4)
u:<nome>:americanAccent-rating:<screenId> — número 1-5, autoavaliação por TELA (screen.id, ex.
                                      "page-123"), não por página solta
u:<nome>:notes:americanAccent:<screenId> — string, notas da tela

# Revisão espaçada / My Words (compartilhado entre os 4 cursos)
u:<nome>:review:<curso>:<id>       — JSON {rating, ratedAt, due}
u:<nome>:wordbook                  — array JSON de palavras + flashcards ({id, word, meaning,
                                      example, context, image, createdAt, step, due,
                                      lastGrade, lastGradedAt, lastIntervalDays}).
                                      `due` NUMÉRICO é o que define "vencida" (isWordDue) —
                                      palavra nova nasce com o início do dia SEGUINTE, nunca
                                      mais com Date.now(). `lastIntervalDays` fica gravado, não
                                      recalculado do grau: se a tabela de intervalos mudar, o
                                      histórico continua contando a verdade da época. `step`
                                      só sobrevive por compatibilidade, não agenda mais nada.
                                      TODA gravação passa por persistWordbook, que recebe uma
                                      FUNÇÃO (lista atual) => lista nova e relê a base do
                                      localStorage antes de aplicar — nunca passar um array
                                      montado a partir do state `wordbookEntries` do render
                                      (era o que fazia edição de palavra sumir no reload, ver
                                      "Quirks & Gotchas")

# Grammar & Vocabulary Exercises (tela própria, ver seção acima)
u:<nome>:grammarVocabAnswers:<sourceId> — JSON com as respostas dadas, uma chave por seção
                                      ("grammar"/"vocabulary"/"similar"). A posição atual mora
                                      em sessionStorage ("grammarVocabExercisesPosition"), SEM
                                      namespace de usuário e de propósito fora do localStorage

# Listening / Dictation (por track, namespaces separados um do outro)
u:<nome>:listening:<trackId>:stats — JSON {attempts, lastScorePercent, lastAttemptAt}
u:<nome>:dictation:<trackId>:stats — JSON {attempts, lastScorePercent, lastAttemptAt}

# Última posição
u:<nome>:lastVisited               — JSON por curso, alimenta "Continue where you left off"

# Trilha de estudo / Today's Goal (Home)
u:<nome>:dailyGoal:<YYYY-MM-DD>    — JSON {newUnit, listening, reviews} (bool), data LOCAL —
                                      chave nova a cada dia, nunca desmarcado dentro do mesmo
                                      dia; "reviews" só vira true reavaliando algo que já
                                      estava vencido (nunca por reviewQueue estar vazia)
u:<nome>:dailyGoalPrefs            — JSON {newUnit, reviews, listening} (bool) — quais
                                      componentes contam pra meta, independente do progresso
```

**Nomes especiais (sem o prefixo `u:<nome>:`):**
- `users` — array de todos os nomes cadastrados
- `activeUser` — nome ativo agora

### Migração Legada (primeira vez)

Primeiro cadastro neste navegador herda automaticamente progresso solto (sem namespace). Cadastros seguintes não. Reset completo via "Reset all data on this browser" (link discreto na tela de registro), ou backup/restore (JSON export/import) na tela My Profile.

### Backup automático em pasta local (File System Access API — só Chrome/Edge)

Além do export/import manual (JSON, sempre disponível), My Profile → Backup & Restore tem
"Link a backup folder": escolhe uma pasta local UMA vez (`window.showDirectoryPicker`), e o
app salva um backup ali sozinho a cada 10 min enquanto estiver linkado, além de poder
restaurar de lá. Decisão do dono depois de descartar e-mail/login com o Google (exigiria
OAuth + credenciais de API, infraestrutura estranha a um app 100% local/sem backend) — pasta
local resolve o mesmo problema (progresso preso ao cache de um navegador só) sem depender de
internet nem conta nenhuma.
- **Handle da pasta vive num IndexedDB próprio** (`lets-learn-english-fs`), não no
  `localStorage` (não aceita objetos, só string) — sobrevive a fechar/reabrir o navegador;
  `queryPermission` (sem gesto do usuário) checa se ainda vale ao carregar a página,
  `requestPermission` (precisa de gesto, ver "Reconnect folder") reconfirma quando não vale
  mais.
- **Uma pasta só pro navegador inteiro, não por usuário do app** — é uma permissão da ORIGEM,
  não teria como ser por nome cadastrado. Dentro da pasta, um arquivo por usuário
  (`backupFileNameFor`), pra não colidir se houver mais de um nome cadastrado.
- `buildBackupPayload`/`applyBackupJson` são compartilhados entre o export/import manual (já
  existia) e o novo fluxo de pasta — nunca duplicar essa lógica se mexer em qualquer um dos
  dois.
- Sem suporte no navegador (Firefox, Safari): a seção mostra só uma frase avisando e cai pro
  export/import manual, que continua funcionando igual em qualquer navegador.
- **Também oferecido proativamente logo após um cadastro NOVO de verdade** (`activePage ===
  'backup-setup'`, entre "register" e "courses" em `handleRegisterSubmit`) — só nesse momento,
  nunca ao "continuar como" um nome já existente, e só se ainda não houver pasta linkada (é por
  navegador, não por usuário, ver acima — 2º nome cadastrado no mesmo navegador não precisa ser
  perguntado de novo). Motivo: o dono testou o botão dentro de My Profile e relatou "a pasta
  está vazia" — só ao perguntar percebeu que nunca tinha clicado nele, porque nada avisava que
  a feature existia. `showDirectoryPicker()` exige gesto do usuário, então não dá pra abrir o
  diálogo sozinho ao carregar a página — a tela pede autorização explícita (2 botões: escolher
  pasta ou pular) antes de disparar o diálogo nativo do SO.

### Repetição espaçada do My Words (reescrita em 2026-08-08)

O motor já existia, mas três coisas o mascaravam: palavra nova nascia vencida (`due:
Date.now()`), não havia teto de sessão, e nada mostrava o que o usuário tinha respondido — daí
a percepção, relatada pelo dono, de que "a revisão mostra todos os cards". A sessão **sempre**
filtrou por vencidas; o que faltava era entrada controlada, teto e visibilidade.

- **Intervalos FIXOS por grau** (`FLASHCARD_GRADE_DAYS`): `again: 1`, `good: 3`, `easy: 7`,
  `known: 30`. Substituiu a escada progressiva (`FLASHCARD_STEPS_DAYS = [1,3,7,14,30,60]`, onde
  "Good" subia um degrau e "Easy" dois, então o mesmo botão dava intervalos diferentes conforme
  o `step`). Escolha do dono: o número escrito no botão é o que acontece.
  **Consequência aceita conscientemente:** sem progressão, o intervalo máximo é 30 dias — o
  volume diário estabiliza em vez de diminuir com o tempo. O 4º grau "Known" existe justamente
  pra isso: sem ele, palavra dominada nunca se afastaria. Quem gradua a palavra é o usuário,
  declarando, não o algoritmo inferindo pelo histórico.
- **Palavra nova não nasce vencida** — `due` = início do dia LOCAL seguinte
  (`startOfNextLocalDay`, nunca `toISOString`). "As adicionadas no dia não entram na lista"
  (pedido do dono). Era a causa principal do "mostra tudo": adicionar 20 palavras jogava as 20
  na sessão do mesmo dia.
- **`isWordDue(entry, at)`** é o único critério de "vencida": `due` NUMÉRICO e `<= agora`. O
  `(entry.due ?? 0) <= agora` de antes tratava entrada SEM `due` como eternamente vencida (todo
  valor é > 0), grudando na fila qualquer dado antigo/importado; agora ela só espera a virada
  do dia. Usar esse helper — não repetir a comparação à mão.
- **Ordem da sessão**: vencida há mais tempo primeiro, e as de `lastGrade === 'again'` no
  **FIM** (pedido do dono — chegar nas difíceis depois de aquecer, não travar nelas na
  abertura). Cortada em `WORDBOOK_DAILY_REVIEW_CAP` (25).
- **"Again" recicla o card pro fim da fila da sessão atual** (`gradeCard`), além de reagendar
  pra 1 dia. A sessão só termina quando toda palavra foi respondida sem "Again" — é isso que
  torna "terminou a sessão" prova de revisão, e por isso a meta diária se apoia nesse evento
  (ver "Trilha de estudo"). Não vale no "view larger" de um card só (`isSingleView`), que não é
  sessão. O contador mostra palavras DISTINTAS (`new Set(practiceIds).size`) + um sufixo
  "(+N to repeat)": `practiceIds` cresce com a reciclagem, e um "of N" mudando sozinho no meio
  da sessão pareceria erro.
- **Rastro da última avaliação** (`lastGrade`/`lastGradedAt`/`lastIntervalDays`) exibido como
  pílula colorida na lista (`.wordbook-grade-pill--<grau>`), reaproveitando as 4 cores dos
  botões — a pílula é o eco do botão clicado. A linha meta do card **não mostra mais** o
  "review in N days" (`formatDue`, removida): o dono pediu pra tirar, o que interessa é o que
  ele respondeu, não a contagem regressiva. Palavra nunca avaliada não ganha pílula (sem
  migração de dado); se ela também não tiver `context`, a linha inteira não renderiza, pra não
  sobrar um `<p>` vazio.
- **Botão "Practice" promete `sessionQueue.length`, não `dueEntries.length`** — com o teto os
  dois divergem (40 vencidas → sessão de 25), e o hint ao lado avisa da diferença.
- **Arquivar palavra conhecida** (parar de revisar sem deletar) foi discutido e **adiado** pelo
  dono — reavaliar depois de usar o "Known · 30 dias". Deletar continua sendo a saída, com o
  custo de levar junto significado/exemplo/imagem/contexto e o cache de pronúncia.

### Pronúncia (🔊) no My Words (2026-07-24, trocado de Cambridge pra Google TTS em 2026-07-25)

Cada entrada (palavra OU expressão de várias palavras) na lista do My Words ganha um botão 🔊
(`WordAudioButton`, `App.js`) que toca a pronúncia em inglês daquele texto.
- **1ª versão (revertida)**: raspava o Cambridge Dictionary com Playwright (Chromium headless)
  — pronúncia de dicionário "de verdade" (gravação humana), mas ~5-6s por palavra nova (custo
  de abrir um navegador inteiro) e só cobria palavra única. Removida a pedido do dono
  (dependência pesada + lenta demais) — não reintroduzir sem pedido explícito.
- **Versão atual**: `src/pronunciationTts.js` chama direto o endpoint clássico (não-oficial,
  mesmo usado por baixo dos panos pela lib Python gTTS) do Google Translate TTS
  (`https://translate.google.com/translate_tts?ie=UTF-8&q=<texto>&tl=en&client=tw-ob`) — uma
  requisição HTTP simples, sem navegador, ~150-350ms por entrada nova (medido; ~15-20x mais
  rápido que a versão Cambridge) e funciona igual bem pra frase inteira. Trade-off aceito: voz
  sintetizada (TTS), não uma gravação humana real. Nenhuma dependência nova de servidor (só
  `https` nativo do Node) — a versão anterior tinha adicionado `playwright` a
  `devDependencies` e baixado o Chromium; ambos foram removidos (`npm uninstall playwright` +
  apagados os binários baixados especificamente pra essa feature) junto com a troca.
- **Cache em disco**: `pronunciation-cache/` (raiz de `meu-leitor-pdf/`, IRMÃ de `src/`, não
  dentro — se ficasse em `src/`, cada escrita em runtime disparava o watcher do webpack/CRA e
  recarregava a página sozinha). `index.json` (texto normalizado → nome do mp3 cacheado, nome
  = slug + hash curto do texto pra evitar colisão/truncamento em frases longas) + os próprios
  `.mp3`. Ignorado no git (`.gitignore`) — é cache local de áudio gerado, não dado de curso.
  Diferente da versão Cambridge, não existe mais um "missing" permanente em cache — qualquer
  texto válido gera algum áudio, então erro é sempre transitório (rede) e não fica cacheado.
- **Rota**: `GET /pronunciation-audio/:text` (`setupProxy.js`) — serve o mp3 cacheado
  diretamente (`res.sendFile`), gerando na hora se ainda não tiver cache. Só funciona sob
  `npm start`, mesma limitação de sempre (não há servidor de produção).
- **Auto-warm ao adicionar palavra**: `handleAddWord` dispara um `fetch` em segundo plano (sem
  `await`, erro ignorado) pra essa rota assim que a entrada é salva, pra o áudio já estar
  cacheado quando o usuário clicar no 🔊 — agora pra qualquer entrada, não só palavra única.
- **`scripts/preload-pronunciations.js`**: script standalone (Node puro, roda com `node
  scripts/preload-pronunciations.js caminho/backup.json`) pra aquecer o cache inteiro de uma
  vez, com 0.5s de delay entre chamadas. Recebe o JSON de **backup** (My Profile → Backup &
  Restore → Export), não uma lista direta — o My Words só existe no `localStorage` do
  navegador (sem backend/banco, ver Decisões Imutáveis), então o backup exportado é a única
  ponte que um script Node tem pra "a lista atual de palavras".
- Dedup de requisições concorrentes pro mesmo texto (`inFlight` Map em `pronunciationTts.js`)
  — evita duas chamadas em paralelo se o auto-warm do `handleAddWord` e um clique manual
  coincidirem.

---

## Dados Gerados (Índices)

Estes arquivos **não devem ser editados manualmente** (todos gerados por scripts Python já removidos do repo — ainda disponíveis no histórico do git se precisar reconstruir):
- `exercises_coords.json`, `answers_coords.json`, `audio_anchors_coords.json` — Vocabulary
- `vocabulary_target_words.json` — palavras em destaque/negrito por unit (1-100) do
  Vocabulary, extraídas via PyMuPDF dos `_L.pdf` de leitura; alimenta o toggle "Only Unit
  Words" do Listening (ver ROADMAP item 2) — regenerar rodando o extrator, nunca editar à mão
- `american1_index.json`, `american1_audio_anchors.json`, `american1_references.json`,
  `american1_reference_audio_anchors.json`, `american1_transcriptions_audio_anchors.json`,
  `american1_videos.json` — American English A1
- `grammar_elem_index.json`, `grammar_elem_appendix_index.json`, `grammar_elem_audio.json` —
  Grammar English A1
- `listening_vocabulary.json`, `listening_american1.json`, `listening_american_accent.json` —
  tracks de Listening/Dictation/Speaking (os 3 foram escritos/ajustados manualmente ao longo do
  tempo — o do American Accent especialmente, com bastante revisão manual pontual por track
  reportada pelo dono, ver PROJECT_SUMMARY — mas continuam sendo dados, não lógica; tratar como
  fonte de verdade, editar com cuidado)
- `dictation_pause_points.json` — pontos de auto-pause do Dictation (segundos, por trackId),
  gerados por detecção de silêncio (Python `soundfile`+`numpy`; parâmetros documentados no
  ROADMAP item 1 e no PROJECT_SUMMARY) — regenerar rodando o detector, nunca editar à mão
- `american_accent_index.json` — capítulos, "telas" de leitura (agrupamento de páginas) e mapa
  track→arquivo de áudio do American Accent. Gerado via PyMuPDF cruzando: TOC embutido do PDF
  (capítulos), posição Y do texto (não a ordem de leitura simples do PyMuPDF, que não é a
  ordem visual — ver PROJECT_SUMMARY pros bugs reais que isso causou) pra achar heading real vs.
  rodapé vs. selo de faixa na margem, e uma lista de exceções manuais por número de página
  (`FORCE_CONTINUE_PRINTED_PAGES`/`FORCE_FRESH_PRINTED_PAGES`/`EXCLUDED_PRINTED_PAGES`/
  `EXTRA_TRACKS_BY_PRINTED_PAGE` no gerador) pra casos que o heurístico não pega sozinho —
  regenerar do zero SEM essas exceções reintroduziria bugs já corrigidos por revisão visual do
  dono; se for regenerar, portar a lista de exceções do histórico do git primeiro

Se os PDFs/áudios de origem mudarem, os índices precisam ser regenerados.

---

## Decisões Imutáveis

### ✅ Design Decisions (por que é assim)

1. **Zero áudio/PDF de curso em `public/`** — servidos via `setupProxy.js` direto das pastas irmãs. Razão: (1) não duplicar arquivo gigante, (2) usuário não quer publicar esse material no GitHub.

2. **Sem hospedagem/deploy** — `setupProxy.js` só existe em `npm start`. `npm run build` compila normalmente (é usado como checagem de erros), mas o build resultante não seria funcional publicado num servidor real, porque não há servidor de produção com acesso às pastas irmãs de material. Razão: repositório é apenas para uso local com acesso direto aos arquivos de material.

3. **Praticamente tudo dentro de `App.js`** — sem fragmentação em arquivos de componente separados. Razão: simplicidade, sem fragmentação de estado, no estilo em que o projeto já cresceu. Uma exceção deliberada e fechada: `GrammarVocabExercises.js`/`.css` (volume de dados/UI — ver a seção dessa tela). Ela é o motivo do único named export de `App.js` (`userKey`); não tratar como precedente.

4. **Sem roteamento** — state machine com `activePage`. Razão: poucas telas, lógica simples.

5. **Cadastro só de nome** — sem senha, sem backend. Razão: separação de progresso no mesmo PC/navegador, não é segurança.

6. **Isolamento automático por porta** — pendrive em 3001, PC em 3000. Razão: localStorage é por origem, evitar mistura de usuários.

7. **Fundo desfocado/translúcido (`--page-hero-bg`) nas telas leves** (Courses, My Words, Listening, Dictation, My Profile, Dashboard) — reaproveita a imagem da Home. Qualquer "cartão"/retângulo de conteúdo dentro dessas telas precisa de fundo **opaco** (`#f2f3f6`/`#fbfcfd`, não `rgba(...)` translúcido), senão a imagem vaza através dele — bug já corrigido uma vez, não reintroduzir.

8. **Paleta de cores fechada, 4 cores** (definida pelo dono em 2026-08-07, substituiu o tema
   roxo+azul-marinho original): `#4c45de` índigo escuro (primária), `#6067f0` índigo claro
   (hover/ativo), `#232b3a` azul-marinho (texto e superfícies escuras), `#e2e3e7` cinza claro
   (superfícies/bordas). Declaradas no `:root` de `App.css` como `--brand-600`/`--brand-500`/
   `--navy-900`/`--gray-200` — **usar essas em código novo**. Os nomes `--purple-*` continuam
   existindo por serem usados em ~700 lugares, mas hoje guardam os índigos da paleta (não são
   mais roxo). Cor nova fora da paleta só com pedido explícito.
   **Exceções deliberadas** (não "esqueci de trocar"): verde/vermelho de acerto e erro
   (Dictation/Listening/exercícios) — cor É a informação ali; o amarelo do marca-texto do
   My Notes; o amarelo das pílulas de áudio **ancoradas nos PDFs** (`.audio-anchor`,
   `.american1-audio-anchor`, `.ap-btn`, `.audio-anchor-inline`, `.wide-player-label`), que o
   dono pediu explicitamente pra não mexer — por isso `.ap-btn.ap-btn-ab.is-armed/.is-looping`
   usam roxo LITERAL em vez de `var(--purple-700)`, senão virariam índigo junto com o resto.
   Os desenhos SVG da mascote Adele (pele, cabelo, olhos) também ficaram intactos — são
   ilustração de personagem, não cor de interface.

9. **Quicksand é a fonte do app INTEIRO** (2026-08-08). Antes ela era aplicada seletor a
   seletor em `App.css`, tela por tela (conforme o dono ia pedindo, desde 2026-08-06), e tudo
   que nunca ganhou regra própria — botões, a tela Progress, etc. — caía no sans-serif do
   sistema. Hoje o padrão vem do `body` em **`src/index.css`**; código novo não precisa
   declarar `font-family` nenhuma. Dois detalhes que não podem ser desfeitos:
   - `button, input, select, textarea { font-family: inherit }` (também em `index.css`): esses
     elementos **não herdam** fonte do pai por padrão do navegador — sem essa regra os botões
     voltam pro Segoe UI, que era exatamente o bug relatado.
   - **Todo peso usado em CSS precisa estar na URL do Google Fonts** em `public/index.html`
     (hoje `400;500;600;700`). Peso ausente faz o navegador sintetizar (faux bold/thin) em cima
     do mais próximo, borrando o traço arredondado que é a graça da fonte — é por isso que o
     peso 400 entrou junto com essa mudança, e por isso `.brand-mark` usa 700 e não 800.
   **Exceção deliberada:** o "i" dos botões de ajuda redondos (`.unit-badge-legend-toggle`,
   `.daily-goal-info-toggle`) continua em `Georgia` itálico — ali é um glifo de ícone, não texto
   de interface; o "i" serifado itálico é o que faz o ícone ser lido como "informação".

10. **Texto secundário tem cor e tamanho de token, nunca `rgba(35, 43, 58, α)` solto**
    (2026-08-08). Cada regra escrevia o próprio cinza com α entre 0.45 e 0.75; sobre as
    superfícies claras do app (`#fbfcfd`/`#f2f3f6`) isso dava ~3:1 a 4.4:1 de contraste — abaixo
    do mínimo legível (4.5:1) — e ainda em 11-13px, cada tela com um tamanho diferente. O dono
    reportou como "cinza quase não perceptível". Tokens no `:root` de `App.css`:
    - `--text-secondary` (`#4a5163`, ~7.7:1) — rótulos, hints, parágrafos de apoio. **É o
      padrão**: rótulo/hint novo usa este, sem declarar cinza próprio.
    - `--text-muted` (`#6b7385`, ~4.6:1) — só onde o apagado é INTENCIONAL e carrega
      significado: estado "off" do auto-pause do Dictation, campo desabilitado, `::placeholder`
      e botão de ícone em repouso (`.word-audio-btn`/`.wordbook-expand`/`.wordbook-delete`/
      `.my-notes-card-delete`/`.word-quickadd-close`, que ganham cor no hover). Continua
      visivelmente mais claro que o secundário — que era a razão de existir do tom claro — só
      deixou de ser ilegível.
    - `--text-secondary-size` (`13.5px`) — tamanho padrão desses rótulos. Aplicado onde o
      tamanho era menor; quem já era ≥ 13.5px ficou como estava. Única exceção de tamanho:
      `.unit-badge-legend-info-btn` segue em 12px, porque é um glifo dentro de um círculo de
      tamanho fixo e aumentar estouraria o controle.
    Vale também no `GrammarVocabExercises.css`, que importa os tokens do `App.css` via `:root`.

### ❌ Não Faça

- **Não exporte áudio/PDF de curso para GitHub** — eles continuam ignorados de propósito
- **Não tente hospedar/publicar o build** — a arquitetura de áudio/PDF não suporta (sem servidor); `npm run build` em si funciona bem e deve ser usado para verificar erros
- **Não edite os índices JSON à mão** (exceto os dois `listening_*.json`, que são dados editáveis com cuidado — ver acima)
- **Não fragmente `App.js` em componentes de arquivo separado** — é o padrão deste projeto (a tela Grammar & Vocabulary Exercises é a única exceção já concedida, e não abre precedente)
- **Não adicione rotas** — use o state machine existente (`activePage`)
- **Não misture o namespace do Listening com o do Dictation** (`listening:` vs `dictation:`) — são features irmãs, mas com estado/estatísticas isolados de propósito

---

## Testing & Verification

Não há testes unitários automatizados (`npm test` funciona mas CRA cria um esqueleto vazio).

1. **`npm run build`** — é a checagem padrão (sintaxe/JSX, imports quebrados, símbolo não usado
   depois de uma remoção). Rodar depois de qualquer mudança.
2. **Verificação visual é do DONO, na mão.** Instrução explícita dele em 2026-08-08: **não usar
   Playwright, screenshots ou qualquer teste de captura**, e não gastar tokens procurando o
   Playwright no cache do npx. Entregar a mudança com o build passando e **esperar o retorno
   dele**. Se uma dúvida só puder ser respondida olhando o app rodando, perguntar — não
   automatizar. (Rodadas anteriores do projeto usaram Playwright ad-hoc; ficou no histórico,
   mas não é mais o procedimento.)

---

## Quirks & Gotchas

### Dados (Vocabulary)
- Units 1 e 3: 2 primeiros exercícios estão em `_L` em vez de `_E` — app trata automaticamente
- Unit 1, página `_E`: 2 colunas, recorte pode incluir coluna vizinha (único caso)
- Units 21 e 27: só 4 exercícios no PDF (lista dizia 5) — PDF é fonte de verdade
- 3 áudios sem âncora: Units 1D, 3D, 72D (sem marcador correspondente ou resquício)

### American English A1
- CDs não coincidem com limites de unit (ex.: CD2 termina no meio da unit 5)
- Algumas faixas vivem só no apêndice (não escaneadas)
- Alguns selos com 2-3 faixas num ícone só — ancorados só na primeira

### Dados (American Accent) — bugs de extração já resolvidos, não reintroduzir
- **Ordem de leitura do PyMuPDF (`get_text()` simples) não é a ordem VISUAL da página** — texto
  de rodapé/selo de margem pode aparecer no meio do texto corrido dependendo da ordem interna
  do PDF. Qualquer heurística de "primeiro texto da página" tem que ordenar por posição Y de
  verdade (`get_text('dict')` + `bbox`), nunca confiar na ordem do `get_text()` puro
- O selo "Track N" fica na **margem** da página (esquerda OU direita, varia), na mesma altura
  do heading que ele narra — não agrupado no fim do bloco de conteúdo como a extração simples
  sugere. "Track" e o número às vezes não são vizinhos na lista ordenada por Y (um heading de
  fonte grande pode ter Y entre os dois) — casar por PROXIMIDADE Y entre "Track" e o dígito
  mais próximo, nunca por adjacência na lista
- Heading candidato a "início de tela nova" nunca pode ser: uma linha numerada (`"1. ..."`,
  sempre conteúdo, nunca título), nem uma linha só de símbolo fonético (`"/u/ /ʊ/"`, cabeçalho
  de coluna de par mínimo) — as duas causaram bugs reais silenciosos (heading errado E 1ª
  frase da lista sumindo, ex. tracks 52/100/129) antes de excluir os dois padrões
- Subtítulo "Common Spelling Patterns for /X/" sempre é continuação da página anterior mesmo
  quando mediria como heading (tamanho 16) — outros subtítulos (Word Pairs for Practice,
  Practice Sentences) não têm esse problema, não generalizar a exceção pra eles
- Nomes de arquivo variam: a maioria é "Practice Sentences"/"Sentence Pairs For Practice", mas
  3 faixas (100, 107, 255) usam a ordem invertida "Sentences for Practice"/"Sentences For
  Practice" — um regex que busca só "practice sentences" as perde silenciosamente
- Várias páginas têm conteúdo solto (nota explicativa, heading da PRÓXIMA seção, coluna de
  legenda "A B C") vazando pro fim do texto extraído de uma faixa — revisão manual por
  amostragem continua necessária mesmo depois dos fixes estruturais acima (ver
  PROJECT_SUMMARY pra lista completa de faixas corrigidas)
- 3 páginas realmente em branco (38, 88, 140) — excluídas da lista de telas, não geram merge
- Ordem das faixas dentro de cada tela: sempre ordenar numericamente (`tracks.sort()`) — a
  ordem de aparição no texto corrido não é a ordem numérica

### Estado vs. localStorage (bugs já resolvidos, não reintroduzir)
- **Gravação que reescreve uma coleção inteira nunca pode ser montada a partir do state do
  render.** O My Words guarda TODAS as palavras num único valor (`u:<nome>:wordbook`), então
  cada gravação reescreve o array completo. Enquanto os handlers faziam
  `persistWordbook(wordbookEntries.map(...))`, bastava um deles rodar com um snapshot defasado
  pra a gravação levar junto a versão VELHA das outras palavras — desfazendo uma edição
  anterior **sem erro nenhum**, já que a tela continuava mostrando o state novo até o próximo
  reload (sintoma relatado pelo dono em 2026-08-08: "editei essa palavra umas dez vezes e
  sempre volta o texto original ao reiniciar o servidor"). Hoje `persistWordbook` recebe uma
  FUNÇÃO `(lista atual) => lista nova` e relê a base do `localStorage` antes de aplicar (o
  `readStoredWordbook` ao lado existe pra isso). Mesma lição do `dailyGoal`
  "reviews": **o state pode ficar desatualizado por tempo indeterminado, o localStorage nunca.**
  Vale pro `wordbook` e valeria pra qualquer coleção futura guardada numa chave só.

### Layout/CSS (bugs já resolvidos, não reintroduzir)
- `min-height: calc(100vh - 72px)` na regra base `.landing-page` assume um header de 72px,
  mas o real (`.app-header`) tem 81px — qualquer tela nova baseada em `.landing-page` que
  pareça ter overflow/scroll indevido provavelmente precisa de um `min-height: 0` escopado,
  igual já feito em `.landing-page.vocabulary-mode.wordbook-mode`/`.dashboard-mode`
- **`.app-shell` tem `height: 100vh` fixo** — telas cujo conteúdo pode crescer além da
  viewport (grades de unit, busca com muitos resultados, cards empilhados na Home) precisam
  da classe `app-shell--allow-grow` (aplicada via JS em `App.js`, lista de `activePage`) +
  `align-items: flex-start` (nunca `center` herdado — centralizar conteúdo mais alto que a
  tela esconde a metade de cima atrás do header `sticky`) no seletor `.landing-page.<modo>`
  daquela tela, senão o conteúdo simplesmente é CORTADO sem gerar barra de rolagem nenhuma
  (nem a página nem nenhum container interno rola). A Home (`landing-page--home`) caiu nisso
  quando ganhou um 2º card (`DailyGoalCard`) — corrigido adicionando `'home'` à lista do
  `app-shell--allow-grow`
- Cartões/retângulos de conteúdo sobre o fundo desfocado (`--page-hero-bg`) precisam de
  background **opaco**, nunca `rgba(...)` translúcido — ver "Decisões Imutáveis" item 7
- **O próprio `.app-header` também precisa de background opaco** — era `rgba(24, 15, 43, 0.9)`
  (90%), inofensivo enquanto nada rolava por baixo dele; virou visível (a foto do hero da Home
  sangrando através da barra sticky) assim que a Home passou a rolar (`app-shell--allow-grow`,
  ver acima). Mesma regra do item acima, só que descoberta tarde porque o cenário que a expõe
  (conteúdo de alto contraste passando por baixo de um header sticky) é raro no resto do app
- `.landing-panel p { color: rgba(255,255,255,0.75) }` (herdado do tema roxo escuro original)
  vence por especificidade — textos novos dentro de um painel claro precisam de seletor mais
  específico + `color` explícito. **Mas cada painel (`profile-panel`, `dashboard-panel`,
  `listening-panel`...) tem sua PRÓPRIA variante dessa regra** (`.landing-panel.<painel> p`),
  então um texto que aparece em vários painéis (ex. `.course-level-heading`, usado em Courses/
  Listening/Dictation/Dashboard) precisaria vencer a especificidade de TODAS elas — bater uma
  só não basta. Nesse caso é mais simples usar um elemento que essas regras não alvejam
  (`<span>` em vez de `<p>`, com `display:block` se precisar ocupar a linha toda) do que entrar
  numa corrida de especificidade contra N seletores diferentes
- **Padrão das 9 telas de leitura (grid de 2 colunas)**: a barra de botões (`.pdf-toolbar`) e a
  linha de título (`.section-info`) devem ficar **dentro** da coluna esquerda (`.pdf-panel`/
  `.study-left`), nunca como irmãs full-width por fora do grid — senão o painel direito
  (`.side-panel.right-panel`/`.study-answers`) só começa a renderizar depois dessas barras,
  em vez de começar no topo, alinhado com a coluna esquerda (mesma linha do grid). A tela
  "exercises" do Vocabulary já caiu nesse erro uma vez (barras full-width, corrigido movendo
  pra dentro de `.study-left`) — qualquer tela nova nesse padrão deve seguir a estrutura de
  `.pdf-panel` (Grammar/American1), não replicar o erro.
- Containers flex com `gap` (`.study-left`, etc.) que ganham novos filhos com fundo branco
  (`.study-bar`/`.section-info`) podem revelar o fundo do ancestral (`--soft`, lavanda) como
  faixas finas entre eles — se dois blocos brancos devem ficar colados (só separados por
  `border-bottom`), o container pai não pode ter `gap` nenhum ali.
- **Painel de respostas ("Show Answers"/Teacher's Book) tem um padrão único, não reinvente
  por tela**: sempre `study-answers-resize-handle` (botão de arraste) + `.section-answers-strip
  .section-answers-strip--resizable` com `style={{height: answersPanelHeight}}`, SEM nenhuma
  barra de título própria dentro do strip — o toggle mostrar/esconder já existe em outro lugar
  da tela (botão "Show/Hide Answers"), então uma barra de título com "X" ali dentro é
  redundante E some o handle de redimensionamento. A tela `american1-reference` (Grammar/
  Vocabulary Bank) implementou esse painel do zero com uma barra de título própria em vez de
  copiar o padrão das units — corrigido copiando exatamente a estrutura de `american1-unit`.

---

## Comandos Úteis

```bash
# Rodar
cd meu-leitor-pdf && npm start

# Checar compilação/erros de sintaxe (não gera deploy nenhum, mas funciona e é usado sempre)
npm run build

# Testes (Create React App — esqueleto vazio, sem testes reais)
npm test

# Limpeza
rm -rf node_modules package-lock.json
npm install

# Aquecer o cache de pronúncia (🔊 do My Words) pra todas as palavras de um
# backup de uma vez (ver "Pronúncia no My Words" acima) — exporte o backup em
# My Profile -> Backup & Restore primeiro
node scripts/preload-pronunciations.js caminho/para/backup.json
```

---

## Links Importantes

- **`ROADMAP.md`** (raiz do repo) — próximas implementações aprovadas pelo dono, em ordem: auto-pause nos áudios, lacunas do Listening priorizando palavras-alvo da unit, trilha de estudo (sequência sugerida + meta diária + % de domínio), Speaking via reconhecimento de voz do navegador (contador de tempo de estudo + streak no Dashboard descartado pelo dono, não será implementado)
- **Histórico de detalhes**: Ver memórias no repo (`exercise-crop-feature`, `verify-app-runs-on-port-3000`, `american1-*`, `spaced-review-wordbook-listening`, `panel-toggle-feature`, `left-slide-menu-feature`, `backup-restore-feature`, etc.)
- **`PROJECT_SUMMARY.md`** (raiz do repo) — resumo narrativo mais extenso, com histórico de decisões de UX/dados
- **Git history**: Scripts geradores removidos ao longo do projeto (ainda disponíveis no histórico)
- **Material bruto**: Pastas irmãs (`.gitignore`'d), nunca vão pro repo

---

## Para Outra IA

- Tudo (ou quase tudo) está em `App.js` — comece lá, é grande (~10000 linhas) mas um arquivo só.
  A única tela fora dele é `GrammarVocabExercises.js` (+ `.css`), exceção fechada e justificada
- `setupProxy.js` é crítico (middleware de áudio/PDF, só funciona em `npm start`)
- Índices JSON (exceto `listening_*.json`) são **fonte de verdade gerada**, não edite à mão
- `localStorage` é o único storage; tudo namespaced por usuário via `userKey`
- Sem rotas, sem backend — tudo inline em `App.js` (fora a exceção do Grammar & Vocabulary
  Exercises acima)
- `npm run build` funciona e deve ser rodado depois de qualquer mudança — não presuma que
  "não há build de produção" significa que o comando não funciona
- Ao adicionar uma tela nova sobre o fundo claro (`vocabulary-mode`/`landing-page--courses`),
  releia a seção "Quirks & Gotchas" acima antes de escrever CSS — os bugs de `min-height` e
  fundo translúcido já foram descobertos e corrigidos várias vezes neste projeto
- Testes são verificados via Playwright ad-hoc, não automatizados/persistidos
