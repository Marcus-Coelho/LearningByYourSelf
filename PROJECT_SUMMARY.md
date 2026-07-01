# Projeto PDF e Áudio - Resumo

## Estrutura do projeto

- `meu-leitor-pdf/`
  - Aplicação React criada com Create React App.
  - Dependências principais:
    - `react`, `react-dom`, `react-scripts`
    - `@react-pdf-viewer/core`, `@react-pdf-viewer/default-layout`, `@react-pdf-viewer/highlight`
  - Scripts:
    - `npm start`
    - `npm run build`
    - `npm test`

- `Pre Intermediate and Intermediate/EVIU_P_I/`
  - Pasta principal de material PDF e áudio.
  - Contém 100 subpastas: `unit_1` a `unit_100`.
  - Contém arquivos PDF e MP3 relacionados ao material EVIU.

- `split_pdfs.py`
  - Script Python usado para dividir arquivos PDF de duas páginas em duas saídas:
    - `EVIU_PI-X_L.pdf` (primeira página)
    - `EVIU_PI-X_E.pdf` (segunda página)
  - Usa a biblioteca `pypdf`.

## Conteúdo e processamento realizado

> Observação: os procedimentos de preparação de pastas e organização de arquivos foram realizados como etapas de pré-processamento para tornar o conteúdo utilizável no sistema web app. Esses ajustes não fazem parte do código do projeto React em si.

### Arquivos PDF

- Os arquivos originais estavam nomeados como `EVIU_PI-X.pdf` dentro das pastas `unit_X`.
- Foi feito o split de cada arquivo PDF em duas páginas para uso dentro do app.
- Cada unidade `unit_X` recebeu:
  - `EVIU_PI-X_L.pdf`
  - `EVIU_PI-X_E.pdf`

### Arquivos de áudio

- Os arquivos de áudio estavam originalmente na pasta principal `EVIU_P_I` com nomes no formato `U_XXX.Y.mp3`.
  - `XXX` é o índice da unidade, com três dígitos.
  - `Y` é uma letra que indica variação (`A`, `B`, `C`, `D`, etc.).
- Eles foram organizados em pastas `unit_X` correspondentes para facilitar o consumo pelo app.
- Um erro temporário foi corrigido, onde todos os MP3s foram movidos para `unit_100` em vez de suas pastas corretas.
- No final, cada arquivo `U_XXX.Y.mp3` foi realocado para `unit_XXX`.

## Resultados

- Total de pastas de unidade: 100 (`unit_1` a `unit_100`).
- Total de arquivos contados em `EVIU_P_I` com todas as subpastas: **618**.
- Arquivos MP3 em `unit_100` após correção: apenas `U_100.A.mp3`, `U_100.B.mp3`, `U_100.C.mp3` e `U_100.D.mp3`.
- A apresentação do web app foi atualizada com um título de página de aprendizado e um menu "Vocabulary" com submenus `Unit 1` a `Unit 100`.
- O menu principal foi ajustado visualmente: `Link 1` foi simplificado para um item normal e o conjunto do header foi refinado para manter alinhamento uniforme entre logo e links.
- O menu Vocabulary agora abre em um painel amplo e legível, dividido em 10 colunas de `Unit 1-10` a `Unit 91-100`.
- O menu dropdown agora abre suavemente, mantém o submenu visível sem gap ao mover o mouse, e inclui um indicador de seta para baixo.

## Observações para outra IA

- O projeto possui duas partes principais:
  1. Aplicação React em `meu-leitor-pdf/`.
  2. Material didático em `Pre Intermediate and Intermediate/EVIU_P_I/`.
- A parte de conteúdo está organizada por unidades em pastas numeradas.
- O processamento inclui limpeza de nomes, reorganização de arquivos e criação de novos ativos derivados.
- O arquivo `PROJECT_SUMMARY.md` contém o resumo das ações importantes já realizadas.

## Como usar

- Para ver a aplicação React, abra `meu-leitor-pdf/` e instale dependências com `npm install`.
- Para entender a divisão de PDF, leia `split_pdfs.py`.
- Para confirmar a distribuição de arquivos, conte os arquivos em `Pre Intermediate and Intermediate/EVIU_P_I`.

---

Este resumo foi gerado para facilitar a transferência de contexto para outra IA ou para documentação rápida do projeto.
