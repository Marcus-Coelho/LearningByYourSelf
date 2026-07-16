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

### Dictation (menu principal, "Modo Ditado")
- Mesmíssimos `LISTENING_SOURCES`/tracks do Listening, mas **sem mostrar o texto antes** —
  o aluno ouve e digita tudo numa caixa só; comparação palavra-a-palavra via LCS, com
  destaque verde (certo)/vermelho (errado) e score em %
- Estado/handlers/estatísticas (`localStorage` sob `dictation:<trackId>:stats`) **totalmente
  separados** do Listening (`listening:<trackId>:stats`) — nunca alterar um mexendo no outro

### Progress Dashboard ("Progress", menu principal)
- Tela só-leitura: cartões de estatística (palavras aprendidas/devidas, revisões pendentes,
  units dominadas nos 3 cursos, exercícios de Listening/Dictation praticados) + progresso por
  curso (barra segmentada não-visitado/visitado/avaliado/dominado) + atalho "Continue where
  you left off". Não escreve nada — só lê dados que os outros recursos já persistem

---

## Dados & Persistência

### LocalStorage Namespacing

Todas as chaves por usuário: `u:<nome>:<chave-base>` (`userKey(name, base)`)

```
# Vocabulary
u:<nome>:visitedUnits              — array de unit numbers
u:<nome>:notes:<unit>              — string, notas da unit
u:<nome>:answers:<exerciseId>      — string, resposta do user
u:<nome>:rating:<exerciseId>       — número 1-5, autoavaliação

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
```

**Nomes especiais (sem o prefixo `u:<nome>:`):**
- `users` — array de todos os nomes cadastrados
- `activeUser` — nome ativo agora

### Migração Legada (primeira vez)

Primeiro cadastro neste navegador herda automaticamente progresso solto (sem namespace). Cadastros seguintes não. Reset completo via "Reset all data on this browser" (link discreto na tela de registro), ou backup/restore (JSON export/import) na tela My Profile.

---

## Dados Gerados (Índices)

Estes arquivos **não devem ser editados manualmente** (todos gerados por scripts Python já removidos do repo — ainda disponíveis no histórico do git se precisar reconstruir):
- `exercises_coords.json`, `answers_coords.json`, `audio_anchors_coords.json` — Vocabulary
- `american1_index.json`, `american1_audio_anchors.json`, `american1_references.json`,
  `american1_reference_audio_anchors.json`, `american1_transcriptions_audio_anchors.json`,
  `american1_videos.json` — American English A1
- `grammar_elem_index.json`, `grammar_elem_appendix_index.json`, `grammar_elem_audio.json` —
  Grammar English A1
- `listening_vocabulary.json`, `listening_american1.json` — tracks de Listening/Dictation (esses
  dois foram escritos/ajustados manualmente ao longo do tempo, mas continuam sendo dados, não
  lógica — tratar como fonte de verdade dos tracks, editar com cuidado)

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
- Cartões/retângulos de conteúdo sobre o fundo desfocado (`--page-hero-bg`) precisam de
  background **opaco**, nunca `rgba(...)` translúcido — ver "Decisões Imutáveis" item 7
- `.landing-panel p { color: rgba(255,255,255,0.75) }` (herdado do tema roxo escuro original)
  vence por especificidade — textos novos dentro de um painel claro precisam de seletor mais
  específico + `color` explícito

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
