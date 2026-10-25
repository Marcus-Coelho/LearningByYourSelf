// Servidor local de INICIALIZAÇÃO RÁPIDA do app (usado por StartLearning.bat no PC).
//
// Por que existe: `npm start` (react-scripts) recompila o App.js inteiro a cada abertura — ~15 s com o cache quente
// e minutos com o cache frio (depois de reiniciar o PC, antivírus, OneDrive). Aqui o build JÁ PRONTO (pasta build/)
// é servido direto, junto com as MESMAS rotas de áudio/PDF/pronúncia/Ask AI de src/setupProxy.js — o abrir cai pra ~1 s.
//
//   node serve-local.js --check   -> sai com 0 se o build está em dia, 3 se faltando/desatualizado (StartLearning.bat
//                                    cai no `npm start`, que sempre reflete o código atual)
//   node serve-local.js           -> sobe o servidor na porta PORT (padrão 3000)
//
// "Desatualizado" = algum arquivo de src/ ou public/ mais novo que build/index.html. Rodar `npm run build` depois de
// mexer no código mantém o atalho rápido.
const fs = require('fs');
const path = require('path');
const express = require('express');

const root = __dirname;
const buildDir = path.join(root, 'build');
const indexFile = path.join(buildDir, 'index.html');

function newestMtime(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const time = entry.isDirectory() ? newestMtime(full) : fs.statSync(full).mtimeMs;
    if (time > newest) newest = time;
  }
  return newest;
}

function buildIsFresh() {
  if (!fs.existsSync(indexFile)) return false;
  const builtAt = fs.statSync(indexFile).mtimeMs;
  const sourceAt = Math.max(newestMtime(path.join(root, 'src')), newestMtime(path.join(root, 'public')));
  return builtAt >= sourceAt;
}

if (process.argv.includes('--check')) {
  process.exit(buildIsFresh() ? 0 : 3);
}

// Mesmo .env.local que o react-scripts carrega no `npm start` (GEMINI_API_KEY da tela Ask AI).
try {
  require('dotenv').config({ path: path.join(root, '.env.local') });
} catch (error) {
  // dotenv ausente: segue sem chave (só a tela Ask AI responde erro 500, como sempre).
}

const app = express();
require('./src/setupProxy')(app);
app.use(express.static(buildDir));
// Sem rotas no app (state machine): qualquer outro caminho devolve o index.html.
app.get('*', (req, res) => {
  // Durante um `npm run build` a pasta build/ é apagada e recriada: sem este tratamento a página mostrava
  // "ENOENT ... build\index.html". Agora espera e recarrega sozinha.
  if (!fs.existsSync(indexFile)) {
    res.status(503).send('<meta http-equiv="refresh" content="3"><body style="font-family:sans-serif;padding:40px">O app está sendo atualizado (build em andamento). Esta página recarrega sozinha em instantes...</body>');
    return;
  }
  res.sendFile(indexFile);
});

const port = Number(process.env.PORT) || 3000;
// Sem host explícito o Node escuta em "::" (IPv6 + IPv4): "localhost" abre na hora, sem o atraso de ~2 s do
// navegador tentando ::1 e caindo pro IPv4.
app.listen(port, () => {
  console.log(`Let's Learn English em http://localhost:${port} (build pronto, sem recompilar)`);
});
