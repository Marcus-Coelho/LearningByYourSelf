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
const GEMINI_MODEL = 'gemini-flash-latest';
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
  'You have a short memory of only the single most recent exchange (given below as conversation history, if any). Use it only if the new message is clearly a follow-up, or an attempt to answer something you previously asked; ignore it if the new question is unrelated.',
  'Occasionally (not every single time), end your answer with ONE short follow-up challenge for the user to try, like a fill-in-the-blank sentence. If their next message looks like an attempt at that challenge, evaluate it (say if it is correct, and why) using the conversation history.',
  'Answer in English. If the question is not related to learning English, politely say you can only help with English language questions.',
].join(' ');

const requestGemini = (payload, apiKey) => new Promise((resolve, reject) => {
  const body = JSON.stringify(payload);
  const req = https.request({
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      if (res.statusCode !== 200) {
        reject(new Error(`Gemini request failed: ${res.statusCode} ${data.slice(0, 300)}`));
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

// previousExchange = { question, answer } do turno anterior (ou null/
// undefined) — a "memória" da Adele é sempre só esse ÚLTIMO turno, nunca um
// histórico crescente (pedido do dono: Q&A avulso, mas com contexto
// suficiente pra ela poder propor um desafio e depois avaliar a resposta).
async function askGrammarQuestion(question, apiKey, previousExchange) {
  const trimmed = String(question || '').trim().slice(0, MAX_QUESTION_CHARS);
  if (!trimmed) return '';
  const contents = [];
  if (previousExchange?.question && previousExchange?.answer) {
    contents.push({ role: 'user', parts: [{ text: String(previousExchange.question).slice(0, MAX_QUESTION_CHARS) }] });
    contents.push({ role: 'model', parts: [{ text: String(previousExchange.answer).slice(0, MAX_PREVIOUS_ANSWER_CHARS) }] });
  }
  contents.push({ role: 'user', parts: [{ text: trimmed }] });
  const payload = {
    contents,
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
  };
  const data = await requestGemini(payload, apiKey);
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || '')
    .join('')
    .trim();
  return text || "Sorry, I couldn't come up with an answer for that — try rephrasing your question.";
}

module.exports = { askGrammarQuestion };
