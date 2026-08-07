// Tela "Grammar & Vocabulary Exercises" — quiz de múltipla escolha só de
// texto (sem PDF, sem áudio), separado do Grammar English A1/English
// Vocabulary B "de verdade" (que continuam intactos, PDF+áudio unit por
// unit). Arquivo PRÓPRIO (não dentro de App.js) de propósito — pedido do
// dono ao encomendar >100 exercícios de uma vez: o volume de dados+UI
// dessa feature sozinha inflaria App.js/App.css significativamente, contra
// a prática do resto do projeto (tudo num arquivo só — ver CLAUDE.md) só
// que sem essa exceção o arquivo ficaria didaticamente pior de navegar.
// Import via <script src> comum do CRA (App.js só importa o componente
// default), CSS próprio (GrammarVocabExercises.css, importado abaixo) —
// zero linhas novas em App.css.
//
// Dados: grammar_vocab_exercises_grammar.json (200 exercícios, 2 por unit,
// units 1-100 de "Essential Grammar in Use" — escritos à mão a partir dos
// títulos reais de grammar_elem_index.json, já que o app não tem o texto
// das lições extraído, só os títulos) e grammar_vocab_exercises_vocab.json
// (200 exercícios, 1-3 por unit nas units 4-100 de English Vocabulary B —
// as 3 primeiras units não têm faixa de Listening pra tirar uma frase de
// verdade, ver script gerador no scratchpad da sessão). Vocabulary é
// gerado por script (SEMPRE grounded em dado real: palavra-alvo real de
// vocabulary_target_words.json numa frase real de listening_vocabulary.json,
// nunca inventado — os distratores preferem a mesma "categoria" heurística
// da resposta certa, ver roughCategory no script gerador, e nunca são
// números/contrações soltas, pra não ficarem óbvios demais de descartar).
// Revisão manual adicional depois de 2 rodadas de feedback do dono: sentenças
// que são só LISTAS de palavras do PDF (ex. "Forehead, cheek, ___, neck...")
// viram exercício ambíguo (qualquer item da lista serve) — trocadas por uma
// frase de verdade quando havia uma disponível pro mesmo unit/palavra-alvo;
// distratores quase-sinônimos da resposta certa (ex. "totally"/"absolutely"
// pra "completely", "focus"/"concentrate" pra "work") também foram trocados
// por palavras plausíveis mas que mudam o sentido, não só o registro —
// Grammar é escrito à mão porque o app não tem o texto das lições, só os
// títulos reais das units.
import { useEffect, useState } from 'react';
import { userKey } from './App';
import grammarExercises from './grammar_vocab_exercises_grammar.json';
import vocabExercises from './grammar_vocab_exercises_vocab.json';
import similarBlocks from './grammar_vocab_exercises_similar.json';
import './GrammarVocabExercises.css';

const GRAMMAR_VOCAB_EXERCISES_POSITION_KEY = 'grammarVocabExercisesPosition';

const loadSavedActiveSourceId = () => {
  try {
    const raw = window.sessionStorage.getItem(GRAMMAR_VOCAB_EXERCISES_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.activeSourceId || null;
  } catch (error) {
    return null;
  }
};

// `kind` distingue as duas MECÂNICAS de exercício desta tela:
// - 'multipleChoice' (as 2 seções originais): lista plana de cards, clicar
//   numa opção e checar.
// - 'written' (seção "Similar Exercises from Grammar Elementary"): blocos
//   de itens onde o aluno DIGITA a resposta. Não é multiple choice de
//   propósito — os 2 últimos exercícios de cada unit do "Essential Grammar
//   in Use" (os que essa seção imita) são todos de PRODUÇÃO, não de escolha,
//   e é justamente isso que os torna mais difíceis que os primeiros.
const SOURCES = [
  {
    id: 'grammar',
    kind: 'multipleChoice',
    title: 'Grammar English A1',
    description: 'Multiple-choice practice, two per grammar point — Essential Grammar in Use, units 1-100.',
    exercises: grammarExercises,
  },
  {
    id: 'vocabulary',
    kind: 'multipleChoice',
    title: 'English Vocabulary B',
    description: 'Fill in the blank with the right word, using real sentences from the course.',
    exercises: vocabExercises,
  },
  {
    id: 'similar',
    kind: 'written',
    title: 'Similar Exercises from Grammar Elementary',
    description: 'Harder, write-in practice modelled on the last exercises of every unit of the book — you type the answer, not choose it.',
    blocks: similarBlocks,
  },
];

// Normalização pra comparar o que o aluno digitou com o gabarito: o livro
// aceita variações (o próprio Key to Exercises lista "It isn't/it's not big
// enough", "nobody/no-one"), então cada item traz um ARRAY de respostas
// aceitas e a comparação ignora o que não é erro de gramática:
// maiúsculas, espaço sobrando, ponto final e o tipo de apóstrofo (o teclado
// do aluno digita ' reto, o texto do livro usa ’ curvo — sem isso "I'd buy"
// nunca casaria com "I’d buy").
function normalizeWrittenAnswer(value) {
  return String(value || '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.?!]+$/, '')
    .toLowerCase();
}

function isWrittenAnswerCorrect(item, value) {
  const typed = normalizeWrittenAnswer(value);
  if (!typed) return false;
  return item.answers.some((answer) => normalizeWrittenAnswer(answer) === typed);
}

const answersStorageKey = (userName, courseId) => userKey(userName, `grammarVocabAnswers:${courseId}`);

function loadAnswers(userName, courseId) {
  if (!userName) return {};
  try {
    const raw = window.localStorage.getItem(answersStorageKey(userName, courseId));
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function saveAnswers(userName, courseId, answers) {
  if (!userName) return;
  try {
    window.localStorage.setItem(answersStorageKey(userName, courseId), JSON.stringify(answers));
  } catch (error) {
    // Armazenamento indisponível — segue funcionando, só sem persistir.
  }
}

// Duas etapas, não uma: clicar numa opção só SELECIONA (nem verde nem
// vermelho ainda) — a cor de certo/errado só aparece depois de "Check
// Answer" (pedido do dono: não entregar a resposta no primeiro clique).
// selectedOption é local (não precisa persistir — some se o usuário sair da
// tela sem checar); savedChoice (vindo do pai) é o que já foi CHECADO de
// verdade, esse sim persistido. "Show unit"/"Hide unit" revela a unit de
// origem do exercício sob demanda — escondida por padrão (pedido do dono).
function ExerciseCard({ exercise, savedChoice, onCheck }) {
  const [selectedOption, setSelectedOption] = useState(null);
  const [showUnit, setShowUnit] = useState(false);
  const checked = Boolean(savedChoice);

  const handleCheck = () => {
    if (!selectedOption) return;
    onCheck(selectedOption);
  };

  return (
    <div className="gve-card">
      {showUnit && (
        <span className="gve-card-unit">Unit {exercise.unit}{exercise.topic ? ` · ${exercise.topic}` : ''}</span>
      )}
      <p className="gve-card-prompt">{exercise.prompt}</p>
      <div className="gve-card-options">
        {exercise.options.map((option) => {
          let stateClass = '';
          if (checked) {
            if (option === exercise.answer) stateClass = ' is-correct';
            else if (option === savedChoice) stateClass = ' is-wrong';
          } else if (option === selectedOption) {
            stateClass = ' is-selected';
          }
          return (
            <button
              key={option}
              type="button"
              className={`gve-option${stateClass}`}
              disabled={checked}
              onClick={() => setSelectedOption(option)}
            >
              {option}
            </button>
          );
        })}
      </div>
      <div className="gve-card-actions">
        <button
          type="button"
          className="gve-check-btn"
          onClick={handleCheck}
          disabled={checked || !selectedOption}
        >
          Check Answer
        </button>
        <button type="button" className="gve-unit-toggle-btn" onClick={() => setShowUnit((value) => !value)}>
          {showUnit ? 'Hide unit' : 'Show unit'}
        </button>
      </div>
    </div>
  );
}

// Um BLOCO de exercício escrito (ex.: "54.4 — Write to or for", 10 itens):
// o aluno preenche o bloco todo e checa de uma vez, como se faz o exercício
// no livro, em vez de item por item. Depois de checar, cada item mostra
// verde/vermelho e os errados revelam a resposta do gabarito; "Try again"
// limpa só aquele bloco.
// O estado persistido é o mesmo mapa plano das outras 2 seções (ver
// loadAnswers): o id do BLOCO guarda o marcador 'checked' e o id de cada
// ITEM guarda o texto digitado — os ids nunca colidem ("similar-unit-5" vs
// "similar-5-1").
function WrittenExerciseBlock({ block, index, total, savedAnswers, onCheck, onReset }) {
  const checked = savedAnswers[block.id] === 'checked';
  const [drafts, setDrafts] = useState(() => {
    const initial = {};
    block.items.forEach((item) => { initial[item.id] = savedAnswers[item.id] || ''; });
    return initial;
  });
  const [showUnit, setShowUnit] = useState(false);

  const values = checked ? savedAnswers : drafts;
  const filledCount = block.items.filter((item) => (values[item.id] || '').trim()).length;
  const correctCount = block.items.filter((item) => isWrittenAnswerCorrect(item, values[item.id])).length;

  const handleReset = () => {
    const cleared = {};
    block.items.forEach((item) => { cleared[item.id] = ''; });
    setDrafts(cleared);
    onReset();
  };

  return (
    <div className="gve-card gve-block">
      <div className="gve-block-head">
        <span className="gve-card-unit">
          Exercise {index + 1} of {total}
          {showUnit ? ` · Unit ${block.unit} · ${block.topic}` : ''}
        </span>
        <p className="gve-block-instruction">{block.instruction}</p>
        {/* A instrução ORIGINAL do livro (extraída do PDF da unit) fica atrás
            do "Show unit" junto com a unit: é a prova de qual exercício este
            aqui imita, mas entregá-la de cara às vezes daria a resposta. */}
        {showUnit && block.bookInstruction && (
          <p className="gve-block-source">In the book: “{block.bookInstruction}”</p>
        )}
        {block.wordBank && (
          <div className="gve-word-bank">
            {block.wordBank.map((word) => (
              <span key={word} className="gve-word-bank-item">{word}</span>
            ))}
          </div>
        )}
      </div>

      <ol className="gve-block-items">
        {block.items.map((item) => {
          const value = values[item.id] || '';
          const isCorrect = isWrittenAnswerCorrect(item, value);
          let stateClass = '';
          if (checked) stateClass = isCorrect ? ' is-correct' : ' is-wrong';
          return (
            <li key={item.id} className="gve-block-item">
              <span className="gve-item-prompt">
                {item.prompt}
                {item.hint && <em className="gve-item-hint"> {item.hint}</em>}
              </span>
              <input
                type="text"
                className={`gve-item-input${stateClass}`}
                value={value}
                onChange={(event) => setDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))}
                disabled={checked}
                placeholder="Your answer"
                autoComplete="off"
                spellCheck="false"
              />
              {checked && !isCorrect && (
                <span className="gve-item-answer">{item.answers.join(' / ')}</span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="gve-card-actions">
        {!checked ? (
          <button
            type="button"
            className="gve-check-btn"
            onClick={() => onCheck(drafts)}
            disabled={filledCount === 0}
          >
            Check answers
          </button>
        ) : (
          <>
            <span className="gve-block-score">{correctCount} / {block.items.length} correct</span>
            <button type="button" className="gve-unit-toggle-btn" onClick={handleReset}>
              Try again
            </button>
          </>
        )}
        <button type="button" className="gve-unit-toggle-btn" onClick={() => setShowUnit((value) => !value)}>
          {showUnit ? 'Hide unit' : 'Show unit'}
        </button>
      </div>
    </div>
  );
}

export default function GrammarVocabExercisesPage({ userName }) {
  const [activeSourceId, setActiveSourceId] = useState(loadSavedActiveSourceId);
  const [resetToken, setResetToken] = useState(0);
  // Filtro da seção escrita: são 115 exercícios (um por unit do livro), longe
  // demais pra rolar até a unit que se está estudando. Só filtra a EXIBIÇÃO —
  // placar e progresso continuam contando a seção inteira.
  const [blockFilter, setBlockFilter] = useState('');
  const [answersBySource, setAnswersBySource] = useState(() => ({
    grammar: loadAnswers(userName, 'grammar'),
    vocabulary: loadAnswers(userName, 'vocabulary'),
    similar: loadAnswers(userName, 'similar'),
  }));

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        GRAMMAR_VOCAB_EXERCISES_POSITION_KEY,
        JSON.stringify({ activeSourceId }),
      );
    } catch (error) {
      // Ignore storage errors.
    }
  }, [activeSourceId]);

  const activeSource = SOURCES.find((source) => source.id === activeSourceId) || null;

  const handleCheckAnswer = (exercise, option) => {
    setAnswersBySource((prev) => {
      const next = { ...prev, [activeSourceId]: { ...prev[activeSourceId], [exercise.id]: option } };
      saveAnswers(userName, activeSourceId, next[activeSourceId]);
      return next;
    });
  };

  // Seção escrita: grava de uma vez o texto digitado em cada item do bloco
  // + o marcador 'checked' do próprio bloco (ver WrittenExerciseBlock).
  const handleCheckBlock = (block, drafts) => {
    setAnswersBySource((prev) => {
      const merged = { ...prev.similar, [block.id]: 'checked' };
      block.items.forEach((item) => { merged[item.id] = drafts[item.id] || ''; });
      saveAnswers(userName, 'similar', merged);
      return { ...prev, similar: merged };
    });
  };

  const handleResetBlock = (block) => {
    setAnswersBySource((prev) => {
      const merged = { ...prev.similar };
      delete merged[block.id];
      block.items.forEach((item) => { delete merged[item.id]; });
      saveAnswers(userName, 'similar', merged);
      return { ...prev, similar: merged };
    });
  };

  const handleResetCourse = () => {
    setAnswersBySource((prev) => {
      const next = { ...prev, [activeSourceId]: {} };
      saveAnswers(userName, activeSourceId, {});
      return next;
    });
    // Entra na `key` dos blocos escritos pra forçar a remontagem: o texto
    // digitado vive num useState LOCAL de cada bloco (drafts), que zerar o
    // mapa do pai não alcança — sem isso, "Reset" limpava o placar mas
    // deixava as respostas antigas escritas nas caixas.
    setResetToken((token) => token + 1);
  };

  if (!activeSource) {
    return (
      <div className="landing-panel gve-panel">
        {/* O rótulo "Exercises" que ficava acima saiu (2026-08-06): nesta
            tela, diferente do Listening, o TÍTULO já é o h1 — deixar os dois
            daria "Exercises" grande e roxo em cima de "Grammar & Vocabulary
            Exercises", dizendo a mesma coisa duas vezes. */}
        <h1 className="gve-page-title">Grammar &amp; Vocabulary Exercises</h1>
        <p className="landing-meta">
          Extra practice, separate from the reading units — pick a set to start.
        </p>
        <div className="gve-source-list">
          {SOURCES.map((source) => {
            const answers = answersBySource[source.id] || {};
            const isWritten = source.kind === 'written';
            // Na seção escrita o mapa guarda o texto de cada ITEM + o
            // marcador de cada BLOCO — contar as chaves cruas misturaria os
            // dois, então conta só os blocos marcados como checados.
            const doneCount = isWritten
              ? source.blocks.filter((block) => answers[block.id] === 'checked').length
              : Object.keys(answers).length;
            const totalCount = isWritten ? source.blocks.length : source.exercises.length;
            const totalLabel = isWritten
              ? `${totalCount} exercises · ${source.blocks.reduce((sum, block) => sum + block.items.length, 0)} questions`
              : `${totalCount} exercises`;
            return (
              <button
                key={source.id}
                type="button"
                className="gve-source-card"
                onClick={() => setActiveSourceId(source.id)}
              >
                <span className="gve-source-title">{source.title}</span>
                <small>{source.description}</small>
                <small className="gve-source-stats">
                  {totalLabel}
                  {doneCount > 0 ? ` · ${doneCount} ${isWritten ? 'done' : 'answered'}` : ''}
                </small>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const answers = answersBySource[activeSource.id] || {};
  const isWritten = activeSource.kind === 'written';

  // Placar: nas seções de múltipla escolha conta EXERCÍCIO respondido; na
  // escrita conta ITEM (a unidade que o aluno realmente acerta ou erra),
  // e só dos blocos já checados.
  let correctCount = 0;
  let doneCount = 0;
  let totalCount = 0;
  if (isWritten) {
    activeSource.blocks.forEach((block) => {
      totalCount += block.items.length;
      if (answers[block.id] !== 'checked') return;
      block.items.forEach((item) => {
        doneCount += 1;
        if (isWrittenAnswerCorrect(item, answers[item.id])) correctCount += 1;
      });
    });
  } else {
    const answered = activeSource.exercises.filter((exercise) => answers[exercise.id]);
    doneCount = answered.length;
    totalCount = activeSource.exercises.length;
    correctCount = answered.filter((exercise) => answers[exercise.id] === exercise.answer).length;
  }

  return (
    <div className="landing-panel gve-panel">
      <button
        type="button"
        className="upload-button"
        onClick={() => {
          setActiveSourceId(null);
          try {
            window.sessionStorage.removeItem('grammarVocabExercisesPosition');
          } catch (error) {
            // Ignore storage issues.
          }
        }}
      >
        ‹ Back to Grammar &amp; Vocabulary Exercises
      </button>
      <p className="gve-source-heading">{activeSource.title}</p>
      <p className="gve-score">
        Score: <strong>{correctCount}/{doneCount}</strong> {isWritten ? 'checked' : 'answered'} · <strong>{totalCount}</strong> total
        {doneCount > 0 && (
          <button type="button" className="gve-reset-btn" onClick={handleResetCourse}>
            Reset
          </button>
        )}
      </p>
      {isWritten && (
        <input
          type="text"
          className="gve-filter-input"
          value={blockFilter}
          onChange={(event) => setBlockFilter(event.target.value)}
          placeholder="Jump to a unit — type a number (e.g. 47) or a topic (e.g. passive)"
          autoComplete="off"
        />
      )}
      <div className="gve-list">
        {isWritten
          ? (() => {
            const needle = blockFilter.trim().toLowerCase();
            // `index`/`total` seguem sendo a posição REAL na lista completa
            // (mapeados antes de filtrar), pra "Exercise 47 of 115" não virar
            // "Exercise 1 of 1" só porque o filtro escondeu o resto.
            const visible = activeSource.blocks
              .map((block, index) => ({ block, index }))
              .filter(({ block }) => !needle
                || String(block.unit) === needle
                || String(block.unit).startsWith(needle)
                || block.topic.toLowerCase().includes(needle)
                || block.instruction.toLowerCase().includes(needle));
            if (visible.length === 0) {
              return <p className="gve-filter-empty">No exercise matches “{blockFilter}”.</p>;
            }
            return visible.map(({ block, index }) => (
              <WrittenExerciseBlock
                key={`${block.id}:${resetToken}`}
                block={block}
                index={index}
                total={activeSource.blocks.length}
                savedAnswers={answers}
                onCheck={(drafts) => handleCheckBlock(block, drafts)}
                onReset={() => handleResetBlock(block)}
              />
            ));
          })()
          : activeSource.exercises.map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              savedChoice={answers[exercise.id]}
              onCheck={(option) => handleCheckAnswer(exercise, option)}
            />
          ))}
      </div>
    </div>
  );
}
