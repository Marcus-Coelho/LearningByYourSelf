// Backend da tela "Ask AI" (menu principal): manda a pergunta de gramática
// pro Gemini (Google AI Studio, tier gratuito) e devolve só o texto da
// resposta — ver setupProxy.js (rota POST /api/ask-grammar) e App.js
// (handleAskAiSubmit).
//
// A chave (`GEMINI_API_KEY`) vem de meu-leitor-pdf/.env.local (gitignored,
// nunca commitada). Nome SEM o prefixo `REACT_APP_` de propósito — o CRA só
// expõe pro bundle do navegador variáveis com esse prefixo; sem ele, a
// chave existe só no processo Node do dev server (onde este módulo roda),
// nunca chega no cliente.
const https = require('https');

// Alias que a Google sempre aponta pro modelo "flash" atual — evita quebrar
// quando uma versão fixa é descontinuada (testado: `gemini-2.5-flash`
// parou de aceitar contas novas pouco depois de virar a recomendação nas
// buscas, `gemini-flash-latest` continuou funcionando).
//
// O limite gratuito é por PROJETO e por MODELO ("GenerateRequestsPerDayPerProjectPerModel",
// 20/dia no flash — medido em 2026-10-12), então cada modelo tem a própria cota.
// Por isso é uma LISTA em ordem de preferência: estourou um (429) ou saiu do ar (404),
// a mesma pergunta segue pro próximo. Os "lite" foram testados e respondem (200).
// Troca/ordem por `GEMINI_MODELS` no .env.local (ids separados por vírgula).
const DEFAULT_MODELS = ['gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const getModels = () => {
  const fromEnv = String(process.env.GEMINI_MODELS || '').split(',').map((m) => m.trim()).filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_MODELS;
};
const MAX_QUESTION_CHARS = 500;
const MAX_PREVIOUS_ANSWER_CHARS = 2000;

// Estilo pedido pelo dono (2026-07-25), depois de mostrar uma resposta de
// outra IA que ele gostou: didática/completa (regra + exemplos + exceções +
// dica), não só uma frase curta. Markdown-lite (### / **bold** / "- ") é
// renderizado à mão no front (ver renderAdeleMarkdown em App.js) — nunca
// usar sintaxe além dessas 3, o renderer não cobre mais nada.
const SYSTEM_INSTRUCTION = [
  'Your name is Adele, a friendly American English tutor from the United States, inside a language-learning app.',
  'If asked your name or where you are from, answer as Adele, from the USA.',
  'Help with any question related to learning English: grammar, vocabulary, pronunciation, idioms, usage, common mistakes, or general questions about the language.',
  'The user is an English learner, so their question itself may contain grammar, spelling, or phrasing mistakes.',
  'If it does, start your reply with a short correction — one line, e.g. "Corrected: <the fixed question>" — before answering normally. Do not add this line if the question was already correct.',
  'Be a thorough, encouraging tutor: confirm what is right, explain the rule clearly, give 2-3 short examples, and explicitly call out any important exceptions. Offer a helpful tip when it fits.',
  'You may use simple Markdown for structure: "### " for a short section heading, "**text**" for bold, and "- " for bullet points. Keep it organized and skimmable, not a wall of text.',
  'The user may attach an image (usually a photo or screenshot of a page from a course book, an exercise, or something written in English). When there is an image, read the English in it carefully and answer about what you actually see; if the question is vague ("what is wrong here?"), explain the relevant grammar or correct the mistakes you find, quoting the sentences you are talking about. If you cannot read the image clearly, say so instead of guessing.',
  'You have a short memory of only the single most recent exchange (given below as conversation history, if any). Use it only if the new message is clearly a follow-up, or an attempt to answer something you previously asked; ignore it if the new question is unrelated. That history is text only — an image from an earlier question is not available to you any more, so ask the user to attach it again if you need it.',
  'Occasionally (not every single time), end your answer with ONE short follow-up challenge for the user to try, like a fill-in-the-blank sentence. If their next message looks like an attempt at that challenge, evaluate it (say if it is correct, and why) using the conversation history.',
  'Answer in English. If the question is not related to learning English, politely say you can only help with English language questions.',
].join(' ');

const requestGemini = (payload, apiKey, model) => new Promise((resolve, reject) => {
  const body = JSON.stringify(payload);
  const req = https.request({
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      if (res.statusCode !== 200) {
        const failure = new Error(`Gemini request failed: ${res.statusCode} ${data.slice(0, 300)}`);
        failure.statusCode = res.statusCode;
        reject(failure);
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
  });
  req.on('error', reject);
  req.write(body);
  req.end();
});

// O tier gratuito responde 503 ("high demand") de forma INTERMITENTE — medido em
// 2026-10-12: a mesma pergunta dava 200, 200, 200, 503 em sequência. Sem nova
// tentativa, qualquer pico virava "Could not get an answer".
// Repete só o que é transitório (503/500/504 e erro de rede, que não tem
// statusCode). NÃO repete 429: o limite do plano gratuito é de 20 pedidos POR DIA
// por modelo, e repetir não resolve (só gasta). Chave inválida (400/403) também
// falha na hora.
const RETRYABLE_STATUS = new Set([500, 503, 504]);
const MAX_ATTEMPTS = 3;
const requestGeminiWithRetry = async (payload, apiKey, model) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await requestGemini(payload, apiKey, model);
    } catch (error) {
      const transient = !error.statusCode || RETRYABLE_STATUS.has(error.statusCode);
      if (!transient || attempt >= MAX_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
};

// Percorre modelo × chave (chave dentro do modelo: outro projeto tem cota própria).
// Só 429 (cota) e 404 (modelo aposentado) passam pra próxima combinação; qualquer
// outro erro (chave inválida, 400) para na hora, porque trocar de modelo não resolve.
// `apiKeys` aceita string ou lista (GEMINI_API_KEY, GEMINI_API_KEY_2...).
const requestGeminiAnyModel = async (payload, apiKeys) => {
  const keys = [].concat(apiKeys).filter(Boolean);
  let lastError = null;
  for (const model of getModels()) {
    for (const key of keys) {
      try {
        return await requestGeminiWithRetry(payload, key, model);
      } catch (error) {
        lastError = error;
        if (error.statusCode !== 429 && error.statusCode !== 404) throw error;
      }
    }
  }
  throw lastError;
};

// Converte a data URL que o navegador manda ("data:image/jpeg;base64,...")
// no formato inlineData que a API do Gemini espera. Devolve null se não for
// uma data URL de imagem reconhecível — a pergunta segue sem a imagem, em
// vez de quebrar a requisição inteira.
const parseImageDataUrl = (dataUrl) => {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(String(dataUrl || '').trim());
  if (!match) return null;
  return { mimeType: match[1].toLowerCase(), data: match[2].replace(/\s+/g, '') };
};

// previousExchange = { question, answer } do turno anterior (ou null/
// undefined) — a "memória" da Adele é sempre só esse ÚLTIMO turno, nunca um
// histórico crescente (pedido do dono: Q&A avulso, mas com contexto
// suficiente pra ela poder propor um desafio e depois avaliar a resposta).
// `image` (data URL, opcional) é a foto/print anexado à pergunta ATUAL —
// nunca entra no histórico reenviado (ver App.js, askAiLastExchange).
async function askGrammarQuestion(question, apiKey, previousExchange, image) {
  const inlineImage = image ? parseImageDataUrl(image) : null;
  const trimmed = String(question || '').trim().slice(0, MAX_QUESTION_CHARS);
  // Com imagem, uma pergunta vazia é legítima ("olha isso aqui") — manda um
  // texto padrão pra o modelo saber o que fazer com a foto sozinha.
  const promptText = trimmed
    || (inlineImage ? 'Please look at this image and explain the English in it. Correct any mistakes you find.' : '');
  if (!promptText) return '';
  const contents = [];
  if (previousExchange?.question && previousExchange?.answer) {
    contents.push({ role: 'user', parts: [{ text: String(previousExchange.question).slice(0, MAX_QUESTION_CHARS) }] });
    contents.push({ role: 'model', parts: [{ text: String(previousExchange.answer).slice(0, MAX_PREVIOUS_ANSWER_CHARS) }] });
  }
  const currentParts = [{ text: promptText }];
  if (inlineImage) currentParts.push({ inlineData: inlineImage });
  contents.push({ role: 'user', parts: currentParts });
  const payload = {
    contents,
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
  };
  const data = await requestGeminiAnyModel(payload, apiKey);
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || '')
    .join('')
    .trim();
  return text || "Sorry, I couldn't come up with an answer for that — try rephrasing your question.";
}

module.exports = { askGrammarQuestion };
