// Busca (e cacheia em disco) o áudio de pronúncia em inglês de uma palavra
// OU frase do My Words — ver App.js (WordAudioButton) e setupProxy.js
// (rota /pronunciation-audio).
//
// Histórico: a 1ª versão desta feature raspava o Cambridge Dictionary com
// Playwright (Chromium headless) — pronúncia de dicionário "de verdade",
// mas ~5-6s por palavra nova (custo de abrir um navegador inteiro) e só
// cobria palavra única (Cambridge não tem entrada confiável pra frase).
// Substituído a pedido do dono, 2026-07-25, pelo endpoint de
// Text-to-Speech do Google Translate (o mesmo usado por baixo dos panos
// pela lib Python gTTS): devolve o mp3 direto numa requisição HTTP simples,
// sem navegador — ~150-350ms por palavra nova (medido; ~15-20x mais
// rápido) e funciona igual bem pra frase inteira, não só palavra isolada.
// Contra (aceito pelo dono): é voz sintetizada, não uma gravação humana
// real como o Cambridge.
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// Fica em meu-leitor-pdf/pronunciation-cache/, IRMÃ de src/ (não dentro) —
// se ficasse em src/, cada escrita em runtime disparava o watcher do
// webpack/CRA e recarregava a página sozinha. Ignorada no git (cache
// local, não dado de curso).
const CACHE_ROOT = path.join(__dirname, '..', 'pronunciation-cache');
const AUDIO_DIR = path.join(CACHE_ROOT, 'audio');
const INDEX_PATH = path.join(CACHE_ROOT, 'index.json');

const normalizeText = (text) => String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');

const ensureCacheDirs = () => {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
};

const loadIndex = () => {
  ensureCacheDirs();
  try {
    return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  } catch (error) {
    return {};
  }
};

const saveIndex = (index) => {
  ensureCacheDirs();
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
};

// Nome de arquivo a partir do texto: um slug legível (útil pra inspecionar
// a pasta à mão) + um hash curto do texto normalizado, pra garantir
// unicidade mesmo com frases longas/pontuação (que o slug sozinho
// truncaria/colidiria) — o índice em index.json é a fonte de verdade, o
// nome do arquivo é só cosmético.
const fileNameFor = (text) => {
  const slug = text.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'audio';
  const hash = crypto.createHash('md5').update(text).digest('hex').slice(0, 8);
  return `${slug}-${hash}.mp3`;
};

// O endpoint clássico (não-oficial, mesmo usado pela lib gTTS) do Google
// Translate TTS — devolve o mp3 direto no corpo da resposta. Limite de
// ~200 caracteres por chamada (mesmo da lib gTTS); não é um problema real
// aqui (frases do My Words são curtas), mas trunca em vez de falhar caso
// algum dia entre um texto maior.
const GOOGLE_TTS_URL = 'https://translate.google.com/translate_tts';
const MAX_TTS_CHARS = 200;
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const fetchTtsAudio = (text) => new Promise((resolve, reject) => {
  const truncated = text.length > MAX_TTS_CHARS ? text.slice(0, MAX_TTS_CHARS) : text;
  const url = `${GOOGLE_TTS_URL}?ie=UTF-8&q=${encodeURIComponent(truncated)}&tl=en&client=tw-ob`;
  https.get(url, { headers: { 'User-Agent': BROWSER_USER_AGENT } }, (response) => {
    const contentType = response.headers['content-type'] || '';
    if (response.statusCode !== 200 || !contentType.includes('audio')) {
      response.resume();
      reject(new Error(`TTS request failed: status ${response.statusCode}, content-type ${contentType}`));
      return;
    }
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => resolve(Buffer.concat(chunks)));
    response.on('error', reject);
  }).on('error', reject);
});

// Dedup de requisições concorrentes pro mesmo texto (ex.: o auto-warm do
// handleAddWord e um clique manual quase simultâneo).
const inFlight = new Map();

// Resolve o caminho local do mp3 de uma palavra/frase, gerando e cacheando
// na primeira vez. Propaga erro (não cacheia falha) se o request ao Google
// falhar — diferente da versão antiga do Cambridge, aqui não existe um
// "não achei" permanente: qualquer texto válido gera algum áudio, então um
// erro é sempre transitório (rede) e vale tentar de novo no próximo clique.
async function getPronunciationAudioPath(text) {
  const key = normalizeText(text);
  if (!key) return null;
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = (async () => {
    const index = loadIndex();
    const cached = index[key];
    if (cached) {
      const filePath = path.join(AUDIO_DIR, cached.file);
      if (fs.existsSync(filePath)) return filePath;
      // Arquivo do cache sumiu (pasta limpa à mão) — gera de novo abaixo.
    }

    const audioBuffer = await fetchTtsAudio(key);
    const fileName = fileNameFor(key);
    const filePath = path.join(AUDIO_DIR, fileName);
    fs.writeFileSync(filePath, audioBuffer);
    index[key] = { file: fileName, cachedAt: Date.now() };
    saveIndex(index);
    return filePath;
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

module.exports = { getPronunciationAudioPath, normalizeText };
