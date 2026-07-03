# Projeto PDF e Áudio - Resumo

## Visão geral

Aplicação web para estudo de inglês ("Let's Learn English") que combina um leitor de PDF customizado com uma biblioteca de áudios organizada por unidades de vocabulário (livro Pre-Intermediate/Intermediate, 100 unidades). Os áudios de cada unidade tocam diretamente ancorados no PDF de leitura (player compacto sobre a margem, ao lado de cada letra de seção), não numa lista separada. Além da leitura, o app permite estudar exercício por exercício (recorte automático do PDF), com área de resposta e gabarito, ambos persistidos localmente.

## Estrutura do projeto

- `meu-leitor-pdf/`
  - Aplicação React (Create React App), todo o código-fonte em `src/App.js` (arquivo único, ~940 linhas, sem componentes separados em arquivos próprios).
  - Dependências principais:
    - `react` ^19.2.7, `react-dom` ^19.2.7, `react-scripts` 5.0.1
    - `@react-pdf-viewer/core`, `@react-pdf-viewer/default-layout`, `@react-pdf-viewer/highlight` (leitor de PDF)
    - `react-resizable-panels` (não usado atualmente no layout — o redimensionamento dos painéis é feito manualmente com handlers de pointer, ver abaixo)
    - `@testing-library/*` para testes
  - Scripts (`package.json`):
    - `npm start` / `npm run build` / `npm test`
  - `src/setupProxy.js`
    - Middleware do dev server (`react-scripts start`) que serve, diretamente de `../Pre Intermediate and Intermediate/EVIU_P_I` (mesma pasta, dois mount points), via `express.static` com `fallthrough: false` (responde 404 real em vez de cair no SPA history fallback do CRA):
      - `/audio/*` — usado pelos players de áudio.
      - `/materials/*` — usado pelo leitor de PDF.
      - `/answers-key.pdf` — rota dedicada (`res.sendFile`) que serve o gabarito único multipágina, um nível acima de `EVIU_P_I` (raiz de conteúdo).
    - **Não copia nem duplica arquivo nenhum** — nem áudio nem PDF nunca existem dentro de `meu-leitor-pdf/public/`, portanto nunca vão para o git/GitHub.
    - Só funciona em desenvolvimento (`npm start`). Não existe suporte a `npm run build` + hospedagem, porque não há servidor em produção para expor esses arquivos (decisão consciente: o app é de uso local apenas).
    - Mudanças neste arquivo exigem reiniciar `npm start` (não é hot-reloadable).
  - `src/exercises_coords.json` e `src/answers_coords.json`
    - Índices gerados por `gerar_indice_exercicios.py` (raiz do repo) — ver seção "Estudo por exercício" abaixo.
  - `src/audio_anchors_coords.json`
    - Índice gerado por `gerar_indice_audio.py` (raiz do repo) — ver seção "Áudio ancorado" abaixo.
  - `src/conteudo_arquivos.txt`
    - Dump de texto (concatenação de arquivos-fonte) usado como snapshot de contexto para IA em algum momento anterior; não é lido pelo app em runtime, pode estar desatualizado.

- `Pre Intermediate and Intermediate/EVIU_P_I/`
  - Pasta de material bruto (PDFs e MP3s originais), **ignorada pelo git** (`.gitignore`: `Pre Intermediate and Intermediate/`).
  - É a **única fonte** de áudios e PDFs em tempo de execução (servida ao vivo pelo `setupProxy.js`), não existe mais nenhuma cópia em `public/`.
  - `Pre Intermediate and Intermediate/English_Vocabulary_Pre_Intermediate_Answers_Key.pdf`: gabarito único multipágina (37 páginas) com as respostas de todas as units, servido via `/answers-key.pdf`.
  - `Pre Intermediate and Intermediate/exercises list.txt`: lista de referência dos exercícios esperados por unit, usada só para conferência cruzada pelo script gerador (o PDF é a fonte de verdade quando diverge — ver units 21/27 abaixo).
  - `Pre Intermediate and Intermediate/teste_overlay_audio/`: página HTML descartável, fora do git, prova de conceito original do player de áudio ancorado (Unit 6, testada em 2026-07-02). Já implementada no app (ver "Áudio ancorado" abaixo); a pasta continua ali só como referência histórica da POC.

- `gerar_indice_exercicios.py` (raiz do repo)
  - Script Python (usa `PyMuPDF`/`fitz`) que lê a camada de TEXTO dos PDFs de cada unit (sem OCR) para localizar marcadores de exercício (ex.: `"72.1"`) e calcular a faixa vertical `[top, bottom]` de cada um, gravando `meu-leitor-pdf/src/exercises_coords.json`. Também gera `answers_coords.json` a partir do gabarito único. Uso: `python gerar_indice_exercicios.py` (só gera se os JSONs não existirem) ou `--force` para regenerar sempre.

- `gerar_indice_audio.py` (raiz do repo)
  - Script Python (`PyMuPDF`) que lê a camada de texto de cada `_L.pdf` para localizar os marcadores de letra de seção (A, B, C...) — identificados por fonte/tamanho/cor exatos (`SourceSansPro-Black`, tamanho >16, cor branca) — e associa cada um ao arquivo de áudio correspondente, gravando `meu-leitor-pdf/src/audio_anchors_coords.json`. Uso: `python gerar_indice_audio.py` / `--force`.

- Arquivo `npx` na raiz: arquivo vazio (0 bytes), resquício de execução acidental de `npx` sem argumentos — não tem função no projeto.

## Funcionalidade do app (`src/App.js`)

### Navegação
Estado `activePage` controla 4 "páginas" renderizadas condicionalmente (sem router):
- **home** — landing page com texto motivacional de boas-vindas.
- **courses** — lista de cursos disponíveis (hoje: "Vocabulary - English Pre Intermediate" + um placeholder "Course 2").
- **vocabulary** — grade com os 100 links de unidade (`unitTable`, mapeando número → tema, ex.: "1: Learning vocabulary", "24: Food", "100: Abbreviations").
- **unit** — tela de estudo de uma unidade específica (layout de 3 painéis).

### Tela de unidade (layout de 2 painéis redimensionáveis)
- Painel central: leitor de PDF (`PdfWorkspace`, envolvido por `UnitAudioReader` — ver "Áudio ancorado" abaixo). Ao entrar na Unit N, carrega automaticamente `/materials/unit_N/EVIU_PI-N_L.pdf` (o arquivo terminado em `_L`, confirmado presente nas 100 unidades). O usuário ainda pode trocar por um PDF local via upload (`URL.createObjectURL`) — o auto-load só é reaplicado ao trocar de unidade/reentrar na página. Toolbar customizada (zoom, navegação de página, busca, alternância texto/mão, fullscreen, download, print) e plugin de highlight por seleção de texto.
- Painel direito: seção "Relacionados" (atualmente placeholder estático).
- Painel direito é redimensionável por arraste (handlers de `pointerdown/pointermove/pointerup` com clamping de largura mínima/máxima), implementado manualmente em `App.js` — não usa a lib `react-resizable-panels` já instalada.
- **Não existe mais painel esquerdo.** Até 2026-07-03 havia uma coluna com a lista de áudios da unidade; foi removida quando os players passaram a ficar ancorados diretamente no PDF (ver abaixo).

### Áudio ancorado no PDF de leitura
Cada faixa de áudio da unidade toca a partir de um player compacto (play/pause, stop, velocidade 0.75x–2x) sobreposto ao próprio PDF `_L`, alinhado com a letra da seção correspondente (A, B, C...) — não existe mais lista de áudio separada.

- **Índice de coordenadas**: `audio_anchors_coords.json` mapeia cada unit a uma lista `[{letter, audio, page, x0, yTop, yBottom, pageWidth, pageHeight}]`, gerado por `gerar_indice_audio.py` a partir da camada de texto do `_L.pdf` (localiza os marcadores de letra pela fonte/tamanho/cor exatos do template do livro).
- **Posicionamento**: o player fica na **margem esquerda da página** (sempre vazia por design do livro), com a borda direita encostando perto da letra e centralizado na sua altura vertical — não fica embaixo da letra, porque a faixa colorida da letra é estreita demais para caber o player, e colocá-lo abaixo cobriria o título/corpo do texto da seção.
- **`UnitAudioReader`**: envolve o `PdfWorkspace` existente (não o recorta nem o substitui) e injeta, via `MutationObserver`/`ResizeObserver` + `ReactDOM.createPortal`, uma camada de overlay (`.audio-anchor-host`) como filho direto da página renderizada (`[data-testid="core__page-layer-N"]`, que já é `position: relative` no CSS do `@react-pdf-viewer/core`). Como o overlay é filho do próprio elemento da página, ele rola e reposiciona junto do zoom/scroll automaticamente — só recalcula a escala (`pageLayer.width / pageWidth`) via `ResizeObserver` quando o zoom muda.
- **`AudioAnchorPlayer`**: cada player é um `<audio>` real controlado por estado React (não o elemento `<audio controls>` nativo), com botões custom e menu de velocidade (fecha ao clicar fora ou ao escolher uma velocidade).
- Os players só aparecem quando `pdfFileUrl` é o PDF `_L` carregado automaticamente para a unit selecionada — se o usuário sobrescrever com upload manual de outro PDF, os players somem (não faria sentido ancorá-los num documento diferente).
- **Data quirks tratados automaticamente**: 3 arquivos de áudio (de 318 no total) não têm âncora visível na tela de leitura porque não há marcador de letra correspondente no `_L.pdf`:
  - Units 1 e 3: a letra `D` só existe no arquivo `_E` (mesmo padrão dos exercícios dessas units — ver abaixo), que não é carregado na tela de leitura.
  - Unit 72: existe um arquivo extra `U_072.D.mp3` sem nenhuma seção "D" no material (nem em `_L`, nem em `_E`) — resquício do pacote original de áudio, sem correspondência no livro.
  - Esses 3 arquivos continuam em disco normalmente, só não têm player ancorado.
- Prova de conceito original: commit `7548257` (2026-07-02), testada isoladamente em `Pre Intermediate and Intermediate/teste_overlay_audio/` (fora do app, fora do git).

### Estudo por exercício (`activePage === 'exercises'`)
Página separada (não substitui a tela de leitura da unit), acessada pelo botão "Exercises" na toolbar do PDF (só aparece se a unit tiver exercícios indexados). Mostra **um exercício por vez**, recortado do PDF original — sem gerar PDFs novos nem alterar o leitor.

- **Índice de coordenadas**: `exercises_coords.json` mapeia cada exercício (`"N.x"`) a `{unit, suffix (_E ou _L), page, top, bottom, pageWidth, pageHeight}`, gerado por `gerar_indice_exercicios.py` a partir da camada de texto dos PDFs.
- **`CroppedExerciseViewer`**: envolve o `PdfWorkspace` existente e, via `MutationObserver`/`ResizeObserver` + manipulação direta do DOM (`.rpv-core__inner-pages`), reduz a altura visível do scroller e ajusta `scrollTop` para mostrar só a faixa `[top, bottom]` do exercício, em `SpecialZoomLevel.PageWidth`. Reage a zoom e resize. Usada tanto para o exercício quanto para o gabarito.
- **Navegação**: abas com todos os exercícios da unit no topo (`exercise-tabs`) + botões "Previous"/"Next" na área de resposta; no último exercício da unit, um botão extra "Next Unit" leva à tela de leitura (`_L`) da próxima unit.
- **Área de resposta (`AnswerArea`)**: textarea por exercício, persistida em `localStorage` (`answers:<id>`), com hide/show automático ao trocar de exercício.
- **Gabarito (`answers_coords.json` + `/answers-key.pdf`)**: botão "Show answers" (desabilitado se não houver resposta indexada) revela, num painel inferior, o recorte da página correspondente do gabarito único multipágina (37 páginas), servido por rota dedicada em `setupProxy.js`. Oculto por padrão e resetado ao trocar de exercício/unit.
- **Data quirks tratados automaticamente** (sem intervenção manual): units 1 e 3 têm os dois primeiros exercícios no arquivo `_L` em vez de `_E`; units 21 e 27 têm só 4 exercícios no PDF (a `exercises list.txt` afirma 5 — o PDF é a fonte de verdade); a página `_E` da unit 1 é de duas colunas, então o recorte horizontal pode incluir conteúdo da coluna vizinha (único caso afetado).
- Detalhes completos em memória: `exercise-crop-feature`.

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

## Como usar

- Rodar o app: `cd meu-leitor-pdf && npm install && npm start` (a pasta `Pre Intermediate and Intermediate/` precisa existir no nível acima de `meu-leitor-pdf/`, como já está hoje).
- Adicionar/atualizar áudios: basta colocar os arquivos `U_XXX.Y.mp3` dentro da pasta `unit_X` correspondente em `Pre Intermediate and Intermediate/EVIU_P_I/` — nada para sincronizar ou copiar, o dev server já lê dali.
- **Não existe build de produção funcional para os áudios**: `npm run build` gera o app, mas os áudios não vão junto (decisão intencional, ver abaixo).

## Observações para outra IA

- Não existe roteamento real (react-router); tudo é estado local (`activePage`, `selectedUnit`) em um único componente `App`.
- `react-resizable-panels` está no `package.json` mas não é usado — o redimensionamento é caseiro. Se for refatorar o layout, considerar migrar para a lib já instalada em vez de manter a lógica manual.
- **Decisão importante (2026-07-02)**: os áudios foram removidos de `public/audio/` (419 arquivos que tinham acabado de ser commitados, mas ainda não haviam sido enviados ao GitHub) porque (1) duplicavam arquivo que já existe em `Pre Intermediate and Intermediate/` dentro do próprio projeto, e (2) o dono não quer esse material de áudio publicado no GitHub. A solução foi `src/setupProxy.js`, que serve `/audio` diretamente da pasta de material via `express.static`, só em desenvolvimento. Confirmado como uso exclusivamente local (não há intenção de hospedar/publicar o app), então essa limitação é aceitável. Se algum dia precisar publicar o app, essa arquitetura de áudio precisa ser repensada (o servidor de produção não tem acesso a `Pre Intermediate and Intermediate/`).
- O script `scripts/sync-audios.js` foi removido — ele existia justamente para fazer a cópia que agora foi eliminada.
- Os índices `exercises_coords.json`/`answers_coords.json`/`audio_anchors_coords.json` são gerados por script (`gerar_indice_exercicios.py`/`gerar_indice_audio.py`) e não devem ser editados manualmente; se os PDFs de origem mudarem, rerodar o script relevante com `--force`.
- Ver também as memórias de sessão `exercise-crop-feature` e `verify-app-runs-on-port-3000` para detalhes de implementação e checagem de saúde do app.

---

Este resumo foi gerado para facilitar a transferência de contexto para outra IA ou para documentação rápida do projeto.
