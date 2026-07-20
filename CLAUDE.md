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

`npm run build` **funciona e compila normalmente** — é usado o tempo todo durante o desenvolvimento pra verificar que uma mudança não quebrou nada (é o jeito padrão de "checar erros de sintaxe/JSX" nesse projeto, sem precisar do dev server rodando). O que **não existe** é hospedagem em produção: o build gerado não seria funcional publicado num servidor, porque `setupProxy.js` (áudio/PDF) só funciona sob `npm start` — ver "Decisões Imutáveis" abaixo.

---

## Arquitetura

### Estrutura Física

```
meu-leitor-pdf/
├── src/
│   ├── App.js (arquivo único, ~7000 linhas — tudo aqui: 3 cursos, Listening, Dictation,
│   │           My Words, Dashboard, Sound Bank, etc.)
│   ├── App.css (~3700 linhas, também um arquivo único)
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
- **Praticamente nenhum componente em arquivo separado** — funções/componentes adicionais moram todos dentro de `App.js` (ex.: `WordbookPage`, `ListeningClozeExercise`, `DictationExercise`, `ReviewCard`, `TodayPlanCard`)
- **LocalStorage única** — sem backend, sem servidor, sem contas de verdade
- **`npm run build` compila** (usado como verificação de sintaxe/regressão), mas **não há deploy/hospedagem** — ver acima

---

## Cursos & Recursos

**Nível de cada curso** (`courses[id].level`, `App.js`): American English A1 e Grammar
English A1 são "Beginner" (CEFR A1 de verdade); English Vocabulary B é "Intermediate" (a
pasta de origem do material se chama "Pre Intermediate and Intermediate" — nível acima dos
outros dois, apesar do "B" no nome não deixar isso óbvio). Avisado ao usuário (rótulo
"Beginner"/"Intermediate" padronizado, classe `.course-level-heading`) nas telas Courses,
Listening, Dictation e Progress Dashboard, sempre na ordem `COURSE_LEVEL_ORDER` (American1,
Grammar Elem, Vocabulary — não mais a ordem de implementação/alfabética antiga). Adicionar um
4º curso? Definir o `level` dele em `courses` e incluir o id em `COURSE_LEVEL_ORDER` já basta
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

### Listening (menu principal, fora dos 3 cursos)
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
  part". `Ctrl+Space` retoma. **Cruzamento checado via `requestAnimationFrame`, não
  `timeupdate`** — o navegador só dispara `timeupdate` a cada ~250ms, atraso suficiente pra
  `audio.pause()` vazar pro comecinho da fala seguinte em falas coladas (relatado pelo dono,
  casos reais do American1 com pouco silêncio entre personagens); rAF (~60x/s) reduz essa
  folga a poucos ms. Se ainda vazar em algum caso pontual, o próximo passo é recuar os pontos
  mais cedo em `dictation_pause_points.json` (via script, nunca à mão — ver "Dados Gerados")
- A recuperação do casamento LCS é por DP de SUFIXOS + caminhada pra frente (palavra casa
  com a ocorrência mais CEDO no texto) — a versão prefixos+trás casava palavra repetida com
  uma ocorrência lá do fim, deixando o verde longe do contexto digitado; não regredir
- **Rótulos de personagem (`A:`, `Jenny:`, `Teacher ...`) são removidos do texto usado pra
  corrigir** (`stripDictationSpeakerLabel`, `App.js`) — são convenção de transcrição, a voz
  do áudio não fala esse nome, então cobrar o aluno por não digitá-lo penalizava injustamente.
  Regra de dois-pontos é genérica; rótulos sem dois-pontos (só existem no American1, ex.
  "Rob Hi. My name's...") usam uma lista fechada de nomes conhecidos — não generalizar pra
  "qualquer palavra maiúscula no início", isso apagaria começos de frase legítimos como
  "JetBlue flight...". Não mexe no texto exibido pelo Listening (`ListeningClozeExercise`
  usa `track.sentences` direto, sem essa limpeza)
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
  visitadas (`findNextUnvisitedByCourse`, ordena por `courseId` cruzando os 3 cursos — não é
  mais sempre Vocabulary primeiro); "Practice listening" é uma faixa de Listening/Dictation de
  verdade nunca tentada em nenhum dos 2 modos (`findUnpracticedListeningTrack`, varre os 359
  tracks dos 2 cursos), não mais o 2º curso da lista de units
- **`DailyGoalCard`**: meta diária com 3 componentes togglináveis via "Customize goal" —
  aprender unit nova, zerar revisões do dia, praticar Listening/Dictation. Os 3 usam uma flag
  própria em `dailyGoalToday` (nenhum é `reviewQueue.length === 0` — isso dava um check de
  graça pra usuário novo sem nada agendado ainda, corrigido em 2026-07-20): "reviews" só marca
  dentro de `scheduleReview`, quando o item reavaliado JÁ estava vencido em `reviewQueue`
  (reavaliar conteúdo novo não conta); os outros 2 via `markDailyGoalDone` (visitar unit nunca
  visitada / terminar Listening ou Dictation, `onPracticed` prop em `ListeningClozeExercise`/
  `DictationExercise`). Progresso do dia em `dailyGoal:<YYYY-MM-DD>` (data LOCAL, nunca
  `toISOString`), nunca desmarcado — dia novo já nasce zerado porque a chave muda sozinha
- Cada item do `DailyGoalCard` tem um botão "i" (mesmo padrão do `UnitBadgeLegend`) explicando
  como cumprir aquele item — **um popover só, fora do `<ul>`**, não um por `<li>`: com os itens
  colados (6px de gap), um popover por linha cobria o botão "i" do vizinho de baixo e travava
  o clique nele (bug real, pego via Playwright). Texto de cada explicação em
  `DAILY_GOAL_EXPLANATIONS` tem que continuar batendo com a lógica real de quando cada
  componente marca — não é só rótulo solto
- `courseProgress` (status por unit dos 3 cursos) e `overallMasteryPercent` são computados uma
  vez no corpo de `App()`, compartilhados entre a Home e o Progress Dashboard — não duplicar
  esse cálculo se mexer em qualquer um dos dois. **Não chamar isso de "% do A1"** — só
  American1 e Grammar Elem são A1 de verdade, o Vocabulary (English Vocabulary B) é
  Pre-Intermediate/Intermediate e entra na mesma soma (rótulo já foi "A1 level" e corrigido
  pra "overall mastery" depois que o dono notou a inconsistência)

### Progress Dashboard ("Progress", menu principal)
- Tela só-leitura: cartões de estatística (palavras aprendidas/devidas, revisões pendentes,
  units dominadas nos 3 cursos + "% de domínio do A1" no mesmo tile, exercícios de
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

# Revisão espaçada / My Words (compartilhado entre os 3 cursos)
u:<nome>:review:<curso>:<id>       — JSON {rating, ratedAt, due}
u:<nome>:wordbook                  — array JSON de palavras + flashcards ({id, word, meaning,
                                      example, context, image, createdAt, step, due})

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
- `listening_vocabulary.json`, `listening_american1.json` — tracks de Listening/Dictation (esses
  dois foram escritos/ajustados manualmente ao longo do tempo, mas continuam sendo dados, não
  lógica — tratar como fonte de verdade dos tracks, editar com cuidado)
- `dictation_pause_points.json` — pontos de auto-pause do Dictation (segundos, por trackId),
  gerados por detecção de silêncio (Python `soundfile`+`numpy`; parâmetros documentados no
  ROADMAP item 1 e no PROJECT_SUMMARY) — regenerar rodando o detector, nunca editar à mão

Se os PDFs/áudios de origem mudarem, os índices precisam ser regenerados.

---

## Decisões Imutáveis

### ✅ Design Decisions (por que é assim)

1. **Zero áudio/PDF de curso em `public/`** — servidos via `setupProxy.js` direto das pastas irmãs. Razão: (1) não duplicar arquivo gigante, (2) usuário não quer publicar esse material no GitHub.

2. **Sem hospedagem/deploy** — `setupProxy.js` só existe em `npm start`. `npm run build` compila normalmente (é usado como checagem de erros), mas o build resultante não seria funcional publicado num servidor real, porque não há servidor de produção com acesso às pastas irmãs de material. Razão: repositório é apenas para uso local com acesso direto aos arquivos de material.

3. **Praticamente tudo dentro de `App.js`** — sem fragmentação em arquivos de componente separados. Razão: simplicidade, sem fragmentação de estado, no estilo em que o projeto já cresceu.

4. **Sem roteamento** — state machine com `activePage`. Razão: poucas telas, lógica simples.

5. **Cadastro só de nome** — sem senha, sem backend. Razão: separação de progresso no mesmo PC/navegador, não é segurança.

6. **Isolamento automático por porta** — pendrive em 3001, PC em 3000. Razão: localStorage é por origem, evitar mistura de usuários.

7. **Fundo desfocado/translúcido (`--page-hero-bg`) nas telas leves** (Courses, My Words, Listening, Dictation, My Profile, Dashboard) — reaproveita a imagem da Home. Qualquer "cartão"/retângulo de conteúdo dentro dessas telas precisa de fundo **opaco** (`#f3f5f7`/`#fbfcfd`, não `rgba(...)` translúcido), senão a imagem vaza através dele — bug já corrigido uma vez, não reintroduzir.

### ❌ Não Faça

- **Não exporte áudio/PDF de curso para GitHub** — eles continuam ignorados de propósito
- **Não tente hospedar/publicar o build** — a arquitetura de áudio/PDF não suporta (sem servidor); `npm run build` em si funciona bem e deve ser usado para verificar erros
- **Não edite os índices JSON à mão** (exceto os dois `listening_*.json`, que são dados editáveis com cuidado — ver acima)
- **Não fragmente `App.js` em componentes de arquivo separado** — é o padrão deste projeto
- **Não adicione rotas** — use o state machine existente (`activePage`)
- **Não misture o namespace do Listening com o do Dictation** (`listening:` vs `dictation:`) — são features irmãs, mas com estado/estatísticas isolados de propósito

---

## Testing & Verification

Não há testes unitários automatizados (`npm test` funciona mas CRA cria um esqueleto vazio). Verificação de features é feita via:
1. `npm run build` — pega erros de sintaxe/JSX
2. Playwright (scripts ad-hoc, não persistidos no repo — rodados a partir de um scratchpad de sessão) — navegação ponta-a-ponta, persistência em localStorage, ausência de overflow/scroll indevido na página, sem erros no console

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

- Tudo (ou quase tudo) está em `App.js` — comece lá, é grande (~7000 linhas) mas um arquivo só
- `setupProxy.js` é crítico (middleware de áudio/PDF, só funciona em `npm start`)
- Índices JSON (exceto `listening_*.json`) são **fonte de verdade gerada**, não edite à mão
- `localStorage` é o único storage; tudo namespaced por usuário via `userKey`
- Sem rotas, sem componentes em arquivo separado, sem backend — tudo inline em `App.js`
- `npm run build` funciona e deve ser rodado depois de qualquer mudança — não presuma que
  "não há build de produção" significa que o comando não funciona
- Ao adicionar uma tela nova sobre o fundo claro (`vocabulary-mode`/`landing-page--courses`),
  releia a seção "Quirks & Gotchas" acima antes de escrever CSS — os bugs de `min-height` e
  fundo translúcido já foram descobertos e corrigidos várias vezes neste projeto
- Testes são verificados via Playwright ad-hoc, não automatizados/persistidos
