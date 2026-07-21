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
// (97 exercícios, 1 por unit nas units 4-100 de English Vocabulary B — as
// 3 primeiras units não têm faixa de Listening pra tirar uma frase de
// verdade, ver script gerador no scratchpad da sessão). Vocabulary é
// gerado por script (SEMPRE grounded em dado real: palavra-alvo real de
// vocabulary_target_words.json numa frase real de listening_vocabulary.json,
// nunca inventado — os distratores preferem a mesma "categoria" heurística
// da resposta certa, ver roughCategory no script gerador, e nunca são
// números/contrações soltas, pra não ficarem óbvios demais de descartar)
// — Grammar é escrito à mão porque o app não tem o texto das lições, só os
// títulos reais das units.
import { useState } from 'react';
import { userKey } from './App';
import grammarExercises from './grammar_vocab_exercises_grammar.json';
import vocabExercises from './grammar_vocab_exercises_vocab.json';
import './GrammarVocabExercises.css';

const SOURCES = [
  {
    id: 'grammar',
    title: 'Grammar English A1',
    description: 'Multiple-choice practice, two per grammar point — Essential Grammar in Use, units 1-100.',
    exercises: grammarExercises,
  },
  {
    id: 'vocabulary',
    title: 'English Vocabulary B',
    description: 'Fill in the blank with the right word, using real sentences from the course.',
    exercises: vocabExercises,
  },
];

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

export default function GrammarVocabExercisesPage({ userName }) {
  const [activeSourceId, setActiveSourceId] = useState(null);
  const [answersBySource, setAnswersBySource] = useState(() => ({
    grammar: loadAnswers(userName, 'grammar'),
    vocabulary: loadAnswers(userName, 'vocabulary'),
  }));

  const activeSource = SOURCES.find((source) => source.id === activeSourceId) || null;

  const handleCheckAnswer = (exercise, option) => {
    setAnswersBySource((prev) => {
      const next = { ...prev, [activeSourceId]: { ...prev[activeSourceId], [exercise.id]: option } };
      saveAnswers(userName, activeSourceId, next[activeSourceId]);
      return next;
    });
  };

  const handleResetCourse = () => {
    setAnswersBySource((prev) => {
      const next = { ...prev, [activeSourceId]: {} };
      saveAnswers(userName, activeSourceId, {});
      return next;
    });
  };

  if (!activeSource) {
    return (
      <div className="landing-panel gve-panel">
        <p className="eyebrow">Exercises</p>
        <h1>Grammar &amp; Vocabulary Exercises</h1>
        <p className="landing-meta">
          Quick multiple-choice practice, separate from the reading units — pick a course to start.
        </p>
        <div className="gve-source-list">
          {SOURCES.map((source) => {
            const answers = answersBySource[source.id] || {};
            const answeredCount = Object.keys(answers).length;
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
                  {source.exercises.length} exercises
                  {answeredCount > 0 ? ` · ${answeredCount} answered` : ''}
                </small>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const answers = answersBySource[activeSource.id] || {};
  const answeredExercises = activeSource.exercises.filter((exercise) => answers[exercise.id]);
  const correctCount = answeredExercises.filter((exercise) => answers[exercise.id] === exercise.answer).length;

  return (
    <div className="landing-panel gve-panel">
      <button type="button" className="upload-button" onClick={() => setActiveSourceId(null)}>
        ‹ Back to Grammar &amp; Vocabulary Exercises
      </button>
      <p className="eyebrow">{activeSource.title}</p>
      <h1>Exercises</h1>
      <p className="gve-score">
        Score: <strong>{correctCount}/{answeredExercises.length}</strong> answered so far
        {' '}(<strong>{activeSource.exercises.length}</strong> total)
        {answeredExercises.length > 0 && (
          <button type="button" className="gve-reset-btn" onClick={handleResetCourse}>
            Reset
          </button>
        )}
      </p>
      <div className="gve-list">
        {activeSource.exercises.map((exercise) => (
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
