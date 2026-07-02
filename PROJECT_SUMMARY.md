# Projeto PDF e Áudio - Resumo

## Visão geral

Aplicação web para estudo de inglês ("Let's Learn English") que combina um leitor de PDF customizado com uma biblioteca de áudios organizada por unidades de vocabulário (livro Pre-Intermediate/Intermediate, 100 unidades).

## Estrutura do projeto

- `meu-leitor-pdf/`
  - Aplicação React (Create React App), todo o código-fonte em `src/App.js` (arquivo único, sem componentes separados em arquivos próprios).
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
    - **Não copia nem duplica arquivo nenhum** — nem áudio nem PDF nunca existem dentro de `meu-leitor-pdf/public/`, portanto nunca vão para o git/GitHub.
    - Só funciona em desenvolvimento (`npm start`). Não existe suporte a `npm run build` + hospedagem, porque não há servidor em produção para expor esses arquivos (decisão consciente: o app é de uso local apenas).

- `Pre Intermediate and Intermediate/EVIU_P_I/`
  - Pasta de material bruto (PDFs e MP3s originais), **ignorada pelo git** (`.gitignore`: `Pre Intermediate and Intermediate/`).
  - É a **única fonte** de áudios e PDFs em tempo de execução (servida ao vivo pelo `setupProxy.js`), não existe mais nenhuma cópia em `public/`.

- Arquivo `npx` na raiz: arquivo vazio (0 bytes), resquício de execução acidental de `npx` sem argumentos — não tem função no projeto.

## Funcionalidade do app (`src/App.js`)

### Navegação
Estado `activePage` controla 4 "páginas" renderizadas condicionalmente (sem router):
- **home** — landing page com texto motivacional de boas-vindas.
- **courses** — lista de cursos disponíveis (hoje: "Vocabulary - English Pre Intermediate" + um placeholder "Course 2").
- **vocabulary** — grade com os 100 links de unidade (`unitTable`, mapeando número → tema, ex.: "1: Learning vocabulary", "24: Food", "100: Abbreviations").
- **unit** — tela de estudo de uma unidade específica (layout de 3 painéis).

### Tela de unidade (layout de 3 painéis redimensionáveis)
- Painel esquerdo: lista de áudios da unidade (carregados via `manifest.json`, com fallback de probing por letras A-F caso o manifest falhe).
- Painel central: leitor de PDF (`PdfWorkspace`). Ao entrar na Unit N, carrega automaticamente `/materials/unit_N/EVIU_PI-N_L.pdf` (o arquivo terminado em `_L`, confirmado presente nas 100 unidades). O usuário ainda pode trocar por um PDF local via upload (`URL.createObjectURL`) — o auto-load só é reaplicado ao trocar de unidade/reentrar na página. Toolbar customizada (zoom, navegação de página, busca, alternância texto/mão, fullscreen, download, print) e plugin de highlight por seleção de texto.
- Painel direito: seção "Relacionados" (atualmente placeholder estático).
- Painéis são redimensionáveis por arraste (handlers de `pointerdown/pointermove/pointerup` com clamping de largura mínima/máxima), implementado manualmente em `App.js` — não usa a lib `react-resizable-panels` já instalada.

### Áudio
- Cada unidade tenta primeiro `fetch('/audio/unit_N/manifest.json')` — como não existe mais `manifest.json` (não há geração de manifest, ver acima), essa chamada sempre cai no fallback.
- Fallback (caminho real usado hoje): sonda arquivos `U_00N.{A..F}.mp3` via `HEAD` request; `setupProxy.js` responde 404 de verdade para as letras que não existem, então só as que existem de fato aparecem na lista.
- Título de cada player é formatado a partir do nome do arquivo (`formatAudioTitle`).

## Histórico de processamento de conteúdo (pré-processamento, fora do código React)

- PDFs originais `EVIU_PI-X.pdf` foram divididos em duas páginas cada (`_L` e `_E`) com `pypdf` (script `split_pdfs.py`, já removido do repositório).
- Áudios `U_XXX.Y.mp3` foram reorganizados de uma pasta única para pastas `unit_X` correspondentes (com correção de um erro que havia colocado tudo em `unit_100`).
- Total de unidades: 100. Total de arquivos em `EVIU_P_I`: 618 (contagem histórica).

## Histórico de commits recentes
Sequência de commits incrementais de trabalho ("Segundo Salve", "terceiro Salve", "quarto Salve") sem mensagens descritivas — indicam iterações de ajuste fino de UI/UX sobre o mesmo código, sem mudanças estruturais grandes documentadas individualmente.

## Como usar

- Rodar o app: `cd meu-leitor-pdf && npm install && npm start` (a pasta `Pre Intermediate and Intermediate/` precisa existir no nível acima de `meu-leitor-pdf/`, como já está hoje).
- Adicionar/atualizar áudios: basta colocar os arquivos `U_XXX.Y.mp3` dentro da pasta `unit_X` correspondente em `Pre Intermediate and Intermediate/EVIU_P_I/` — nada para sincronizar ou copiar, o dev server já lê dali.
- **Não existe build de produção funcional para os áudios**: `npm run build` gera o app, mas os áudios não vão junto (decisão intencional, ver abaixo).

## Observações para outra IA

- Não existe roteamento real (react-router); tudo é estado local (`activePage`, `selectedUnit`) em um único componente `App`.
- `react-resizable-panels` está no `package.json` mas não é usado — o redimensionamento é caseiro. Se for refatorar o layout, considerar migrar para a lib já instalada em vez de manter a lógica manual.
- **Decisão importante (2026-07-02)**: os áudios foram removidos de `public/audio/` (419 arquivos que tinham acabado de ser commitados, mas ainda não haviam sido enviados ao GitHub) porque (1) duplicavam arquivo que já existe em `Pre Intermediate and Intermediate/` dentro do próprio projeto, e (2) o dono não quer esse material de áudio publicado no GitHub. A solução foi `src/setupProxy.js`, que serve `/audio` diretamente da pasta de material via `express.static`, só em desenvolvimento. Confirmado como uso exclusivamente local (não há intenção de hospedar/publicar o app), então essa limitação é aceitável. Se algum dia precisar publicar o app, essa arquitetura de áudio precisa ser repensada (o servidor de produção não tem acesso a `Pre Intermediate and Intermediate/`).
- O script `scripts/sync-audios.js` foi removido — ele existia justamente para fazer a cópia que agora foi eliminada.

---

Este resumo foi gerado para facilitar a transferência de contexto para outra IA ou para documentação rápida do projeto.
