# Projeto PDF e Áudio - Resumo

## Visão geral

Aplicação web para estudo de inglês ("Let's Learn English") que combina um leitor de PDF customizado com uma biblioteca de áudios organizada por unidades de vocabulário (livro Pre-Intermediate/Intermediate, 100 unidades). Os áudios de cada unidade tocam diretamente ancorados no PDF de leitura (player compacto sobre a margem, ao lado de cada letra de seção), não numa lista separada. Além da leitura, o app permite estudar exercício por exercício (recorte automático do PDF), com área de resposta e gabarito, ambos persistidos localmente.

## Estrutura do projeto

- `meu-leitor-pdf/`
  - Aplicação React (Create React App), todo o código-fonte em `src/App.js` (arquivo único, ~7000 linhas — cresceu bastante desde a v1 inicial de ~940 linhas —, sem componentes separados em arquivos próprios) + `src/App.css` (~3700 linhas, também um arquivo só). `npm run build` compila normalmente e é usado como checagem de erros ao longo do desenvolvimento — não há build de produção *hospedado*, mas o comando em si funciona (ver "Como usar" abaixo).
  - Dependências principais:
    - `react` ^19.2.7, `react-dom` ^19.2.7, `react-scripts` 5.0.1
    - `@react-pdf-viewer/core`, `@react-pdf-viewer/default-layout`, `@react-pdf-viewer/highlight` (leitor de PDF)
    - `react-resizable-panels` (não usado atualmente no layout — o redimensionamento dos painéis é feito manualmente com handlers de pointer, ver abaixo)
    - `pdf-lib` (só usado em `setupProxy.js`, lado servidor, para mesclar as 2 páginas de uma seção do curso American English Level 1 — ver seção própria abaixo)
    - `@testing-library/*` para testes
  - Scripts (`package.json`):
    - `npm start` / `npm run build` / `npm test`
  - `src/setupProxy.js`
    - Middleware do dev server (`react-scripts start`) que serve, diretamente de `../Pre Intermediate and Intermediate/EVIU_P_I` (mesma pasta, dois mount points), via `express.static` com `fallthrough: false` (responde 404 real em vez de cair no SPA history fallback do CRA):
      - `/audio/*` — usado pelos players de áudio.
      - `/materials/*` — usado pelo leitor de PDF.
      - `/answers-key.pdf` — rota dedicada (`res.sendFile`) que serve o gabarito único multipágina, um nível acima de `EVIU_P_I` (raiz de conteúdo).
      - `/american1-pages/section/:start/:end` — rota dedicada (assíncrona) que lê os dois PDFs de UMA página cada (`American English Level 1/pdfs/Secoes`) e os mescla em memória com `pdf-lib` num único PDF de 2 páginas, devolvido como `application/pdf`. Ver seção "American English Level 1" abaixo.
    - **Não copia nem duplica arquivo nenhum** — nem áudio nem PDF nunca existem dentro de `meu-leitor-pdf/public/`, portanto nunca vão para o git/GitHub.
    - Só funciona em desenvolvimento (`npm start`). Não existe suporte a `npm run build` + hospedagem, porque não há servidor em produção para expor esses arquivos (decisão consciente: o app é de uso local apenas).
    - Mudanças neste arquivo exigem reiniciar `npm start` (não é hot-reloadable).
  - `src/exercises_coords.json`, `src/answers_coords.json` e `src/audio_anchors_coords.json`
    - Índices já gerados e commitados, lidos pelo app em runtime (ver seções "Estudo por exercício" e "Áudio ancorado" abaixo). Os scripts geradores (`gerar_indice_exercicios.py`, `gerar_indice_audio.py`) foram removidos do repo em 2026-07-04 por serem utilitários de uso único; se os PDFs de origem mudarem no futuro, os índices precisarão ser regenerados manualmente (ou os scripts recriados) — os arquivos ainda existem no histórico do git.

- `Pre Intermediate and Intermediate/EVIU_P_I/`
  - Pasta de material bruto (PDFs e MP3s originais), **ignorada pelo git** (`.gitignore`: `Pre Intermediate and Intermediate/`).
  - É a **única fonte** de áudios e PDFs em tempo de execução (servida ao vivo pelo `setupProxy.js`), não existe mais nenhuma cópia em `public/`.
  - `Pre Intermediate and Intermediate/English_Vocabulary_Pre_Intermediate_Answers_Key.pdf`: gabarito único multipágina (37 páginas) com as respostas de todas as units, servido via `/answers-key.pdf`.
  - `Pre Intermediate and Intermediate/exercises list.txt`: lista de referência dos exercícios esperados por unit (era usada só para conferência cruzada pelo script gerador, já removido; o PDF é a fonte de verdade quando diverge — ver units 21/27 abaixo).

- `American English Level 1/` (raiz do repo, **ignorada pelo git**, mesmo padrão de `Pre Intermediate and Intermediate/`)
  - `American_English_File_Book1_Index_Ordenado.csv`: índice fonte (unit, seção A/B/C/-, título, grammar, vocabulary, pronunciation, páginas) — UTF-8 com BOM, lido corretamente com `encoding='utf-8-sig'`/similar (o conteúdo colado em chat pode aparecer com mojibake, mas o arquivo em si está correto).
  - `pdfs/Secoes/`: 96 PDFs de 1 página cada, `American English File Book 1 2nd edition Student Book-<N>.pdf`, `N` de 4 a 99 (renomeados em 2026-07-04 para corrigir um deslocamento de 1 página na extração original — ver `renomear_paginas.py`, também nessa pasta).
  - `pdfs/` (raiz) tem ainda `-1.pdf`/`-2.pdf`/`-3.pdf` soltos (capa/ficha catalográfica) e pastas de apêndice do livro (`Vocabulary_bank`, `grammar_bank`, `sound_bank`, `irregular_verbs`, `listening`, `writing`, `comunication`) — nenhuma dessas é usada pelo app ainda.

## Funcionalidade do app (`src/App.js`)

### Navegação
Estado `activePage` controla as "páginas" renderizadas condicionalmente (sem router). Lista completa atual (nomes de exibição foram renomeados desde a criação — ver "Atualizações 2026-07-09 a 2026-07-16" mais abaixo — mas os valores de `activePage` continuam com os nomes antigos internamente):
- **home** — landing page com imagem + texto motivacional. Acessível sem cadastro. Com usuário logado, mostra também o card "Today's Plan" e o link "Continue where you left off".
- **register** — cadastro/"login" só de nome. Gate de acesso: é para aqui que `handleCourses`/`handleOpenProfile`/etc. redirecionam se ainda não há usuário ativo.
- **courses** — lista dos 3 cursos disponíveis (rótulos atuais: "English Vocabulary B", "American English A1", "Grammar English A1") + busca unificada por palavra-chave cruzando os 3. Só alcançável com usuário cadastrado/ativo.
- **vocabulary** — grade das 100 units do curso Vocabulary, com badge de status por unit e busca.
- **unit** / **exercises** — tela de leitura / estudo por exercício do curso Vocabulary (layout de 2 painéis).
- **american1** / **american1-unit** / **american1-reference** / **american1-transcriptions** — grade de units, leitura por seção, e as duas telas de referência/transcrição do curso American English A1 (ver seções próprias abaixo).
- **grammarElem** / **grammarElem-unit** / **grammarElem-exercise** / **grammarElem-appendix** / **grammarElem-additional** — grade de units, leitura, exercícios, apêndices e "additional exercises" do curso Grammar English A1 (115 units — ver "Atualizações" abaixo, curso adicionado depois deste resumo original).
- **listening** / **listening-tracks** / **listening-exercise** — hub → lista de tracks → exercício de "fill in the blank" ouvindo áudio (fora dos 3 cursos, ver "Atualizações" abaixo).
- **dictation** / **dictation-tracks** / **dictation-exercise** — mesmo hub/tracks do Listening, mas o exercício é "ouça e digite tudo sem ver o texto" (ver "Atualizações" abaixo).
- **dashboard** — "Progress Dashboard", tela só-leitura com estatísticas gerais e progresso por curso (ver "Atualizações" abaixo).
- **profile** — "My Profile": nome do usuário ativo, score, exportar/importar backup e botões de reset.
- **wordbook** — "My Words": caderno de vocabulário pessoal + flashcards. Link no menu (gaveta lateral esquerda, ver "Atualizações"), com a mesma trava de cadastro de Courses/Profile.

### Tela de unidade (layout de 2 painéis redimensionáveis)
- Painel central: leitor de PDF (`PdfWorkspace`, envolvido por `UnitAudioReader` — ver "Áudio ancorado" abaixo). Ao entrar na Unit N, carrega automaticamente `/materials/unit_N/EVIU_PI-N_L.pdf` (o arquivo terminado em `_L`, confirmado presente nas 100 unidades). O usuário ainda pode trocar por um PDF local via upload (`URL.createObjectURL`) — o auto-load só é reaplicado ao trocar de unidade/reentrar na página. Toolbar customizada (zoom, navegação de página, busca, alternância texto/mão, fullscreen, download, print) e plugin de highlight por seleção de texto.
- Painel direito: seção "Relacionados" (atualmente placeholder estático).
- Painel direito é redimensionável por arraste (handlers de `pointerdown/pointermove/pointerup` com clamping de largura mínima/máxima), implementado manualmente em `App.js` — não usa a lib `react-resizable-panels` já instalada.
- **Não existe mais painel esquerdo.** Até 2026-07-03 havia uma coluna com a lista de áudios da unidade; foi removida quando os players passaram a ficar ancorados diretamente no PDF (ver abaixo).

### Áudio ancorado no PDF de leitura
Cada faixa de áudio da unidade toca a partir de um player compacto (play/pause, stop, velocidade 0.75x–2x) sobreposto ao próprio PDF `_L`, alinhado com a letra da seção correspondente (A, B, C...) — não existe mais lista de áudio separada.

- **Índice de coordenadas**: `audio_anchors_coords.json` mapeia cada unit a uma lista `[{letter, audio, page, x0, yTop, yBottom, pageWidth, pageHeight}]`, gerado (script removido, ver acima) a partir da camada de texto do `_L.pdf` (localiza os marcadores de letra pela fonte/tamanho/cor exatos do template do livro).
- **Posicionamento**: o player fica na **margem esquerda da página** (sempre vazia por design do livro), com a borda direita encostando perto da letra e centralizado na sua altura vertical — não fica embaixo da letra, porque a faixa colorida da letra é estreita demais para caber o player, e colocá-lo abaixo cobriria o título/corpo do texto da seção.
- **`UnitAudioReader`**: envolve o `PdfWorkspace` existente (não o recorta nem o substitui) e injeta, via `MutationObserver`/`ResizeObserver` + `ReactDOM.createPortal`, uma camada de overlay (`.audio-anchor-host`) como filho direto da página renderizada (`[data-testid="core__page-layer-N"]`, que já é `position: relative` no CSS do `@react-pdf-viewer/core`). Como o overlay é filho do próprio elemento da página, ele rola e reposiciona junto do zoom/scroll automaticamente — só recalcula a escala (`pageLayer.width / pageWidth`) via `ResizeObserver` quando o zoom muda.
- **`AudioAnchorPlayer`**: cada player é um `<audio>` real controlado por estado React (não o elemento `<audio controls>` nativo), com botões custom e menu de velocidade (fecha ao clicar fora ou ao escolher uma velocidade).
- Os players só aparecem quando `pdfFileUrl` é o PDF `_L` carregado automaticamente para a unit selecionada — se o usuário sobrescrever com upload manual de outro PDF, os players somem (não faria sentido ancorá-los num documento diferente).
- **Data quirks tratados automaticamente**: 3 arquivos de áudio (de 318 no total) não têm âncora visível na tela de leitura porque não há marcador de letra correspondente no `_L.pdf`:
  - Units 1 e 3: a letra `D` só existe no arquivo `_E` (mesmo padrão dos exercícios dessas units — ver abaixo), que não é carregado na tela de leitura.
  - Unit 72: existe um arquivo extra `U_072.D.mp3` sem nenhuma seção "D" no material (nem em `_L`, nem em `_E`) — resquício do pacote original de áudio, sem correspondência no livro.
  - Esses 3 arquivos continuam em disco normalmente, só não têm player ancorado.
- Prova de conceito original: commit `7548257` (2026-07-02), testada isoladamente fora do app (pasta de teste removida em 2026-07-04, já superada pela integração real).

### Estudo por exercício (`activePage === 'exercises'`)
Página separada (não substitui a tela de leitura da unit), acessada pelo botão "Exercises" na toolbar do PDF (só aparece se a unit tiver exercícios indexados). Mostra **um exercício por vez**, recortado do PDF original — sem gerar PDFs novos nem alterar o leitor.

- **Índice de coordenadas**: `exercises_coords.json` mapeia cada exercício (`"N.x"`) a `{unit, suffix (_E ou _L), page, top, bottom, pageWidth, pageHeight}`, gerado (script removido, ver acima) a partir da camada de texto dos PDFs.
- **`CroppedExerciseViewer`**: envolve o `PdfWorkspace` existente e, via `MutationObserver`/`ResizeObserver` + manipulação direta do DOM (`.rpv-core__inner-pages`), reduz a altura visível do scroller e ajusta `scrollTop` para mostrar só a faixa `[top, bottom]` do exercício, em `SpecialZoomLevel.PageWidth`. Reage a zoom e resize. Usada tanto para o exercício quanto para o gabarito.
- **Navegação**: abas com todos os exercícios da unit no topo (`exercise-tabs`) + botões "Previous"/"Next" na área de resposta; no último exercício da unit, um botão extra "Next Unit" leva à tela de leitura (`_L`) da próxima unit.
- **Área de resposta (`AnswerArea`)**: textarea por exercício, persistida em `localStorage` sob a chave do usuário ativo (`u:<nome>:answers:<id>`, ver "Cadastro de usuário e score" abaixo), com hide/show automático ao trocar de exercício.
- **Gabarito (`answers_coords.json` + `/answers-key.pdf`)**: botão "Show answers" (desabilitado se não houver resposta indexada) revela, num painel inferior, o recorte da página correspondente do gabarito único multipágina (37 páginas), servido por rota dedicada em `setupProxy.js`. Oculto por padrão e resetado ao trocar de exercício/unit.
- **Data quirks tratados automaticamente** (sem intervenção manual): units 1 e 3 têm os dois primeiros exercícios no arquivo `_L` em vez de `_E`; units 21 e 27 têm só 4 exercícios no PDF (a `exercises list.txt` afirma 5 — o PDF é a fonte de verdade); a página `_E` da unit 1 é de duas colunas, então o recorte horizontal pode incluir conteúdo da coluna vizinha (único caso afetado).
- Detalhes completos em memória: `exercise-crop-feature`.

### Cadastro de usuário e score (2026-07-04)
Cadastro **só de nome, sem senha** — trava de acesso aos cursos e base para um score isolado por pessoa no mesmo navegador (sem backend, tudo em `localStorage`).

- **Fluxo**: qualquer clique em "Courses" ou "My Profile" sem usuário ativo redireciona para `activePage === 'register'` (`handleCourses`/`handleOpenProfile`). Na tela de registro, o usuário digita um nome e envia (`handleRegisterSubmit`); se o nome já existe na lista de cadastrados (comparação case-insensitive), reaproveita o cadastro em vez de criar um duplicado — é assim que funciona um "login" sem senha. Ao ter sucesso, cai direto em `courses`.
- **Troca de usuário no mesmo navegador**: a tela de registro também lista botões "Continue as `<nome>`" para cada nome já cadastrado (sem precisar redigitar). O botão "Switch user" no Profile (`handleSwitchUser`) só limpa o usuário *ativo* — a lista de usuários e os dados de cada um continuam intactos — e volta para a tela de registro.
- **Armazenamento**: `localStorage['users']` = array JSON com todos os nomes já cadastrados neste navegador; `localStorage['activeUser']` = nome do usuário ativo agora (lido de forma síncrona no `useState` inicial do `App`, para não piscar a home/courses antes de saber se há alguém logado).
- **Namespacing por usuário**: toda chave de progresso passa por `userKey(nome, base) => \`u:${encodeURIComponent(nome)}:${base}\``. Isso cobre autoavaliação (`rating:<exerciseId>`), units visitadas (`visitedUnits`), notas da unit (`notes:<unit>`) e respostas de exercício (`answers:<exerciseId>`) — cada usuário cadastrado tem sua própria cópia isolada de cada uma dessas chaves. Os componentes `AnswerArea` e `UnitNotes` recebem `userName` via prop para montar a chave certa.
- **Score**: `overallScorePercent` (média das autoavaliações de 1–5 estrelas, em %) já existia antes desta feature, mas agora é automaticamente por usuário (o `useEffect` que carrega `exerciseRatings` depende de `[userName]` e recarrega ao trocar de usuário). Exibido tanto no `header-stats-card` (dentro de uma unit) quanto, por extenso, na página de perfil ("Your Score: X% (N exercises self-rated)").
- **Migração de dados legados**: como o app já existia antes do cadastro, o **primeiro** nome cadastrado neste navegador (`registeredUsers.length === 0` no momento do cadastro) herda automaticamente qualquer progresso "solto" que já estivesse salvo sem namespace (`migrateLegacyDataToUser` move `rating:*`, `notes:*`, `answers:*` e `visitedUnits` para as chaves `u:<nome>:...` e remove as antigas). Cadastros seguintes não passam por essa migração.
- **"Reset all data on this browser" (2026-07-07)**: link discreto (texto pequeno sublinhado, não um botão) na tela de registro, só visível quando `registeredUsers.length > 0` — aparece bem abaixo da lista "Continue as". `handleResetAllBrowserData` dá `window.confirm()` e, se aceito, `window.localStorage.clear()` (apaga literalmente tudo dessa origem, todos os usuários de uma vez, não só o ativo) + limpa `registeredUsers`/`registerNameInput`/`registerError` em memória. Motivação: se a lista "Continue as" mostra nomes que você não reconhece (ex.: duas cópias do app que acabaram compartilhando a mesma origem por engano — ver "Distribuição via pendrive + isolamento de porta" mais abaixo), apagar usuário por usuário via Profile → "Delete this user" seria tedioso; este link resolve tudo de uma vez, sem precisar logar em nenhum usuário primeiro. Diferente de `handleDeleteAccount` (Profile), que só apaga o usuário ativo e exige estar logado.
- Verificado via Playwright (mesmo método de `anchored-audio-player-feature`): fluxo completo registro → gate → unit → nota salva → exercício avaliado (score refletido no header e no perfil) → switch user → continue-as, sem erros no console. O link de reset foi verificado à parte (11 checks): ausente sem usuários, presente com 2 registrados, cancelar o `confirm()` não apaga nada, aceitar limpa `localStorage` inteiro e volta a tela ao estado "Your name" (sem "Continue as").

### American English Level 1 (2026-07-04)
Segundo curso "de verdade" da plataforma (substituiu o placeholder "Course 2"): leitura por seção + notas + áudio ancorado (parcial, ver abaixo). Sem exercícios/gabarito.

- **Fonte de dados**: `src/american1_index.json` é a leitura direta de `American_English_File_Book1_Index_Ordenado.csv` (ver acima), convertido para array plano `{unit, section, title, grammar, vocabulary, pronunciation, pageStart, pageEnd}`. `american1SectionsByUnit` (agrupado por `unit`, em `App.js`, mesmo padrão de `exercisesByUnit`) e `american1UnitNumbers` (lista ordenada de units, derivada dos dados — hoje só 1 a 12, mas cresce sozinha se o índice for atualizado com mais units) são computados uma vez no módulo. O campo `section` das seções especiais não é mais `"-"` — o CSV foi revisado para trazer o nome de referência (`"Practical English"`, `"Review and Check"`), lido e exibido como veio, sem tratamento especial no código.
- **Cada seção (A/B/C/especial) ocupa 2 páginas do livro**, mas o material bruto tem 1 PDF por página (ver "American English Level 1/" acima). Em vez de mostrar 2 leitores lado a lado, o front pede um único arquivo já mesclado à rota `/american1-pages/section/:pageStart/:pageEnd` (`setupProxy.js` + `pdf-lib`, mesclagem em memória a cada requisição, sem cache — aceitável para uso local com PDFs de 1 página). O resultado é um único `PdfWorkspace` com toolbar única e "1 / 2" navegável, como um spread contínuo.
- **Navegação**: grade de units (`american1`, visual idêntico à página `vocabulary`, com o título da seção "A" como resumo do tema de cada unit) → `american1-unit` mostra abas de seção (`exercise-tabs` reaproveitado, um botão por seção) + botões "Previous Unit"/"Next Unit", sempre montados e só desabilitados no primeiro/último unit (ver "Toolbar com posição fixa" abaixo) — troca de unit volta pra primeira seção. Trocar de seção dentro da mesma unit **não** reseta as notas (o painel de notas é `key={selectedAmerican1Unit}`, não por seção).
- **Toolbar com posição fixa (2026-07-04)**: os botões Previous/Next Unit inicialmente eram montados condicionalmente (somem no primeiro/último unit), o que deslocava todo o resto do toolbar (abas de seção) de lugar ao trocar de unit — mesmo problema apareceu com a aba da seção especial, cujo rótulo alterna entre `"Practical English"` (mais longo) e `"Review and Check"` (mais curto) a cada unit, mudando a largura total do grupo de abas. Resolvido com: botões sempre renderizados (só `disabled`, com estilo `.upload-button:disabled`) + `min-width` fixo (`.exercise-tab-wide`, 168px) na aba de seção especial, suficiente pro texto mais longo.
- **Faixa de metadados** (`.section-info`, acima do PDF): título da seção em negrito + grammar/vocabulary/pronunciation quando existirem (as seções especiais não têm esses campos no CSV, então a faixa mostra só o título).
- **Notas**: mesmo componente `UnitNotes` do curso Vocabulary, mas com `storageKeyBase` explícito (`notes:american1:<unit>`) para não colidir com as notas de `Unit <N>` do outro curso (que usam só `notes:<unit>`). `handleExportNotes` (página de perfil) já sabe distinguir as duas notações ao montar o `.txt` exportado.
- **Fora do escopo desta versão**: sem exercícios, sem gabarito, sem "Your Progress"/"Your Score" no header (esse card continua específico do curso Vocabulary — `selectedAmerican1Unit` é um state totalmente separado de `selectedUnit`, então não interfere no cálculo de progresso/score existente).
- Verificado via Playwright: Courses → American English Level 1 → grade de 12 units → Unit 1 seção A (PDF mesclado mostrando "1 / 2") → troca de seção B → nota salva → seção especial (sem tags de grammar/vocab, nota ainda visível) → Next Unit (nota da Unit 2 vazia, confirmando isolamento por unit) → Previous Unit (nota da Unit 1 de volta), sem erros no console.

#### Áudio ancorado (2026-07-04) — units 1–12 (fim do índice atual do livro)
Diferente do curso Vocabulary, os PDFs de `American English Level 1/pdfs/Secoes/` **não têm nenhuma camada de texto** (cada página é uma única imagem JPEG embutida, confirmado via `page.get_text()` vazio em várias páginas de amostra) — então não dá pra localizar nada por fonte/cor de texto. A solução foi por visão computacional:

- **O selo impresso de áudio não é um marcador fixo**: é um círculo com o **número do CD** + número da faixa + `)))` (ex.: `"1)2"` = CD1 faixa 2, `"2)3"` = CD2 faixa 3) — o "Class Audio" deste livro é dividido em vários CDs ao longo das units (confirmado CD1, CD2 e CD4 só amostrando 3 páginas do livro; provavelmente há mais). Cada CD tem seu próprio conjunto de arquivos com nomenclatura própria.
- **Hoje temos 5 CDs, cobrindo o índice inteiro do livro (units 1–12, páginas 4–99)**: `audio_files_1` (CD1, `SB1_cd01track<NN>.mp3`, 73 arquivos, faixas 02–74, cobre as **units 1–2**, páginas 4–19); `audio_files_2` (CD2, `<NN> Track <N>.mp3`, 62 arquivos, faixas 01–62, cobre as **units 3–4 inteiras (páginas 20–35) + unit 5 seção A (páginas 36–37)**); `audio_files_3` (CD3, `<NN> Track <N>.mp3`, 69 arquivos, faixas 01–69, cobre **unit 5 seção B até unit 7 Practical English (páginas 38–59)**); `audio_files_4` (CD4, `<NN> Track <N>.mp3`, 56 arquivos, faixas 01–56, cobre **unit 8 inteira até unit 9 Practical English (páginas 60–75)**); `audio_files_5` (CD5, `<NN> Track <N>.mp3`, 58 arquivos, faixas 01–58, cobre **unit 10 inteira até unit 12 Review and Check, páginas 76–99 — o fim do `american1_index.json` atual**, adicionado em 2026-07-04). Se o índice crescer (mais units no CSV), um CD6 poderá ser necessário; até lá não há mais conteúdo do livro para ancorar.
- **Descoberta importante (2026-07-04): os limites de CD não coincidem com limites de unit.** O usuário pediu para estender a cobertura de CD2 até a unit 5 (achando que ainda era CD2), mas a inspeção visual da página 38 (unit 5, seção B) mostrou o selo `"3)2"` — ou seja, **o CD3 já começa no meio da unit 5**, não na unit 6 como se presumia inicialmente. Confirmado também na página 39 (`"3)6"`). O usuário então esclareceu o intervalo real do CD3: unit 5 seção B até unit 7 Practical English (páginas 38–59). A faixa **58 do CD2 não aparece em nenhuma das páginas 36–37** (conferido visualmente, página inteira) — provavelmente vive só no apêndice (a página 36 referencia "p.158 Vocabulary Bank"), mesmo padrão de faixas "roubadas" pelo apêndice já visto no CD1/CD2.
- **Detecção (casamento de template, OpenCV)**: um template por CD é recortado manualmente de uma ocorrência conhecida do selo (só o círculo+dígito do número do CD, sem a faixa nem o `)))`, porque esses variam). `cv2.matchTemplate` (`TM_CCOEFF_NORMED`) roda página a página, restrito ao intervalo de páginas de cada CD, com threshold calibrado por CD (0.85 pro CD1; 0.75 pro CD2, depois de descobrir que 0.80 deixava passar faixas genuínas — abaixo de ~0.70 a taxa de falso positivo dispara) e non-max suppression (raio 25px em zoom 3x).
- **Atribuição de faixa por leitura visual manual, não por ordem sequencial** (correção de 2026-07-04): a primeira versão atribuía os números em sequência crescente a partir da primeira faixa de cada CD, na ordem de leitura das seções. Isso se mostrou **errado** — algumas faixas de cada CD também são usadas nas páginas de apêndice (Grammar Bank/Vocabulary Bank), que este índice não escaneia, então a contagem sequencial ficava pra trás do número real impresso assim que uma dessas páginas "roubava" uma faixa no meio do caminho. A correção: pra cada selo detectado, a região à direita do círculo (onde fica o número da faixa) foi **lida visualmente** (não por OCR — sem Tesseract instalado — nem por classificador de dígito automático) e conferida contra a página renderizada original quando havia dúvida. Os valores corretos ficam hardcoded como lista `(página, x, y, faixa)` no script gerador — **não há mais nenhuma inferência de número por ordem**, só posição + valor lido.
- **Falsos positivos e recall incompleto são o normal nesse processo, não exceção**: o template do CD2 às vezes casa com um selo do CD1 já confirmado na mesma página (falso positivo — descartado comparando o valor lido contra o CD1 já conhecido ali), com marca d'água decorativa de número de página gigante e semi-transparente (ex.: uma "21" enorme meio apagada no fundo da página 21 — coincidência com o próprio número da página), com o ícone preto de "VIDEO", ou simplesmente lixo (recorte em branco/sobre foto/texto de UI tipo "Search"/"Log-in" que aparece em telas de celular ilustradas). Por outro lado, vários selos genuínos **não batem nem em threshold 0.75** (ex.: a faixa 18 na página 24 nunca foi detectada, apesar de units vizinhas 17/19 na mesma página terem sido). Cada candidato final foi conferido individualmente lendo o recorte.
- **Cobertura atual**: **55 de 73 faixas do CD1**, **41 de 62 faixas do CD2** (units 3–4 completas, páginas 20–35, + unit 5 seção A, páginas 36–37), **54 de 69 faixas do CD3** (unit 5 seção B até unit 7 Practical English, páginas 38–59), **42 de 56 faixas do CD4** (unit 8 completa até unit 9 Practical English, páginas 60–75), e **45 de 58 faixas do CD5** (unit 10 completa até unit 12 Review and Check, páginas 76–99). As faixas 7, 12, 13, 18, 21, 29 e 36 (units 3–4, CD2) não batiam em nenhum threshold do template (0.75 incluso) porque o selo fica sobre fundo texturizado/colorido em vez de branco — foram localizadas manualmente com o usuário indicando a página de cada uma. As faixas do CD3, CD4 e CD5 foram todas encontradas por template matching normal (fundo branco em todas, sem casos de background problemático); as faixas que não aparecem nas páginas escaneadas de cada CD (CD3: 1, 4, 8, 9, 12, 21, 29, 30, 34, 36, 37, 44, 53, 59, 61; CD4: 1, 11, 12, 16, 21, 22, 27, 29, 30, 37, 43, 47; CD5: 1, 3, 5, 11, 19, 25, 26, 31, 37, 45, 52, 53, 58) seguem o mesmo padrão de "roubadas pelo apêndice" — confirmado visualmente, página por página, que todas as páginas sem nenhum candidato (CD3: pág. 50/56; CD4: pág. 64/68; CD5: pág. 82/84/86/96/98 — todas "Review and Check" ou leitura pura) realmente não têm selo de áudio nenhum, não é falha de detecção. O CD3 introduziu **duplicatas de detecção** (o mesmo selo casando 2x a poucos pixels de distância, mesmo valor lido — descartadas mantendo só a de maior score), padrão que se repetiu no CD4 e no CD5, além dos falsos positivos usuais (números de lista/exercício e respostas de quiz em caixas coloridas, legendas de foto, cabeçalhos de seção como "PART 5"). O CD4 teve o primeiro caso de **selo com três faixas num só ícone** ("6, 7, 8", página 61) — ancorado só na primeira faixa, mesmo tratamento do selo duplo "10, 11" do CD2. **O CD5 completa o livro**: seu intervalo de páginas (76-99) é exatamente o fim do `american1_index.json` atual (unit 12 é a última unit indexada) — não há mais conteúdo para ancorar a menos que o índice seja estendido.
- **Caso especial**: a página 22 (Unit 3B) tem um selo que mostra **dois números** ("10, 11" — um exercício com duas faixas de áudio seguidas). Por ora esse selo fica ancorado só na faixa 10 (a primeira); tocar a 11 exigiria suportar múltiplos áudios por âncora, fora do escopo desta passada.
- **Script gerador não fica no repositório** (mesma política dos scripts removidos em 2026-07-04, ver acima) — rodado a partir do scratchpad da sessão, escreve direto em `meu-leitor-pdf/src/american1_audio_anchors.json` (formato: `{ "<unit>": [{section, page (0 ou 1, relativo ao PDF mesclado da seção), x, y (em pontos), pageWidth, pageHeight, cd, track, audio (URL já pronta)}] }`). Se mais CDs forem adicionados no futuro (ou as 5 faixas de CD2 ainda faltando forem localizadas), o processo (detectar por template + **ler cada selo visualmente**, não inferir por ordem) precisa ser repetido manualmente — não é uma pipeline 100% automática.
- **Player (`American1AudioReader`/`American1AudioAnchorPlayer`)**: mesmo padrão de overlay do `UnitAudioReader` (portal + `MutationObserver`/`ResizeObserver` no `[data-testid="core__page-layer-N"]`), mas generalizado pra observar **as duas páginas** do PDF mesclado (não só uma), já que os anchors de uma seção podem cair em qualquer uma delas. Visual igual ao player do curso Vocabulary (pílula amarela com play/pause, stop e menu de velocidade — reaproveita `.ap-btn`/`.ap-wrap`/`.ap-menu`), só que menor (22px de altura), a 60% de opacidade (`.american1-audio-anchor`) e centralizado em cima do selo impresso via `left/top` + `transform: translate(-15px, -5px)` (ajuste fino pedido pelo usuário depois do posicionamento inicial), em vez de ancorado numa margem vazia.
- **Rotas de áudio**: `/american1-audio/cd1` a `/american1-audio/cd5` em `setupProxy.js`, cada uma servindo sua própria pasta (`audio_files_1` a `audio_files_5`) — sem cópia, mesmo padrão do `/audio` do curso Vocabulary.
- Verificado via Playwright (até a passada do CD2): Unit 2 seção A mostra as faixas 53, 54 (página 12) e 55, 56, 58, 59 (página 13) — batendo com os selos impressos; Unit 4 mostra as faixas 30, 33, 34 (seção A) e 38, 39, 40, 41, 44 (seção B); Unit 3 mostra as 7 faixas localizadas manualmente nas seções certas; Unit 5 seção A mostra exatamente as faixas 55, 56, 57, 59, 60, 61, 62. **A adição do CD3 (unit 5B–unit 7) não foi verificada via Playwright**, só validação de JSON/arquivos, a pedido do usuário. **A adição do CD4 (unit 8–unit 9) foi verificada via Playwright**: Unit 8 seções A/B/C/Review and Check mostram exatamente 2,3,4,5,6/13,14,19,15,17,20,18/25,26,23,24/28; Unit 9 seções A/B/C/Practical English mostram exatamente 32,33,31,34/35,36,38,39,40,41/45,46,42,44,48/49,52,50,51,55,53,56,54. **A adição do CD5 (unit 10–unit 12) também foi verificada via Playwright**: Unit 10 seções A/B/C/Review and Check mostram 2,4,6,7/10,8,9,12,13/14,15,16,17,18,20,21,22,23/24; Unit 11 seções A/B/C/Practical English mostram 30,27,28,29/32,33,34/35,36/39,38,40,42,41,43; Unit 12 seções A/B/C/Review and Check mostram 44,46,49,47,48,50/51,54,55/56/57 — todas batendo exatamente com o esperado, sem erros no console.

### Revisão espaçada, My Words e controles de listening (2026-07-07)

Três features didáticas adicionadas juntas (o resumo abaixo vale para os três cursos):

- **Revisão espaçada ("Today's Review")**: toda autoavaliação por estrelas (exercício do Vocabulary, unit do American 1, unit do Grammar Elementary) agenda uma revisão em `u:<nome>:review:<curso>:<id>` (JSON `{rating, ratedAt, due}`), com intervalo por nota: 1★=1 dia, 2★=2, 3★=3, 4★=7, 5★=30 (`REVIEW_INTERVALS_BY_RATING`). Os itens vencidos aparecem num card "Today's Review" na Home e na tela Courses (componente `ReviewCard`, some quando não há nada vencido; mostra no máx. 8 + contador), e clicar num item navega direto pra tela onde ele é estudado (`handleOpenReviewItem`). O item só sai da fila quando é **reavaliado** (qualquer nota — é a reavaliação que agenda a próxima repetição; o hint do card explica isso). Os resets de self-evaluation/Reset All do Profile também limpam as chaves `review:` do curso correspondente.
- **"My Words" (caderno de vocabulário + flashcards)**: página própria (`wordbook`), um array JSON por usuário (`u:<nome>:wordbook`) com `{id, word, meaning, example, context, createdAt, step, due}`. Três jeitos de alimentar: formulário da própria página, botão flutuante "+ Word" presente em toda tela de estudo (`WordQuickAdd`, canto inferior direito — o `onMouseDown` faz `preventDefault` pra **não desfazer a seleção de texto no PDF**, então selecionar uma palavra no leitor e clicar no botão já preenche o campo; só funciona nos PDFs com camada de texto, i.e. curso Vocabulary), e o contexto (curso + unit) é gravado automaticamente. Prática por flashcards (frente = palavra, verso = significado + exemplo) com Again/Good/Easy numa escada de intervalos `FLASHCARD_STEPS_DAYS = [1, 3, 7, 14, 30, 60]` (Again volta ao início, Good sobe 1 degrau, Easy sobe 2); palavra nova nasce vencida (due = agora). Palavras vencidas também aparecem no card "Today's Review" como atalho "Practice N words".
- **Controles de listening nos players de áudio**: os três players (ancorado do Vocabulary, inline do Grammar Elementary, sobre-selo do American 1) foram **desduplicados** num componente único `AudioPlayerControls` (o `<audio>` + a pílula de botões; cada player virou só um wrapper de posicionamento) e ganharam dois controles novos: **voltar 5 segundos** (`IconBack5`) e **loop A-B** (mesmo botão: 1º clique marca o início A, 2º marca o fim B e já volta pro A tocando em loop, 3º desliga; marcar B praticamente em cima do A desarma; "Stop" também limpa o loop). Estados visuais `.is-armed`/`.is-looping` no botão. Com 5 botões a pílula da margem do Vocabulary estourava a largura da margem esquerda — os botões desse player (e do inline) foram compactados pra 21px (`.audio-anchor .ap-btn`); o do American 1 mantém o override próprio (22×18).
- **Gotcha de CSS herdado**: `.landing-panel p { color: rgba(255,255,255,0.75) }` (era do fundo roxo escuro) vence por especificidade qualquer classe simples aplicada a um `<p>` novo dentro de um painel — os textos do flashcard/wordbook nasceram invisíveis (brancos no fundo claro) até as regras novas ganharem um seletor pai (`.flashcard .flashcard-word` etc.) e `color` explícito. Outro ajuste: `.menu { flex: 0 0 auto }` — com 3 itens de menu (My Words novo) o menu encolhia no header apertado e o último item quebrava pra segunda linha.
- Verificado via Playwright (21 checks): compilação, gate de registro, agendamento por estrela (3★ → due em 3 dias), card na Home/Courses com itens semeados vencidos, navegação do card pro exercício/unit certos, reavaliar remove da fila, adicionar palavra + flashcard (flip, Good → 3 dias), quick-add com contexto da unit, 5 botões no player, estados do A-B, pílula dentro da margem, console limpo.

### Imagem-mnemônica no "My Words" (2026-07-07)

Cada palavra pode opcionalmente ter uma imagem, pra reforçar a memória visual — pedido explícito do usuário depois de já ter usado a feature de revisão espaçada.

- **Captura em 3 formas**, todas no mesmo componente reutilizável `ImageDropZone` (usado tanto no formulário completo do `WordbookPage` quanto no `WordQuickAdd`, com uma variante `compact` pro painel flutuante estreito): clique abre o seletor de arquivo (`<input type="file" accept="image/*">` escondido), arrastar-e-soltar (`onDragOver`/`onDrop`), e colar (`onPaste`, lendo `event.clipboardData.items` — precisa de `tabIndex={0}` na div pra ela ser focável e receber o evento). As três formas convergem pro mesmo `processFile(file)`.
- **Redimensionamento client-side antes de salvar** (`resizeImageFileToDataUrl`, `App.js`): `FileReader` → `Image()` → `<canvas>`, maior lado limitado a 640px, exportado como JPEG a 72% de qualidade (`WORDBOOK_IMAGE_MAX_DIMENSION`/`WORDBOOK_IMAGE_QUALITY`) — sem isso, uma foto de celular teria vários MB e a cota do localStorage (tipicamente 5-10MB por origem) estouraria depois de poucas palavras. Testado: uma imagem de teste virou uma data URL de ~1.5KB.
- **`persistWordbook` agora alerta em caso de falha ao salvar** (antes só logava um comentário e desistia em silêncio) — com imagens o risco de estourar a cota é real, e perder uma imagem que o usuário acabou de colar seria surpreendente sem aviso nenhum.
- **Direção do flashcard inverte quando a palavra tem imagem** (pedido explícito do usuário, é o ponto central da feature): sem imagem, o card continua como antes (frente = palavra, verso = significado + exemplo — recall L2→L1). Com imagem, a frente mostra a **imagem e o significado juntos**, com a palavra escondida — o aluno precisa olhar a imagem, ler a tradução, e tentar lembrar da palavra em inglês antes de revelar ("Show word" em vez de "Show meaning"); o verso então mostra a palavra + exemplo. É a mesma escada de Again/Good/Easy dos dois lados, só a ordem de exibição muda.
- Lista de palavras (`WordbookPage`) mostra uma thumbnail 48×48 (`.wordbook-entry-thumb`) ao lado de cada palavra que tem imagem; sem imagem, nenhuma thumbnail (regressão testada).
- Verificado via Playwright (21 checks): upload real de arquivo (`setInputFiles`), drag&drop simulado via `DataTransfer` sintético + `dispatchEvent`, paste simulado via `ClipboardEvent` sintético (não é o mesmo canal que um Ctrl+V real do SO, mas exercita o mesmíssimo código do `handlePaste` — confirmado funcionando em teste isolado), thumbnail na lista, dropzone resetando após salvar, botão de remover antes de salvar, persistência como data URL JPEG em localStorage, e a inversão completa do flashcard (frente sem palavra, botão "Show word", verso revelando a palavra) comparada lado a lado com uma carta sem imagem no mesmo baralho de prática.

## Atualizações 2026-07-09 a 2026-07-16

Tudo adicionado depois do "Atualizações 2026-07-07" acima, no mesmo nível de detalhe do resto
deste documento. Fontes: memórias de sessão (`american1-*`, `panel-toggle-feature`,
`left-slide-menu-feature`, `backup-restore-feature`, `grammar-elem-unit-titles`,
`course-rename-and-grid-scroll-fix`, `tablet-responsive-fixes`, `unit-grid-badges-continue-feature`,
`reader-title-bar-feature`, `all-units-toolbar-link`, `soundbank-*`, `notes-panel-width-ratio`) e
o próprio código-fonte atual.

### Terceiro curso: Grammar English A1 (Grammar Elementary)
"Essential Grammar in Use, unit by unit — reading, exercises and audio": **115 units**
(`GRAMMAR_ELEM_UNIT_COUNT`), mais **7 Appendixes** (índice próprio,
`grammar_elem_appendix_index.json`) e **35 Additional Exercises**
(`GRAMMAR_ELEM_ADDITIONAL_COUNT`). Cada unit tem um par de PDFs de página única (leitura +
exercícios, mesmo padrão `_L`/`_E` do curso Vocabulary) e um punhado de áudios curtos
(`grammar_elem_audio.json`), tocados **inline ao lado da letra da seção** (não ancorado
sobre o PDF em overlay, diferente dos outros dois cursos — os PDFs desse curso não têm o
mesmo tipo de âncora visual/textual que os outros exploram).

- **Extração dos títulos (2026-07-11)**: até essa data o curso não tinha nenhum
  título/tópico em lugar nenhum (a grade só mostrava "Unit 1".."Unit 115", e a busca por
  palavra-chave só batia no número). Extraídos via PyMuPDF, **só do PDF `_L`** (o `_E` é
  só exercícios, nunca tem o título de verdade). Uma primeira tentativa por ordem de leitura
  do texto quebrou em ~6 units onde o PDF lista as letras de seção "A"/"B"/"C" **antes** do
  título na ordem interna do texto, mesmo elas aparecendo visualmente abaixo dele (artefato de
  como esse livro específico foi diagramado em colunas) — corrigido usando a **posição** (y)
  do primeiro span de texto exatamente `"A"` em fonte 21-25pt como corte: tudo acima disso
  (exceto o rótulo "Unit N") é o título. Duas units (110, 114) não têm nenhuma subseção A/B/C
  (prosa contínua) — o corte cai simplesmente abaixo do bloco de título (≥36pt) nesses casos.
  Um segundo gotcha: a unit 82 tem uma ilustração com um "?" gigante em fonte **91** (gráfico
  tipo diagrama de Venn de "both/either/neither") que uma heurística ingênua de "maior fonte da
  página" pegava por engano — o corte por posição evita isso de graça, já que o "?" gigante
  fica bem abaixo da letra "A".
  - **Gotcha de encoding (Windows)**: um passo de "reordenar chaves" via
    `cat file | python -c "... json.load(sys.stdin) ..."` corrompeu silenciosamente apóstrofos/
    reticências (`don't` → `donâ€™t`) porque `sys.stdin` do Python decodifica como cp1252 por
    padrão nesse setup, mesmo recebendo bytes UTF-8 por pipe — a corrupção era invisível no
    terminal Bash/git-bash (que também exibe mal esses bytes, então um `cat`/`print()` de
    conferência parecia igualmente "correto" nos dois casos) e só apareceu num screenshot
    Playwright da grade renderizada. Lição: nunca fazer um texto extraído passar por
    `sys.stdin` do Python via pipe nesse Windows — escrever direto do dicionário em memória com
    `open(path, "w", encoding="utf-8")`, e conferir conteúdo não-ASCII com a ferramenta `Read`
    (que lida com UTF-8 corretamente), nunca confiando em `cat`/`print` do terminal pra provar
    corretude OU corrupção.
  - Dados em `grammar_elem_index.json` (`{"1": "am/is/are", ...}`, títulos multi-linha do livro
    unidos com `" / "`), lidos via `getGrammarElemUnitTitle(unit)`. Os 7 apêndices seguiram o
    mesmo método (extraídos de `appendix <n> p1.pdf`, nunca p2), com uma armadilha própria: o
    rótulo "Appendix N" aparece **duplicado** na página (uma cópia "fantasma" mais fraca atrás
    da real, ambas ≥36pt) — precisou excluir explicitamente spans com texto exatamente
    `"Appendix N"` antes de escolher o bloco de título.
  - Títulos das units (não dos apêndices/additional, que ficaram fora de escopo dessa busca)
    entraram na busca por palavra-chave da grade — confirmado "phrasal verbs" → exatamente as
    units 114/115.

### American English A1 — recursos de referência adicionais
- **Reference links (2026-07-04)**: cada seção A/B/C (nunca Practical English/Review and
  Check) ganhou botões pequenos e coloridos por tipo, abrindo a(s) página(s) de apêndice que o
  livro referencia — Grammar Bank, Vocabulary Bank, Sound Bank, Communication, Writing.
  Fonte dos dados: `pages_others.txt` (raiz do projeto, verificado manualmente página a página),
  cruzado com `american1_index.json` e codificado em `american1_references.json`
  (`{unit, section, refs:[{type, pages:[...]}]}`).
  - **Regra de pareamento**: Grammar Bank e Sound Bank são sempre um par de 2 páginas
    consecutivas (mesclado em memória, igual às seções normais — número impresso é a primeira
    da dupla). Vocabulary Bank, Communication e Writing são sempre página única — quando
    Communication lista dois números (ex.: "A p.101 B p.106"), são **dois botões separados**,
    não um par pra mesclar (confirmado inspecionando o PDF: as duas páginas não são
    relacionadas entre si).
  - **PDFs fonte**: pastas irmãs (`grammar_bank/`, `Vocabulary_bank/`, `sound_bank/` — só
    páginas 166-167 no total, um spread único referenciado por muitas units —, `comunication/`
    com esse nome mesmo, sem o segundo "m", `writing/`), hoje sob
    `American English Level 1/pdfs and videos/StudentBook/` (ver reorganização de pastas
    abaixo). Duas delas foram renomeadas manualmente (2026-07-09): `Vocabulary_bank` para
    `p<page> <título>.pdf`, `grammar_bank` para `grammar bank L p<page>.pdf`/
    `grammar bank E p<page>.pdf` — `setupProxy.js` resolve cada convenção de nome
    (`naming: 'legacy'|'page-prefix'|'page-suffix'`) escaneando o diretório com regex em vez
    de montar o caminho direto, já que o resto do nome do arquivo não é derivável só do número
    da página.
  - **Notas isoladas por página de referência**, não por seção — `notes:american1-ref:<type>:<page>`
    (ex.: Grammar Bank p.130 tem uma nota só, compartilhada pelas 3 seções 4A/4B/4C que
    apontam pra ela), exigência explícita do usuário.
  - **"Show Answers" nas páginas de referência (2026-07-09)**: ganharam a mesma faixa de
    respostas do Teacher's Book que a tela de seção já tinha (reaproveita `ref.unit`/
    `ref.section` da própria seção que abriu a referência). Nessa mesma passada, tanto a faixa
    de respostas da seção quanto a da referência foram trocadas de um `<iframe>` cru pra um
    `PdfWorkspace` completo (zoom/navegação/busca próprios), com um novo prop `initialTool`
    (`'hand'` nas faixas de resposta, por pedido explícito — abre já pronto pra arrastar em vez
    de selecionar texto) — exigiu adicionar `@react-pdf-viewer/selection-mode` como dependência
    explícita do `package.json` (já vinha como transitiva do `default-layout`). `.section-answers-strip`
    aumentada de 25%→42% de altura nessa passada (depois reduzida pra 34%, ver "Painel toggle" abaixo).
- **Reference audio anchors (2026-07-04)**: as páginas de Grammar/Vocabulary Bank também
  ganharam áudio ancorado (`american1_reference_audio_anchors.json`, chave
  `` `${type}:${page}` `` já que páginas de referência são compartilhadas entre units, não
  pertencem a uma só). Reaproveita o mesmíssimo componente `American1AudioReader` das páginas
  de seção normal, só trocando o array de âncoras. **Lição de posicionamento** que valeu a pena
  registrar: as coordenadas iniciais foram estimadas "de olho" numa imagem estática — cerca de
  90% ficaram certas, mas 5 ficaram flutuando sobre o conteúdo errado (confirmado pelo usuário
  visualmente). O jeito confiável que resolveu de vez: abrir a página ao vivo via Playwright,
  pegar a `boundingBox()` real da camada de página pra calcular a escala, e medir a posição do
  selo com um screenshot **recortado bem justo** ao redor dele (não a página inteira) — ler o
  centro de um selo pequeno numa imagem grande é impreciso, num recorte apertado é confiável.
  Um segundo lote de erros reportados pelo usuário revelou uma falha diferente: páginas/selos
  **inteiramente pulados** na primeira passada (não só malposicionados) — uma página com zero
  âncoras, ou com só 2 de 3 selos capturados porque o terceiro estava numa subseção mais abaixo.
  Lição: ao povoar âncoras de uma página, não parar de procurar assim que "parecer" ter achado
  o esperado — contar os selos da página inteira de forma independente e comparar com o JSON.
- **Practical English (vídeos, 2026-07-05)**: cada "Practical English Episode N" ganhou uma
  pasta de vídeos `.mp4` (`American1_videos.json`, array de
  `{unit, section, folder, videos:[{label, file}]}`), servida por `setupProxy.js` via
  `express.static` num mount `/american1-video/<slug>` por episódio. Links renderizados como
  `<a target="_blank">` de verdade (não `window.open` via JS) — exigência explícita de abrir
  em nova aba, resolvida de forma mais robusta que JS puro (funciona com ctrl-click, botão
  direito, etc). Só o episódio 1 tinha vídeos na época; hoje (ver reorganização abaixo) os 6
  episódios estão populados.
- **Sound Bank standalone (2026-07-11)**: link no menu principal (fora de qualquer unit) que
  abre direto as páginas 166-167, reaproveitando inteiramente a tela `american1-reference`
  já existente — `handleOpenAmerican1SoundBank` chama o mesmo `setSelectedAmerican1Reference`
  mas **sem** `unit`/`section`; a ausência de `ref.unit` é o sinal que a tela usa pra trocar o
  botão "‹ Back to Unit X Y" por um rótulo estático "Sound Bank" (pedido explícito, com
  screenshot). Nenhuma rota/tela nova precisou ser criada.
  - **Bug real corrigido na mesma sessão**: a barra de carregamento roxa do
    `American1AudioReader` girava pra sempre em páginas **sem nenhuma âncora de áudio**
    (`pagesNeeded.length === 0`) — o efeito que populava `revealedPages` tinha um retorno
    antecipado nesse caso, então a barra (gateada só em `!anyPageRevealed`) nunca tinha chance
    de resolver. Corrigido gateando também em `pagesNeeded.length > 0`.
  - **Áudio de pronúncia de palavras (mesma sessão)**: Sound Bank ganhou 46 players de áudio
    (`Sound Bank Audio/<word>.mp3|wav`, nova rota `/american1-soundbank-audio`), posicionados
    exatamente sobre cada rótulo "au `<word>`" das 2 páginas — extraído via PyMuPDF localizando
    o token `"au"` e pegando o próximo token como a palavra, casado (case-insensitive) contra
    os arquivos reais em disco antes de criar a âncora (44 de 46 arquivos batem no padrão
    "au X"; `computer`/`leg` não aparecem nesse padrão nas 2 páginas mas têm áudio, então
    ganharam âncoras inseridas manualmente depois). Os dados vivem na mesma
    `american1_reference_audio_anchors.json`, chave `"sound:166"` — como a tela standalone e a
    versão dentro-de-unit resolvem pro mesmíssimo `ref`, implementar uma vez cobriu as duas
    entradas automaticamente. **Ferramenta temporária de arraste** (drag-to-position, com botão
    "Copy positions (JSON)" e persistência de rascunho em localStorage) foi construída, usada
    uma vez pelo usuário pra ajustar as 46 posições à mão, e **completamente removida** depois —
    se precisar recalibrar de novo, o padrão está descrito na memória `soundbank-audio-anchors`
    mas não deve ficar no código permanentemente. Um bug real de chave de render colidindo
    (`${anchor.cd}-${anchor.track}`, `track` reinicia por página) foi encontrado e corrigido
    durante esse processo (chave final: `${anchor.page}:${anchor.track}`).
- **Reorganização de pastas (2026-07-09)**: o usuário reorganizou `American English Level 1/`
  manualmente (não via script) para "melhor organização dos arquivos". Layout novo:
  `American English Level 1/pdfs and videos/`, dividido em `StudentBook/` (mesmas 8 subpastas
  de antes, um nível mais fundo) e `teacher_book/` (unidades de resposta, Practical English
  answer-keys, Grammar/Vocabulary Extra Activities, e mais pastas ainda não referenciadas por
  código nenhum: Communicative Extra Activities, Songs Activities, Workbook Answer Key, etc.).
  Dois novos irmãos de topo: `Practical Englihs videos/` (o typo "Englihs" é literal, existe
  em disco — agora com os 6 episódios completos) e `On the street videos/` (conteúdo novo,
  ainda **não vinculado** a nenhuma rota/UI do app). `audio_files_1` a `audio_files_5` (áudio
  de CD) ficaram no lugar, na raiz de `American English Level 1/`, intocados.
  `setupProxy.js` foi atualizado com constantes de raiz por sub-árvore
  (`american1StudentBookRoot`/`american1TeacherBookRoot`/etc.) e as rotas de vídeo passaram a
  carregar `{root, dir}` em vez de só um nome de pasta. **Essa árvore é editada à mão
  periodicamente pelo usuário — sempre reconferir com uma listagem ao vivo antes de confiar em
  caminhos antigos, inclusive os deste próprio resumo.**

### Listening (novo, fora dos 3 cursos)
Tela própria acessível pelo menu principal (`activePage: 'listening'` → `'listening-tracks'` →
`'listening-exercise'`): exercício de "fill in the blank" ouvindo áudio, reaproveitando os
mesmos tracks/áudio já usados nos cursos, agrupados em `LISTENING_SOURCES` (array de fontes,
hoje `listening_vocabulary.json` e `listening_american1.json`, cada uma com `{id, title,
description, tracks:[{id, unit, letter, title, audio, audioLabel, sentences, number}]}`).

- Cada track tem lacunas sorteadas **a cada visita** (palavras de conteúdo, não
  artigos/pronomes/etc., via uma lista de stopwords) — não é decorável de uma sessão pra outra.
- Atalho `Ctrl+Space` pausa/toca o áudio sem sair do campo de resposta (o Space sozinho
  continua digitando um espaço normal enquanto o foco está num input/textarea/button — só
  Ctrl+Space intercepta nesses casos; fora de campo de texto, Space sozinho já basta).
- Estatísticas por track em `u:<nome>:listening:<trackId>:stats` (`{attempts,
  lastScorePercent, lastAttemptAt}`), mostradas na lista "Choose an exercise" (com filtro
  "Hide 100% score" e busca por unit/número).
- Qualquer palavra respondida errado ao clicar "Check answers" é **automaticamente adicionada
  ao My Words** (com a frase de contexto completa), com uma mensagem de feedback temporária
  ("✓ Added N words to My Words", desaparece em 4s) — ponte direta entre "errou aqui" e "vira
  flashcard pra revisar depois", sem o aluno precisar copiar a palavra manualmente.

### Dictation ("Modo Ditado", 2026-07-16)
Segunda tela reaproveitando os mesmos `LISTENING_SOURCES`/tracks do Listening (hub → lista de
exercícios → exercício, mesmo padrão de 3 telas), mas o aluno **não vê o texto antes** — ouve
(mesmo player completo, com `Ctrl+Space` pra pausar/tocar) e digita tudo numa caixa de texto só.

- **"Check my answer"** compara o texto digitado com o texto correto (todas as `sentences` do
  track concatenadas) via **LCS** (maior subsequência comum) palavra-a-palavra — não
  comparação posição-a-posição, pra não penalizar a frase inteira só porque uma palavra foi
  pulada ou uma extra foi digitada no meio. Cada palavra esperada é destacada em **verde**
  (apareceu na ordem certa) ou **vermelho sublinhado** (errada/faltando), com o score final em
  %.
- **Estado, handlers e estatísticas totalmente separados do Listening**: `selectedDictationSource`/
  `selectedDictationTrack` (variáveis próprias, não reaproveitando as do Listening),
  `u:<nome>:dictation:<trackId>:stats` (namespace `dictation:`, nunca `listening:`) — implementado
  sem alterar uma linha do `ListeningClozeExercise` existente, só lendo os mesmos dados de
  tracks/áudio.
- Rótulos de exibição (`source.title`/`eyebrow`) trocam "Listening" por "Dictation" só na
  camada de apresentação (`.replace(/^Listening/, 'Dictation')`), sem tocar no JSON de origem
  (que continua dizendo "Listening from..." porque é dado compartilhado com a tela de
  Listening de verdade).

### Progress Dashboard ("Progress", 2026-07-16)
Tela só-leitura, acessível pelo menu principal: cartões de estatística (palavras aprendidas,
palavras devidas pra revisão, itens da revisão espaçada devidos, units dominadas somando os 3
cursos, exercícios de Listening/Dictation praticados — os 3 primeiros são atalhos clicáveis pra
My Words/Courses), uma faixa "Continue where you left off" (reaproveita
`mostRecentLastVisited`/`handleContinueLastVisited` já existentes), e uma seção de progresso
por curso — barra segmentada não-visitado/visitado/avaliado/dominado + legenda numérica +
botão "Continue" próprio do curso, para os 3 cursos.

- **Nada é reinventado**: a contagem por curso usa a mesma
  `getUnitBadgeStatus`/`getVocabularyUnitBadgeStatus` que as 3 grades de unit já usam (via um
  pequeno helper `tallyUnitStatuses`) — o dashboard nunca pode divergir do que as próprias
  grades mostram, porque não duplica a lógica de "o que conta como dominado", só reaproveita.
  O total de units do Vocabulary vem de `unitItems.length` (100), o mesmo valor que a própria
  grade de Vocabulary usa — não é um número hardcoded à parte.
  Os totais de Listening/Dictation vêm de `LISTENING_SOURCES.flatMap(s => s.tracks)` (359
  tracks) contra `loadListeningStats`/`loadDictationStats` já existentes.
- **Só leitura** — não escreve nada em `localStorage`, é inteiramente derivado do que as
  outras features já persistem.
- Reaproveita o mesmo tratamento visual/de layout de "My Words" (painel fixo + fundo desfocado
  `--page-hero-bg`, classe própria `dashboard-mode`), incluindo o mesmo bug de
  `min-height: calc(100vh - 72px)` (assume um cabeçalho de 72px; o real tem 81px) — corrigido
  com `min-height: 0` escopado só a essa tela, sem mexer em nenhuma outra.

### My Words — melhorias adicionais (além da revisão espaçada/flashcards originais)
- **Auto-add de palavras erradas do Listening**: ver seção "Listening" acima.
- **Click-to-add-meaning**: no verso do flashcard, o texto "(click to add meaning)" (quando
  ainda não há significado salvo) é clicável — abre um campo de edição inline (salva no
  blur/Enter, cancela no Escape) e, no mesmo clique, abre em **duas novas abas**
  `https://dictionary.cambridge.org/dictionary/english/<word>` e
  `https://youglish.com/pronounce/<word>/english/us` (pronúncia em vídeos reais) pra aquela
  palavra. Uma vez que a palavra já tem significado salvo, o texto vira estático (sem sublinhado
  tracejado, sem clique) — só o placeholder vazio é clicável.
  - **Bug real corrigido durante a implementação**: abrir a nova aba do dicionário no mesmo
    clique fazia a janela perder o foco no exato instante em que o input de edição estava
    sendo montado — isso disparava um evento de blur "espúrio" no campo (o navegador tira o
    foco do elemento ativo sempre que a janela inteira perde foco, não só quando o foco muda
    pra outro elemento da mesma página), e o `onBlur` salvava (vazio) e fechava a caixa antes do
    usuário digitar qualquer coisa. Corrigido checando `document.hasFocus()` dentro do handler
    de blur — se a janela toda perdeu o foco (caso da nova aba), o blur é ignorado e a caixa
    continua aberta; um `useEffect` com listener de `window.addEventListener('focus', ...)`
    foca o campo automaticamente quando o usuário volta pra essa aba.
- **Layout da tela**: o topo (título "My Words" + contador + "Practice Words" + formulário de
  adicionar palavra) fica numa posição fixa perto do cabeçalho (`position: sticky` não chegou a
  ser necessário de fato — ver abaixo), e **só a lista de palavras salvas** rola, dentro do
  próprio painel (não a página inteira) — uma única barra de rolagem vertical, visível por
  inteiro na tela. Mesmo tratamento depois replicado no Dashboard.
  - **Causa raiz real de uma sequência de "não mudou nada" reportada pelo usuário**: o painel
    tinha `max-height` calculada manualmente (`calc(100vh - Npx)`), que nunca batia exatamente
    com o espaço disponível de verdade (o header real tem 81px, não os 72px que uma regra base
    antiga assumia) — a diferença criava uma barra de rolagem externa indesejada que arrastava
    o "topo fixo" junto dela. A correção definitiva trocou o cálculo manual por
    `align-items: stretch` (o próprio flexbox calcula a altura disponível) + `min-height: 0`
    pra derrubar a suposição de 72px — sem isso, qualquer ajuste de `top`/posição não tinha
    efeito visual nenhum, porque a página nunca chegava a rolar de verdade (o "scroll" que
    parecia mover tudo era, na real, um contêiner diferente do que se imaginava).

### Navegação e UI geral
- **Left slide menu (2026-07-11)**: navegação trocada de menu inline/dropdown pra uma gaveta
  lateral deslizante (hambúrguer sempre visível em qualquer largura de tela, não só em telas
  estreitas — antes só aparecia em mobile), com `overlay`/backdrop escurecido que fecha ao
  clicar fora. Reaproveitou toda a máquina de estado abrir/fechar já existente (não precisou
  mudar), só trocou o CSS/marcação do painel em si. ~230 linhas de CSS legado do submenu antigo
  (grid de colunas, sublinhado animado, breakpoints desktop-inline) foram **completamente
  removidas** por estarem mortas (confirmado via grep que nenhuma classe era referenciada em
  `App.js`). "My Profile" foi depois dobrado pra dentro da mesma gaveta (era um link solto no
  header antes), e a lista de itens foi unificada — não existem mais duas versões diferentes
  do menu dentro/fora de um curso, é sempre a mesma lista.
- **Renomeação de cursos (2026-07-11)** — só o rótulo exibido; as pastas em disco continuam
  com os nomes antigos **de propósito** (o vínculo pasta↔rótulo nunca existiu de fato — a
  pasta do Vocabulary já se chamava algo diferente do próprio rótulo antigo, então renomear
  pastas cheias de PDFs/áudios seria risco sem benefício nenhum):
  - "Vocabulary - English Pre Intermediate" → **English Vocabulary B**
  - "American English Level 1" → **American English A1**
  - "Grammar English Elementary" → **Grammar English A1**
- **Bug de double-scrollbar + sticky header quebrado nas grades (mesma sessão)**: as grades de
  Vocabulary/American1 tinham duas barras de rolagem simultâneas ativas ao mesmo tempo (a
  página inteira E a lista de units, cada uma com seu próprio `overflow: auto`). A primeira
  tentativa de correção (trocar o `overflow` externo pra `hidden`) só escondia a segunda barra
  mas **cortava conteúdo de verdade** (o painel nunca tinha `box-sizing: border-box`, então seu
  `max-height` nunca contava o próprio padding). A correção real: reaproveitar o mesmo padrão
  que o Grammar Elementary já usava pra esse problema (deixar a altura do conteúdo vazar até o
  documento real, com o **navegador** sendo o único scroller) — isso expôs um segundo bug, o
  cabeçalho `position: sticky` parava de grudar no topo quando um ancestral tinha altura fixa
  (`height: 100vh` no `app-shell`) mas o conteúdo vazava por cima dela via `overflow: visible`;
  corrigido estendendo a classe `app-shell--allow-grow` (que o Grammar Elementary já usava)
  também pras grades de Vocabulary e American1.
- **Barra de título do leitor (2026-07-11)**: linha "curso · unit · conteúdo" no topo das 9
  telas de leitura (reaproveitando a classe `.section-info` já existente em vez de criar um
  componente novo), substituindo o texto "You are in the X Course" que morava no cabeçalho —
  esse texto do cabeçalho foi removido de vez (junto com `courses.<id>.headerLabel`, agora
  sem uso).
- **"All Units" no toolbar (2026-07-11)**: botão em todas as 9 telas de leitura, chamando
  diretamente as mesmas funções de navegação de grade que a tela Courses já usava
  (`handleVocabulary`/`handleAmerican1`/`handleGrammarElem`) — sem estado/rota novos.
  Explicitamente **não** aparece na tela de Sound Bank aberta fora de contexto de curso (essa
  tela é só consulta, não faz parte do fluxo de nenhum curso).
- **Badges de progresso + Continue + busca (2026-07-10/11)**: cada unit nas 3 grades ganhou um
  "dot" colorido de status (unvisited/visited/rated/mastered — Vocabulary usa uma regra
  própria já que sua autoavaliação é por exercício, não por unit inteira: só é "mastered" se
  **todos** os exercícios da unit tiverem nota 5, não uma média), mais um botão único "Continue
  where you left off" na Home (`lastVisited`, um ponteiro global pra tela inteira, não um por
  curso) e busca por palavra-chave cruzando título/gramática/vocabulário/pronúncia nas 3
  grades (usada também na busca unificada da tela Courses). Os títulos do Grammar Elementary
  (extraídos na mesma leva, ver seção do curso acima) entraram nessa busca no mesmo dia.
- **Painel de notas mais largo (2026-07-11)**: "My Notes" (painel direito, `rightWidth`,
  compartilhado pelas 9 telas de leitura) passou de um teto fixo de 650px pra uma proporção de
  ~21% da largura da janela (`RIGHT_PANEL_WIDTH_RATIO`), calculado no mount — o
  redimensionamento manual por arraste e o botão de esconder/mostrar continuam funcionando
  exatamente como antes, só o valor **inicial** mudou.
- **Toggle de esconder/mostrar o painel direito (2026-07-09)**: botão circular (`›`/`‹`)
  presente nas 8 telas com painel de notas/respostas (todas exceto `exercises`, que usa um
  elemento de resposta diferente), colapsando o grid de 3 colunas pra 1 e dando a largura
  inteira da janela ao leitor de PDF. O botão "+ Word" flutuante passou a seguir esse mesmo
  estado nessas 8 telas (escondido junto com o painel).
- **Ajustes responsivos (tablet, ~820px, 2026-07-11)**: dois bugs reais corrigidos (não
  cosméticos) — o cartão "Your Progress/Your Score" do cabeçalho sobrepunha a toolbar do PDF
  em ~49px nesse breakpoint (corrigido forçando ele pra sua própria linha via
  `flex-basis: 100%`), e o painel de notas ultrapassava a borda direita da viewport sem
  indicação visual nenhuma (corrigido calculando a largura inicial a partir de
  `window.innerWidth`, com um listener de resize que só encolhe, nunca desfaz um ajuste manual
  do usuário). **Celular (~390px) continua fora de escopo, por decisão explícita do usuário**
  — o grid de 2 painéis da tela de leitura sozinho já precisa de ~694px mínimos pra caber.
- **Backup/restore (2026-07-11)**: seção "Backup & Restore" em My Profile — export/import
  completo (JSON) do namespace de um usuário. **Dump genérico de toda chave `u:<nome>:*`**
  (não uma lista fixa de prefixos como o export de notas em `.txt` já existente) — qualquer
  feature nova que grave uma chave nova fica automaticamente incluída em backups futuros, sem
  precisar atualizar essa lógica. Import sempre escreve no namespace do usuário **ativo no
  momento** (não necessariamente o `userName` gravado no arquivo — o fluxo real de recuperação
  é "navegador perdido → recadastra o mesmo nome → importa"), e recarrega a página inteira
  depois (`window.location.reload()`) em vez de tentar ressincronizar manualmente os 15+
  efeitos de carregamento espalhados pelo app.
- **Fundo desfocado/translúcido (`--page-hero-bg`, 2026-07-16)**: reaproveita a mesma imagem
  `openCourse.png` da Home, borrada e semi-transparente, atrás de Courses, My Words, Listening,
  Dictation, My Profile e Dashboard (Home e as 3 grades de unit não usam esse fundo). **Regra
  de ouro descoberta e corrigida repetidamente**: qualquer "cartão"/retângulo de conteúdo
  dessas telas precisa de fundo **opaco** (`#f3f5f7`/`#fbfcfd`, não `rgba(...)` translúcido) —
  um fundo translúcido deixa a imagem borrada vazar através do texto, tornando-o ilegível. Já
  precisou ser corrigido em `.course-link`/`.vocabulary-link`/`.review-item`/`.unit-search-box`/
  `.wordbook-form`/`.wordbook-entry`/`.profile-course-toggle`/`.profile-reset-btn` e nos
  próprios painéis externos (`.landing-panel.course-links-panel`/`.wordbook-panel`/
  `.profile-panel`, que antes eram ~75% opacos e viraram 100%).

## Padronização Vocabulary ↔ Grammar (tela "exercises") + Self-evaluation (2026-07-16)

Sessão de ajustes finos pedida pelo usuário comparando screenshot a screenshot a tela de
exercícios do English Vocabulary B com a do Grammar English A1, até ficarem visualmente e
estruturalmente idênticas — mais uma feature nova que essa comparação acabou revelando faltar.

### Bug real: foco errado ao abrir "Show Answers" no Vocabulary
A área de respostas usava `CroppedExerciseViewer` (mesmo mecanismo do exercício em si — força
`scroller.scrollTop` pra uma banda específica da página via coordenadas). Isso competia com a
navegação assíncrona interna do `react-pdf-viewer` pra `initialPage`: se essa navegação da lib
terminasse *depois* do nosso ajuste de scroll, ela resetava a posição de volta pro topo da
página — e como isso é só um scroll (não uma mutação de DOM), o `MutationObserver` que reaplicava
a banda nunca disparava de novo pra corrigir. Sintoma relatado: a resposta certa nunca aparecia,
sempre "focava" na primeira resposta da página em vez da resposta do exercício aberto. **Corrigido
eliminando o crop inteiramente** pro painel de respostas — vira um `PdfWorkspace` normal, pulando
só pra página certa via `initialPage` (sem scroll forçado, sem corrida de condição possível). O
crop do *exercício em si* (não das respostas) foi mantido como estava, sem o mesmo problema.

### Unificação de interface do PDF de respostas (Grammar ↔ Vocabulary)
Descoberto durante a investigação: a tela de exercícios do Grammar ainda mostrava o gabarito num
`<iframe src={answersUrl}>` cru — o visualizador (com ferramentas de "Desenhar", imprimir, salvar)
que aparecia ali era o **visualizador nativo do navegador** (Edge/Chrome), não algo construído
pelo app. Trocado por `PdfWorkspace` (o mesmo componente customizado usado em todo o resto do
app), que **nunca teve botões de salvar/imprimir** — a toolbar customizada (`renderToolbar` em
`PdfWorkspace`) só inclui busca, navegação de página, zoom, ferramenta texto/mão e um "maximizar"
próprio, então trocar o iframe resolveu "remover salvar/imprimir" só por ser o componente certo.

### Divisória arrastável na área de respostas (ambos os cursos)
Novo handle horizontal (`.study-answers-resize-handle`, mesmo visual do `.resize-handle` vertical
já existente, só deitado) entre o conteúdo principal e a área de respostas — arrastar pra cima
aumenta a área de respostas (150-900px), reaproveitando o mesmo estado (`answersPanelHeight`) e
os mesmos handlers de pointer nos dois cursos. Alturas padrão também foram reduzidas (Vocabulary
50%→38%, Grammar/American1 34%→26%) depois que o usuário notou os botões da área de respostas
sobrepondo o botão flutuante "+Word" em telas mais baixas.

### Padronização visual pixel-a-pixel
Depois de vários screenshots comparativos anotados pelo usuário (círculos coloridos apontando
discrepâncias), corrigido um a um, sempre **medindo com Playwright** em vez de confiar só no
olho (mesma lição já aprendida em `tablet-responsive-fixes`/`course-rename-and-grid-scroll-fix`):
- **"FUTURE AREA TO SHOW ANSWERS"** (caixa vazia sempre visível no Vocabulary) removida — a área
  de respostas só é renderizada quando `showAnswers` está ativo, igual ao Grammar.
- **Textos redundantes removidos**: "Unit 4"/"Unit 5" apareciam soltos na barra de botões,
  duplicando a informação já presente na linha de título abaixo — removidos dos dois cursos.
- **Abas de exercício movidas pra barra superior** (Vocabulary): antes ficavam na linha do
  título; usuário pediu pra ficarem ao lado de "Back to Unit"/"All Units", como um grupo único.
- **Estilo dos botões igualado**: Vocabulary usava `.ghost-button` (branco, fino, 13px) onde o
  Grammar usa `.upload-button` (gradiente roxo). Trocada a classe, e adicionado um scoping
  (`.study-bar-left .upload-button`) espelhando `.pdf-toolbar-nav .upload-button` pra bater
  exatamente em altura (28px)/padding/fonte — inclusive o `gap` entre os dois botões (10px, não
  12px) precisou ser ajustado pra "All Units" cair no MESMO x exato do Grammar (medido via
  XPath/computed style a pedido do usuário, batendo em todas as propriedades).
- **Altura da barra de botões igualada** (`.study-bar` ganhou o mesmo `min-height:38px` que
  `.pdf-toolbar` já tinha) e o **padding horizontal** também (14px, não 18px).
- **Bug estrutural real, a causa de tudo isso parecer "não alinhado" apesar dos ajustes CSS
  anteriores**: no Grammar, a barra de botões + linha de título ficam **dentro** da coluna
  esquerda (`.pdf-panel`), não soltas por fora do grid de 2 colunas — por isso o painel direito
  (`.side-panel.right-panel`) começa bem no topo da tela, alinhado com a coluna esquerda. No
  Vocabulary, essas duas barras tinham sido colocadas *fora* de `.study-columns`, ocupando a
  largura toda — empurrando o painel de respostas pra baixo, bem mais que no Grammar (confirmado
  via medição: painéis começando em `y=147` vs `y=81`). Corrigido restruturando o JSX pra mover
  `.study-bar` e `.section-info` pra **dentro** de `.study-left`, replicando exatamente o padrão
  do Grammar — depois da mudança, os dois painéis passaram a começar exatamente na mesma
  coordenada Y (81px, logo abaixo do header).
  - **Efeito colateral dessa mudança**: `.study-left` tinha `gap:16px` entre seus filhos —
    valendo a pena pros filhos originais (leitor + área de respostas), mas criando uma faixa fina
    do fundo lavanda da página (`--soft`) vazando entre `.study-bar`/`.section-info`/`.study-reader`
    assim que essas duas barras (brancas) passaram a ser filhas desse mesmo container com gap.
    Removido o `gap` de `.study-left` inteiramente (igual ao `.pdf-panel`, que nunca teve gap
    nenhum) — os elementos ficam colados, com só `border-bottom` separando visualmente, sem
    frestas revelando o fundo.
- **"Answer key" (faixa de título da área de respostas no Grammar) removida**: o usuário já tem
  o botão "Hide Answers" no painel direito fazendo a mesma coisa que o antigo botão "✕" dessa
  faixa — mantê-la era redundante depois que o resto já bate com o Vocabulary.

### Self-evaluation por UNIT no Vocabulary (feature nova, não um ajuste)
American English A1 e Grammar English A1 já tinham "Self-evaluation for this unit" na própria
tela de leitura (não só por exercício) — o componente `UnitNotes` já suportava isso via props
`rating`/`onRate` (`{onRate && (<div className="rating-field">...)}`), só nunca tinha sido
conectado no Vocabulary. Implementado:
- Novo estado `vocabularyUnitRatings`, chave **própria** `u:<nome>:unit-rating:<unit>` — nunca
  reaproveitar o prefixo `rating:` (já usado por `exerciseRatings`, por exercício): usar o mesmo
  prefixo faria essa nova nota "vazar" pro cálculo de `overallScorePercent`/"Your Score" (que deve
  ser só a média por exercício), contaminando o valor mostrado no header/perfil.
- `scheduleReview('vocabulary-unit', unit, value)` — curso **distinto** de `'vocabulary'` (usado
  pelas notas de exercício) na revisão espaçada, porque `handleOpenReviewItem` tinha uma
  suposição hardcoded de que todo item `course === 'vocabulary'` tem um `id` de exercício
  (`item.id.split('.')[0]`, `exerciseCoords[item.id]`) — um id de unit bare (sem ponto, ex. "4")
  falharia esse check e o clique no card de revisão não navegaria pra lugar nenhum. Adicionado um
  branch novo (`item.course === 'vocabulary-unit'`) que navega pra `activePage: 'unit'` em vez de
  `'exercises'`.
- `handleResetSelfEvaluation`/`handleResetAll` (Profile) atualizados pra também limpar
  `unit-rating:`/`review:vocabulary-unit:`, senão um reset "completo" deixaria essas notas pra
  trás.
- Verificado via Playwright: estrela aparece e funciona na tela de leitura, persiste em
  `unit-rating:<unit>` após reload, e **não** vaza pra `rating:<unit>` (confirmado lendo as duas
  chaves separadamente).

## Dictation/Listening — auto-pause (piloto), player amplo e correções (2026-07-16)

Rodada implementando o item 1 do ROADMAP.md (criado nesta mesma data, com as 5 próximas
implementações aprovadas pelo dono) mais uma leva de correções e melhorias nas telas de
exercício de Listening/Dictation. Commits `788db9d` e `6d28319`.

### Auto-pause por detecção de silêncio (piloto: 2 tracks do Dictation)
O áudio pausa sozinho nos silêncios reais entre frases, dando tempo de escrever;
`Ctrl+Space` retoma. O dono rejeitou explicitamente a alternativa mais simples de pausar a
cada N segundos ("para o usuário não faz sentido... o intervalo entre frases pode se
confundir com intervalo de tempo entre palavras") — a solução é análise offline dos MP3s.

- **Detecção (Python, offline)**: `soundfile` + `numpy` (sem ffmpeg — o pydub instalado está
  quebrado no Python 3.14 local, `pyaudioop` ausente). RMS em janelas de 20ms; silêncio =
  abaixo de -35dB relativo ao pico do arquivo; **pausa de frase = silêncio ≥ 0.85s** (a
  distribuição real das durações é um contínuo 0.3-1.5s, sem corte limpo — 0.85 foi calibrado
  olhando a distribuição e validado de ouvido pelo dono).
- **Regra secundária**: trechos com mais de 15s sem pausa são divididos recursivamente na
  maior pausa interna ≥ 0.4s — a frase gigante da unit 4A (as listas de "pronoun; nouns;
  verbs...") ficava com 36s corridos sem nenhum silêncio ≥ 0.85s.
- **Regra específica dos áudios do Vocabulary**: a primeira pausa detectada é descartada —
  esses áudios abrem com um cabeçalho falado ("A... Parts of speech") que não faz parte do
  texto do ditado; o áudio fica intacto, só não pausamos ali. American1 terá outra dinâmica
  (sem esse cabeçalho) — recalibrar quando chegar a vez.
- Dados em `dictation_pause_points.json` (segundos por trackId; piloto: `unit4-a` 15 pontos,
  `unit4-b` 7). Script gerador no scratchpad da sessão, não persistido (política padrão dos
  geradores); parâmetros documentados aqui e no ROADMAP.
- **Bug real corrigido — gatilho por proximidade → por cruzamento**: a 1ª versão pausava
  quando `currentTime` estava numa janela de 0.75s após um ponto. O botão "↺ Replay last
  part" (abaixo) volta o cursor EXATAMENTE pra cima de um ponto — o primeiro `timeupdate`
  re-pausava ali mesmo e o replay parecia morto. Agora só pausa quando a reprodução CRUZA um
  ponto (posição anterior < ponto ≤ atual, com avanço contínuo — saltos de seek > 2s não
  contam), o que elimina o insta-repause por construção.
- **UI**: toggle "✓ Auto-pause on/off"; pílula roxa pulsante "⏸ Paused — press Ctrl+Space to
  continue" (grande — o usuário está de cabeça baixa digitando); pílula verde com anel "🏁
  End of audio..." quando o áudio termina (sem ela, a última pausa automática era
  indistinguível do fim — o usuário dava play achando que havia mais e o áudio recomeçava do
  zero, parecendo bug); botão "↺ Replay last part" que volta pro início do trecho atual e
  re-pausa no mesmo lugar, pra reouvir quantas vezes precisar.
- **Estado do Dictation entrou no mecanismo de restauração de posição** (sessionStorage +
  History API): F5 na tela do exercício mostrava "Exercise not found" porque
  `selectedDictationSource/Track` não eram restaurados (o Listening já era). 4 pontos de
  integração: estado inicial, objeto position, deps e o handler de popstate.

### WideAudioPlayer (player amplo, só Listening/Dictation)
Os players compactos (pílula amarela) foram desenhados pra margens de PDF; nas telas de
exercício o player é a interação principal e havia espaço de sobra. Componente novo,
horizontal, largura total: play/pause, voltar/avançar 5s (`IconForward5` criado espelhando o
`IconBack5`), stop, repetição A-B (mesma máquina de 3 estados do compacto), velocidades
0.5x-2x (0.5x é novo), **loop do áudio inteiro** ao terminar (atributo `loop` nativo), barra
de progresso arrastável e tempo atual/total. O `<audio>` continua um elemento real dentro do
componente — `Ctrl+Space`, auto-pause e Replay o acham via `querySelector('audio')` sem
mudança. Selo amarelo de unit removido dessas telas; rótulos normalizados para o formato do
livro ("unit 4A", não "unit 4-a") via `listeningTrackLabel` — propaga pra títulos, listas e
busca; instruções do Listening movidas de dentro da barra do player pra baixo do título
(mesma disposição do Dictation). **Nenhuma outra tela trocou de player.**

### Correção do casamento de palavras (LCS) na correção do Dictation
O score estava certo, mas o destaque verde podia atribuir uma palavra repetida (ex.:
"nouns", que aparece 3+ vezes no texto da unit 4B) a uma ocorrência lá do fim — o backtrace
clássico (prefixos, de trás pra frente) casa cada palavra digitada com a ocorrência mais
TARDIA possível. Reescrito com DP de SUFIXOS + caminhada pra FRENTE: cada palavra casa com a
ocorrência mais cedo, o score é idêntico (mesmo comprimento de LCS) e os verdes ficam
colados no contexto que o usuário realmente ditou. Validado com o exemplo exato reportado
pelo dono (o "nouns" final voltou pro "are all nouns" e o do "Elephant and zoo" ficou
vermelho). Também na apresentação: o espaço saiu de DENTRO dos spans sublinhados (virava uma
fita vermelha contínua atravessando os espaços, "espalhando" as palavras) e o peso da fonte
voltou ao normal — a correção lê como prosa corrida colorida.

### Ajustes menores da mesma rodada
- "Try again" do Dictation **preserva o texto digitado** (recomeçar do zero = apagar
  manualmente); um botão "Save progress" foi implementado e depois removido a pedido.
- Dica "If you hear \"for example\", type \"e.g.\"." nas instruções do Dictation (o locutor
  fala "for example", o texto de correção tem "e.g." — sem a dica, pontos perdidos injustos).
- ROADMAP.md ganhou o item 5 (contador de tempo de estudo + streak no Dashboard — parte da
  sugestão original do Dashboard que ficou de fora por exigir infraestrutura de log de
  atividade que ainda não existe).

## Auto-pause completo (Vocabulary + American1), rótulos de personagem no Dictation, resize do American1 (2026-07-19)

Continuação do item 1 do ROADMAP.md (a partir do piloto de 2 tracks descrito acima) mais uma
limpeza no texto de correção do Dictation e um ajuste de UI no American English A1. Sem
commit de script gerador (mesma política dos outros — script Python fica só no scratchpad da
sessão, dados persistem em `dictation_pause_points.json`).

### Vocabulary: pontos de pausa pros ~305 tracks restantes + recalibração do limiar de corte
O script do piloto não estava no repo (política padrão), então foi reconstruído a partir dos
parâmetros já documentados aqui/ROADMAP e calibrado batendo contra os valores exatos do
piloto (`unit4-a`/`unit4-b`, já aprovados pelo dono) até reproduzi-los quase perfeitamente:
- **Offset do ponto dentro do silêncio**: descoberto por engenharia reversa — o ponto de
  pausa não é o início do silêncio puro, é `início_do_silêncio + 0.3s` (um buffer de
  segurança, provavelmente pra não cortar em cima da cauda/reverb da última consoante). Sem
  esse offset, os pontos batiam sistematicamente ~0.3s cedo demais.
- **Descarte do cabeçalho**: o texto original ("a primeira pausa é descartada") não bate
  literalmente com os dados — `unit4-a`/`unit4-b` têm CADA UM 2 silêncios no início (cabeçalho
  falado "Unit N letra" + "Título", cada um com sua própria pausa), não 1. Descartar só a
  primeira deixava um ponto espúrio sobrando por volta de 2.8s. Corrigido pra descartar até 2
  pausas iniciais, mas só enquanto cada uma for precedida por um trecho curto (< 3s) — sem
  esse teto, tracks estilo lista de vocabulário (palavra, pausa, palavra, pausa...) tinham
  TODOS os pontos apagados, porque cada palavra em si já é um "trecho curto".
- **Recalibração pedida pelo dono**: depois de rodar os ~305 tracks, o dono notou que os
  trechos ainda ficavam longos demais pra escrever de cabeça. Simulação mostrou que baixar só
  o piso do corte interno (0.4s → 0.3s) não mudava NADA (377 trechos > 8s antes e depois —
  dentro de um trecho > 15s já sempre havia um candidato ≥ 0.4s disponível, então baixar o
  piso não desbloqueava nada de novo). A alavanca real era o limiar que decide SE um trecho é
  dividido: baixado de 15s pra **8s** (mantendo o piso do corte interno em 0.4s pro
  Vocabulary), reduzindo de 377 pra ~125 trechos internos > 8s (média caiu de ~10.7s pra
  4.17s). `unit4-a`/`unit4-b` foram regenerados junto (não deixados no valor antigo do
  piloto) porque unit4-a é literalmente o exemplo que motivou essa regra (a lista gigante de
  "pronoun; nouns; verbs..." de 36s corridos).
- 2 tracks (`unit15-c`, `unit37-b`) ficam sem nenhum ponto — só 2-3 frases curtas, sem
  silêncio ≥ 0.85s entre elas; comportamento aceito (auto-pause só não dispara ali).

### American English A1: dinâmica recalibrada (52 tracks do Dictation)
O dono corrigiu a suposição do ROADMAP de que os áudios do American1 não têm cabeçalho falado
— eles têm, só que mais curto ("CD X Track Y", não "Unit N letra. Título"), então precisa de
**só 1** pausa inicial descartada, não 2 (parametrizado via `max_header_pauses`, default 2 pro
Vocabulary, 1 pro American1).
- **Diálogo bem mais contínuo que o Vocabulary**: vários tracks (`cd2-track10/11/12`,
  `cd5-track51`) não tinham NENHUM silêncio ≥ 0.4s em trechos de 40-100s — o corte recursivo
  não achava onde dividir e o track inteiro ficava com 1 ponto só. Baixar o piso do corte
  interno pra **0.15s** (só pro American1, Vocabulary continua em 0.4s) resolveu os 4 casos
  sem piorar a distribuição geral (média de trecho interno foi de 5.33s pra 4.97s). Uns 6-7
  tracks (a maioria no CD2) continuam com trechos longos (até 38s) mesmo assim — são áudios
  de diálogo gravados sem NENHUM intervalo de edição entre falas, não tem sinal acústico pra
  detectar ali, aceito como limitação.
- **Guarda de silêncio final**: vários tracks têm um silêncio de cauda perto do fim do
  arquivo (após a última frase, antes do arquivo realmente acabar) que virava um "ponto de
  pausa" inútil a ~1-3s do fim. Filtro novo: nunca gerar ponto no último 1s do arquivo.
- Caminho dos arquivos de áudio: `American English Level 1/audio_files_{1..5}/` (CD1..CD5,
  mesmo mapeamento do `setupProxy.js`), nomes vêm URL-encoded em `listening_american1.json`
  (precisa `urllib.parse.unquote` no lado do script gerador).

### Rótulos de personagem removidos do texto de correção do Dictation
O dono notou que o texto usado pra comparar a digitação do aluno incluía quem fala cada frase
("A: A cheese and tomato sandwich, please." / "B: That's 7 dollars and 20 cents.") — o áudio
não fala esse rótulo, é só convenção de transcrição, então cobrar isso do aluno penalizava
injustamente (o rótulo aparecia como palavra "faltando", em vermelho).
- **Padrão com dois-pontos** ("A: ...", "Jenny: ...", "WAITER: ..."): regex genérica
  `^[A-Z][A-Za-z0-9 ]{0,24}:\s*`, cobre 690/760 frases do American1 e ~39 do Vocabulary
  (`unit48-d`, `unit31-c`, etc.) — seguro, sem falso positivo encontrado nos dois cursos.
- **Padrão sem dois-pontos** (só existe no American1 — "Rob Hi. My name's...", "Teacher OK.
  Can you be quiet...", "Student 1 What page?"): **não dá** pra generalizar como "qualquer
  palavra maiúscula no início" — isso apagaria começos de frase legítimos e reais como
  "JetBlue flight to Los Angeles...", "Room 11 was on the top floor.", "The train waiting at
  platform 13...". A solução foi revisar as 70 frases sem dois-pontos do American1 uma a uma
  e montar uma lista fechada de 22 rótulos confirmados (Teacher, Rob, Jenny, Mom, Host,
  Receptionist, Police officer, Announcer, etc.) — testada contra as 2378 frases do Vocabulary
  também, zero falso positivo.
- Só mexe no texto usado pra CORRIGIR (`fullText` em `DictationExercise`) — o Listening
  continua mostrando `track.sentences` sem essa limpeza, já que lá o rótulo nunca aparecia
  como "errado" (não tem digitação pra comparar, só lacunas).

### American1: painel de respostas redimensionável, sem a linha/cabeçalho fixos
A faixa "Show Answers" (Teacher's Book) na tela de unit do American1 tinha uma borda grossa
fixa separando do leitor e uma altura travada em 26% — diferente do Vocabulary/Grammar Elem,
que já usavam o padrão `.study-answers-resize-handle` (linha fina + pílula de arraste,
altura ajustável e persistida em `answersPanelHeight`). Igualado ao mesmo padrão; a borda fixa
virou uma classe modificadora (`.section-answers-strip--resizable`) que zera a borda só onde
o handle já provê a linha, sem afetar o Grammar Elem (que usa a mesma classe base sem o
modificador). Também removida a faixa de cabeçalho "Teacher's Book answers" + botão ✕ — o
toggle que já existe no painel de notas lateral (`UnitNotes`) continua fechando o painel, então
o cabeçalho local era redundante.

### Ajuste menor
- Texto da pílula de fim de áudio no Dictation: "Ctrl+Space plays it again from the start" →
  "Ctrl+Space to plays it again" (pedido do dono).

## Histórico de processamento de conteúdo (pré-processamento, fora do código React)

- PDFs originais `EVIU_PI-X.pdf` foram divididos em duas páginas cada (`_L` e `_E`) com `pypdf` (script `split_pdfs.py`, já removido do repositório).
- Áudios `U_XXX.Y.mp3` foram reorganizados de uma pasta única para pastas `unit_X` correspondentes (com correção de um erro que havia colocado tudo em `unit_100`).
- Total de unidades: 100. Total de arquivos em `EVIU_P_I`: 618 (contagem histórica).

## Histórico de commits recentes
- Commits antigos ("Segundo Salve", "terceiro Salve", "quarto Salve", "commit 7" etc.) são iterações de ajuste fino de UI/UX sem mensagens descritivas, sem mudanças estruturais grandes documentadas individualmente.
- `28d377d` — Adiciona estudo por exercício (recorte do PDF): primeira versão da página de exercícios.
- `065c5fc` — Implementa a área de respostas (gabarito recortado + toggle "Show answers", localStorage por exercício).
- `7548257` (2026-07-02) — Prova de conceito (fora do app) de player de áudio ancorado por seção.
- (2026-07-03, não commitado ainda neste resumo) — Player de áudio ancorado integrado ao app para as 100 units, substituindo a coluna esquerda de lista de áudio; ver seção "Áudio ancorado no PDF de leitura" acima.
- (2026-07-04, não commitado ainda neste resumo) — Cadastro de usuário (só nome) + trava de acesso aos cursos + score por usuário; ver seção "Cadastro de usuário e score" acima.
- (2026-07-04, não commitado ainda neste resumo) — Segundo curso real, "American English Level 1" (substituiu o placeholder "Course 2"): leitura por seção com PDF mesclado sob demanda + notas; ver seção "American English Level 1" acima.
- (2026-07-04, não commitado ainda neste resumo) — Áudio ancorado (parcial) no American English Level 1, via casamento de template (sem OCR) + atribuição sequencial de faixa; ver "Áudio ancorado" acima.

## Como usar

- Rodar o app: `cd meu-leitor-pdf && npm install && npm start` (as pastas `Pre Intermediate and Intermediate/` e `American English Level 1/` precisam existir no nível acima de `meu-leitor-pdf/`, como já está hoje).
- Adicionar/atualizar áudios: basta colocar os arquivos `U_XXX.Y.mp3` dentro da pasta `unit_X` correspondente em `Pre Intermediate and Intermediate/EVIU_P_I/` — nada para sincronizar ou copiar, o dev server já lê dali.
- **Não existe build de produção funcional para os áudios**: `npm run build` gera o app, mas os áudios não vão junto (decisão intencional, ver abaixo).

### Distribuição via pendrive + isolamento de porta (2026-07-07)

Existe uma cópia espelhada do projeto num pendrive (unidade `E:\Projeto_pagina_pdf\`, rótulo `PROJETO_PDF`), usada para rodar o app noutro contexto/PC sem precisar do repositório git — é uma cópia simples de arquivos (sem `.git`, sem `node_modules` sincronizado automaticamente), atualizada manualmente copiando por cima só os arquivos que mudaram desde a última sincronização (não um mirror completo a cada vez — `node_modules`, `.git` e as pastas de material bruto, gigantes e inalteradas, ficam de fora dessa rotina).

- **Bug descoberto ao usar o pendrive**: `StartLearning.bat`/`OpenWhenReady.ps1` sempre abriam `http://localhost:3000`, então a cópia do pendrive e a cópia do PC caíam na **mesma origem** do navegador — e `localStorage` é isolado por origem, não por pasta de arquivos no disco. Resultado: usuários cadastrados numa cópia apareciam na outra, misturados.
- **Correção**: os dois scripts agora detectam, cada um por conta própria (`Get-Volume -DriveLetter`, sem passar argumento entre eles), se estão rodando de uma unidade fixa (HD/SSD do PC → porta 3000, comportamento inalterado) ou removível (pendrive → porta **3001**). Como a porta é recalculada a cada execução a partir de onde o script física está, e não fica salva em nenhum arquivo de configuração, copiar os mesmos `.bat`/`.ps1` do PC pro pendrive (ou vice-versa) continua funcionando corretamente dos dois lados — não precisa de uma versão "especial" do launcher só pro pendrive.
- **Efeito colateral querido**: com origens diferentes, o `localStorage` (usuários, progresso, notas, My Words) da cópia do pendrive fica permanentemente isolado do da cópia do PC — não é um reset a cada abertura (isso apagaria o progresso feito no pendrive de uma sessão pra outra), é uma separação definitiva, como duas "instalações" diferentes do app.
- **Limpeza dos usuários já misturados** (antes da correção): não foi possível fazer via automação — Playwright abre um perfil de navegador isolado, sem acesso ao perfil real do navegador do usuário, então não há como um agente de IA rodando localmente limpar o `localStorage` do navegador de verdade da pessoa. Precisou ser feito manualmente (Profile → "Delete this user" por usuário, ou console do DevTools com `Object.keys(localStorage).forEach(k => localStorage.removeItem(k))`).
- **"Reset all data on this browser"** (link na tela de registro, ver "Cadastro de usuário e score" acima) nasceu diretamente dessa situação — resolve o mesmo problema (lista de "Continue as" com nomes não reconhecidos) sem precisar abrir o DevTools nem logar em cada usuário.

### "Today's Plan" — bloco de orientação na Home (2026-07-07)

Card `TodayPlanCard`, só na Home (não na tela Courses), com até 4 sugestões concretas de "o que fazer agora" — pra quem senta pra estudar sem saber por onde começar:

- **"Learn something new"**: próxima unit não visitada, buscada nos 3 cursos em ordem de prioridade fixa (Vocabulary → American English Level 1 → Grammar Elementary — `findNextUnvisitedByCourse` em `App.js`). Pra American1, a unidade de progresso é a *seção* (`american1VisitedSections`, chave `"<unit>|<section>"`), não a unit inteira — a busca varre `american1UnitNumbers` em ordem e, dentro de cada unit, as seções na ordem do índice, parando na primeira não visitada.
- **"Practice listening"**: mesma busca, mas pega o **próximo candidato da lista** (não o primeiro) — ou seja, aponta pra um curso diferente do usado em "Learn something new" sempre que houver mais de um curso com conteúdo não visitado. Só repete o mesmo curso se os outros dois já estiverem 100% visitados. Escolhido especificamente porque os 3 cursos têm player de áudio embutido na tela de leitura (ancorado no PDF ou, no Grammar Elementary, ao lado da letra da seção), então "ir ouvir" e "ir ler" resultam nas mesmas telas — a diferenciação é só de que curso cada botão aponta, não de mecanismo.
- **Até 2 revisões pendentes**: mesma fonte de dados do `ReviewCard` (`reviewQueue`, já ordenado por mais atrasado primeiro), só que limitado a 2 pra não repetir a lista inteira duas vezes na mesma tela — se houver mais, aparece um link "+N more review(s) due — see all in Courses" que leva pra tela Courses (onde o `ReviewCard` completo, sem limite, continua existindo). **Decisão de design**: o `ReviewCard` foi **removido da Home** nesta mudança (ficou só na Courses) — antes as duas seções apareciam juntas na Home mostrando os mesmos itens duas vezes seguidas (visualmente confirmado antes do ajuste), o que ia contra o próprio objetivo do "empurrão de por onde começar" (um sinal claro, não dois competindo).
- Cada linha é um botão que navega direto pra tela certa. As 3 primeiras (`openVocabularyUnit`/`openAmerican1Section`/`openGrammarElemUnit`, `App.js`) são funções novas de navegação direta — **diferente** dos handlers `handleUnitSelect`/`handleAmerican1UnitSelect`/`handleGrammarElemUnitSelect` já existentes (usados pela lista de units de cada curso), que não setam `activeCourseId` porque contam com esse valor já ter sido setado um passo antes (ao clicar no link do curso, na tela Courses). Como o plano pula direto da Home pra dentro de uma unit, sem passar pela tela de lista, essas 3 funções novas setam `activeCourseId` explicitamente — senão o cabeçalho ("You are in the... Course") e o link "All Units" ficariam quebrados.
- Cada linha some sozinha se não houver nada pra sugerir naquele slot; o card inteiro some se as 3 estiverem vazias (ex.: todo o conteúdo dos 3 cursos já visitado e nenhuma revisão vencida — só acontece depois de esgotar ~230 units/seções, não é um caso realista no curto prazo, mas o guard existe por correção).
- Verificado via Playwright (15 checks): sem usuário o card não aparece; usuário novo mostra Vocabulary Unit 1 (novo) + American English Level 1 Unit 1A (listening, curso diferente); reatividade confirmada (depois de visitar a Unit 1, a sugestão avança pra Unit 2); com 3 revisões semeadas como vencidas, mostra só as 2 mais atrasadas + link "+1 more"; clicar no link leva pra Courses com as 3 completas; `ReviewCard` não se repete na Home.

## Observações para outra IA

- Não existe roteamento real (react-router); tudo é estado local (`activePage`, `selectedUnit`) em um único componente `App`.
- `react-resizable-panels` está no `package.json` mas não é usado — o redimensionamento é caseiro. Se for refatorar o layout, considerar migrar para a lib já instalada em vez de manter a lógica manual.
- **Decisão importante (2026-07-02)**: os áudios foram removidos de `public/audio/` (419 arquivos que tinham acabado de ser commitados, mas ainda não haviam sido enviados ao GitHub) porque (1) duplicavam arquivo que já existe em `Pre Intermediate and Intermediate/` dentro do próprio projeto, e (2) o dono não quer esse material de áudio publicado no GitHub. A solução foi `src/setupProxy.js`, que serve `/audio` diretamente da pasta de material via `express.static`, só em desenvolvimento. Confirmado como uso exclusivamente local (não há intenção de hospedar/publicar o app), então essa limitação é aceitável. Se algum dia precisar publicar o app, essa arquitetura de áudio precisa ser repensada (o servidor de produção não tem acesso a `Pre Intermediate and Intermediate/`).
- O script `scripts/sync-audios.js` foi removido — ele existia justamente para fazer a cópia que agora foi eliminada.
- Os índices `exercises_coords.json`/`answers_coords.json`/`audio_anchors_coords.json` não devem ser editados manualmente. Os scripts que os geravam (`gerar_indice_exercicios.py`/`gerar_indice_audio.py`, PyMuPDF) foram removidos do repo em 2026-07-04 por serem utilitários de uso único (disponíveis no histórico do git se precisar reconstruir); se os PDFs de origem mudarem, será preciso recriar essa lógica de geração.
- **Não existe senha nem backend de autenticação** — o "cadastro" (ver "Cadastro de usuário e score" acima) é só um nome usado para namespacing de chaves no `localStorage` deste navegador. Qualquer pessoa pode "logar" como qualquer nome já cadastrado sem confirmação nenhuma; não é um mecanismo de segurança, só de separação de progresso entre pessoas que compartilham o mesmo PC/navegador.
- Ver também as memórias de sessão `exercise-crop-feature` e `verify-app-runs-on-port-3000` para detalhes de implementação e checagem de saúde do app.

---

Este resumo foi gerado para facilitar a transferência de contexto para outra IA ou para documentação rápida do projeto.
