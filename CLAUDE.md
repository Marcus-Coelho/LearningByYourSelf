# CLAUDE.md — Guia Operacional

## Quick Start

```bash
cd meu-leitor-pdf
npm install
npm start
```

Aplicação roda em `http://localhost:3000` (ou `3001` em pendrive, auto-detectado por `OpenWhenReady.ps1`).

**Requisitos:** Pastas irmãs devem existir na raiz:
- `Pre Intermediate and Intermediate/EVIU_P_I/` — PDFs e áudios (100 units)
- `American English Level 1/` — segundo curso (12 units + 5 CDs de áudio)

Essas pastas são ignoradas por git (`.gitignore`), não são commitadas.

---

## Arquitetura

### Estrutura Física

```
meu-leitor-pdf/
├── src/
│   ├── App.js (arquivo único, ~940 linhas — tudo aqui)
│   ├── setupProxy.js (middleware do dev server)
│   ├── exercises_coords.json (índice gerado)
│   ├── answers_coords.json (índice gerado)
│   ├── audio_anchors_coords.json (índice gerado — Vocabulary)
│   └── american1_audio_anchors.json (índice gerado — American English)
├── package.json
└── public/
    └── (nenhum áudio/PDF aqui — servidos via setupProxy.js)
```

### Padrão de Desenvolvimento

- **Nenhum roteamento** — tudo é estado local (`activePage`, `selectedUnit`)
- **Nenhum componente separado** — tudo em `App.js` (funções e inline JSX)
- **LocalStorage única** — sem backend, sem servidor
- **Dev-only** — `setupProxy.js` só funciona em `npm start`, não há build de produção

---

## Cursos & Recursos

### 1. Vocabulary (100 units)
- Leitura: PDF `_L` (leitura) com áudio ancorado na margem esquerda
- Exercícios: PDF `_E` (exercícios), recortado unit-por-unit
- Gabarito: PDF único multipágina (37 páginas), recortado junto
- Índices: `exercises_coords.json`, `answers_coords.json`, `audio_anchors_coords.json`

### 2. American English Level 1 (12 units, seções A/B/C/especial)
- Leitura: Seções de 2 páginas, merged em memória via `pdf-lib`
- Sem exercícios/gabarito nesta versão
- Áudio ancorado sobre selos impressos de CD/faixa (detecção por template OpenCV)
- Índice: `american1_audio_anchors.json` (5 CDs, ~250 faixas total, cobertura 55-75%)

### 3. Grammar Elementary
- Mencionado no código, estrutura não documentada

---

## Dados & Persistência

### LocalStorage Namespacing

Todas as chaves por usuário: `u:<nome>:<chave-base>`

```
u:<nome>:visitedUnits         — array de unit numbers
u:<nome>:notes:<unit>         — string, notas da unit
u:<nome>:answers:<exerciseId> — string, resposta do user
u:<nome>:rating:<exerciseId>  — número 1-5, autoavaliação
u:<nome>:review:<curso>:<id>  — JSON {rating, ratedAt, due}
u:<nome>:wordbook             — array JSON de palavras + flashcards
```

**Nomes especiais:**
- `users` — array de todos os nomes cadastrados
- `activeUser` — nome ativo agora

### Migração Legada (primeira vez)

Primeiro cadastro neste navegador herda automaticamente progresso solto (sem namespace). Cadastros seguintes não. Reset completo via "Reset all data on this browser" (link discreto na tela de registro).

---

## Dados Gerados (Índices)

Estes arquivos **não devem ser editados manualmente**:
- `exercises_coords.json` — gerado por `gerar_indice_exercicios.py` (removido)
- `answers_coords.json` — gerado por `gerar_indice_audio.py` (removido)
- `audio_anchors_coords.json` — gerado por `gerar_indice_audio.py` (removido)
- `american1_audio_anchors.json` — gerado por script Python com detecção de template (removido)
- `american1_index.json` — conversão manual do CSV do livro

Se os PDFs de origem mudarem, os índices precisam ser regenerados. Scripts estão no histórico do git.

---

## Decisões Imutáveis

### ✅ Design Decisions (por que é assim)

1. **Zero áudio em `public/`** — PDFs e áudios servidos via `setupProxy.js` direto das pastas irmãs. Razão: (1) não duplicar arquivo gigante, (2) usuário não quer publicar áudio no GitHub.

2. **Dev-only (sem produção)** — `setupProxy.js` só existe em `npm start`. Sem hospedagem. Razão: repositório é apenas para uso local com acesso direto aos arquivos de material.

3. **Arquivo único `App.js`** — sem componentes separados. Razão: simplicidade, sem fragmentação de estado.

4. **Sem roteamento** — state machine com `activePage`. Razão: poucas telas, lógica simples.

5. **Cadastro só de nome** — sem senha, sem backend. Razão: separação de progresso no mesmo PC/navegador, não é segurança.

6. **Isolamento automático por porta** — pendrive em 3001, PC em 3000. Razão: localStorage é por origem, evitar mistura de usuários.

### ❌ Não Faça

- **Não exporte áudio/PDF para GitHub** — eles continuam ignorados de propósito
- **Não crie build de produção** — a arquitetura não suporta (sem servidor)
- **Não edite os índices JSON à mão** — são gerados (ou reconstroem-se do git history)
- **Não fragmente `App.js` em componentes separados** — é padrão deste projeto
- **Não adicione rotas** — use o state machine existente

---

## Features Recentes (2026-07-07)

### Revisão Espaçada + My Words + Flashcards
- Agendamento automático por estrela (1★=1d, 5★=30d)
- "Today's Review" card (Home + Courses)
- Caderno pessoal com imagem opcional
- Flashcard com inversão se tem imagem
- Prática com 6 degraus de intervalo

### Controles de Áudio
- Voltar 5 segundos
- Loop A-B (3 estados: off → início → loop → off)
- Aplicado aos 3 players: Vocabulary (ancoragem), American1 (over-selo), Grammar (inline)

### Today's Plan (Home)
- "Learn something new" — próxima unidade não visitada (prioridade: Vocab → American1 → Grammar)
- "Practice listening" — próximo curso diferente
- Até 2 revisões pendentes + link "+N more"
- Cada um seta `activeCourseId` explicitamente (direto da Home)

---

## Testing & Verification

Testes não-automatizados verificados via Playwright (scripts no histórico ou em scratchpad):
- Compilação + gate de login
- Navegação entre units/courses
- Persistência de notas/respostas/ratings
- Áudio ancorado (posicionamento, zoom-sync)
- Revisão espaçada (agendamento correto por estrela)
- American1 PDF mesclado (2 páginas em 1 PDF)
- Flashcard (flip, intervalo, imagem)

**Não há testes unitários automatizados** (`npm test` funciona mas CRA cria um esqueleto vazio).

---

## Quirks & Gotchas

### Dados
- Units 1 e 3 (Vocabulary): 2 primeiros exercícios estão em `_L` em vez de `_E` — app trata automaticamente
- Unit 1, página `_E`: 2 colunas, recorte pode incluir coluna vizinha (único caso)
- Units 21 e 27 (Vocabulary): só 4 exercícios no PDF (lista dizia 5) — PDF é fonte de verdade
- 3 áudios sem âncora: Units 1D, 3D, 72D (sem marcador correspondente ou resquício)

### American English Level 1
- CDs não coincidem com limites de unit (CD2 termina no meio da unit 5)
- 5 faixas de CD2 vivem só no apêndice (não escaneadas)
- Alguns selos com 2-3 faixas (ex: "10, 11") — ancorados só na primeira por ora
- Página 22 (Unit 3B): selo duplo "10, 11" (faixa 11 requer suporte a múltiplos áudios, fora de escopo)

### CSS Herdado
- `.landing-panel p { color: rgba(255,255,255,0.75) }` vence por especificidade — filhos precisam de `color` explícito
- `.menu { flex: 0 0 auto }` — evita encolhimento com 3+ itens

---

## Estrutura de State

```js
// Global state
activePage          // "home", "register", "courses", "vocabulary", "unit", "exercises", 
                    // "american1", "american1-unit", "profile", "wordbook", "grammar-elementary", etc.
userName            // nome ativo agora
registeredUsers     // array de nomes cadastrados

// Cursos
selectedUnit        // número da unit (Vocabulary 1-100)
selectedAmerican1Unit // número (American1 1-12)
selectedAmerican1Section // seção ("A", "B", "C", especial)

// UI
selectedExercise    // exercício selecionado (ex: "3.1")
showAnswers         // boolean, mostra gabarito
pdfFileUrl          // URL do PDF carregado (auto-load por unit, ou override manual)
pdfZoom             // nível de zoom atual
rightPanelWidth     // largura redimensionável

// Áudio
audioLoading        // boolean, faixa carregando
isPlaying           // boolean, player tocando
speed               // 0.75, 1, 1.25, ..., 2
```

---

## Comandos Úteis

```bash
# Rodar
cd meu-leitor-pdf && npm start

# Build (não recomendado — sem servidor em produção)
npm run build

# Testes (Create React App)
npm test

# Limpeza
rm -rf node_modules package-lock.json
npm install
```

---

## Links Importantes

- **Histórico de detalhes**: Ver memórias no repo (`exercise-crop-feature`, `verify-app-runs-on-port-3000`, etc.)
- **Git history**: Scripts gerados removidos em 2026-07-04 (ainda disponíveis no histórico)
- **Material bruto**: Pastas irmãs (.gitignore'd), nunca vão pra repo

---

## Para Outra IA

- Tudo está em `App.js` — comece lá
- `setupProxy.js` é crítico (middleware)
- Índices JSON são **fonte de verdade**, não edite à mão
- `localStorage` é único storage
- Sem rotas, sem componentes separados, sem backend — tudo inline
- Testes foram verificados via Playwright, não automatizados
