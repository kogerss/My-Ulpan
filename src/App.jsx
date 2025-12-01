import "./App.css";
import { useEffect, useMemo, useState } from "react";
import { supabase } from './supabaseClient';

// Нормализуем строки (для проверки ответов)
const norm = (s) =>
  s
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

// Несколько вариантов через запятую -> массив
const parseVariants = (text) =>
  text
    .split(",")
    .map((v) => norm(v))
    .filter((v) => v.length > 0);

const STORAGE_KEY = "my-ulpan-dictionary-v2";

// Интервалы для Anki-режима
const SR_INTERVALS = [
  10 * 1000, // lvl1 -> 10 сек
  60 * 1000, // lvl2 -> 1 мин
  10 * 60 * 1000, // lvl3 -> 10 мин
  60 * 60 * 1000, // lvl4 -> 1 час
  24 * 60 * 60 * 1000, // lvl5 -> 1 день
];

function App() {
  // ---------- Словарь из Supabase ----------
  const [dictionary, setDictionary] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Загружаем слова из Supabase при загрузке страницы
  useEffect(() => {
    const loadWordsFromSupabase = async () => {
      try {
        console.log('Начинаем загрузку слов из Supabase...');
        
        // Загружаем слова из таблицы words
        const { data, error } = await supabase
          .from('words')
          .select('*')
          .order('id', { ascending: true });
        
        if (error) {
          console.error('Ошибка загрузки слов:', error);
          alert('Ошибка загрузки слов: ' + error.message);
          setIsLoading(false);
          return;
        }
        
        console.log('Загружено слов из базы:', data?.length || 0);
        console.log('Первая запись из базы:', data ? data[0] : 'нет данных');
        
        if (data && data.length > 0) {
          // Преобразуем данные из Supabase в наш формат
          const formattedWords = data.map(item => ({
            id: item.id || Date.now() + Math.random(),
            ru: item["Russian text"] || '', // русский перевод
            he: item["Hebrew text"] || '', // слово на иврите
            tr: item["transcription text"] || '', // транскрипция
            ruVariants: parseVariants(item["Russian text"] || ''),
            heVariants: parseVariants(item["Hebrew text"] || ''),
            stats: { correct: 0, wrong: 0 },
            sr: { level: 1, nextReview: 0 }
          }));
          
          console.log('Первое преобразованное слово:', formattedWords[0]);
          setDictionary(formattedWords);
        } else {
          console.log('В базе нет слов, используем пустой словарь');
          setDictionary([]);
        }
        
        setIsLoading(false);
        
      } catch (err) {
        console.error('Ошибка:', err);
        alert('Ошибка при загрузке: ' + err.message);
        setIsLoading(false);
      }
    };
    
    loadWordsFromSupabase();
  }, []);

  // ---------- Навигация по "экранам" ----------
  // home | input | quiz4 | flashcards | anki | dict
  const [screen, setScreen] = useState("home");

  // ---------- Состояния тренировки ----------
  const [current, setCurrent] = useState(null); // { word, mode, direction, options? }
  const [userAnswer, setUserAnswer] = useState("");
  const [feedback, setFeedback] = useState(null); // { ok, text }
  const [selectedOption, setSelectedOption] = useState(null);
  const [cardFlipped, setCardFlipped] = useState(false);

  // ---------- Добавление / редактирование / удаление слов ----------
  const addWord = () => {
    const ru = prompt(
      "Русское слово / фраза.\nМожно несколько вариантов через запятую (мой, моя, моё):"
    );
    if (!ru) return;

    const he = prompt(
      "Слово на иврите.\nМожно несколько вариантов через запятую:"
    );
    if (!he) return;

    const tr = prompt("Транскрипция (любой язык). Необязательно:") || "";

    const now = Date.now();

    const word = {
      id: now,
      ru,
      he,
      tr,
      ruVariants: parseVariants(ru),
      heVariants: parseVariants(he),
      stats: { correct: 0, wrong: 0 },
      sr: {
        level: 1,
        nextReview: 0, // можно тренировать сразу
      },
    };

    setDictionary((prev) => [...prev, word]);
  };

  const editWord = (id) => {
    const word = dictionary.find((w) => w.id === id);
    if (!word) return;

    const ru = prompt(
      "Русское слово / фраза (через запятую):",
      word.ru
    );
    if (!ru) return;

    const he = prompt("Иврит (через запятую):", word.he);
    if (!he) return;

    const tr = prompt("Транскрипция:", word.tr || "") || "";

    const updated = {
      ...word,
      ru,
      he,
      tr,
      ruVariants: parseVariants(ru),
      heVariants: parseVariants(he),
    };

    setDictionary((prev) =>
      prev.map((w) => (w.id === id ? updated : w))
    );
  };

  const deleteWord = (id) => {
    if (!confirm("Удалить это слово?")) return;
    setDictionary((prev) => prev.filter((w) => w.id !== id));
    if (current && current.word.id === id) {
      setCurrent(null);
      setFeedback(null);
      setUserAnswer("");
      setSelectedOption(null);
      setCardFlipped(false);
    }
  };

  // ---------- Обновление статистики + Anki-логика ----------
  const updateWordAfterAnswer = (wordId, ok) => {
    const now = Date.now();

    setDictionary((prev) =>
      prev.map((w) => {
        if (w.id !== wordId) return w;

        const stats = {
          correct: w.stats?.correct || 0,
          wrong: w.stats?.wrong || 0,
        };

        if (ok) stats.correct += 1;
        else stats.wrong += 1;

        const prevLevel = w.sr?.level || 1;
        let newLevel = ok ? Math.min(prevLevel + 1, 5) : 1;

        const interval =
          SR_INTERVALS[newLevel - 1] || SR_INTERVALS[0];

        return {
          ...w,
          stats,
          sr: {
            level: newLevel,
            nextReview: now + interval,
          },
        };
      })
    );
  };

  // ---------- Озвучка ----------
  const speak = (text, lang = "he-IL") => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      window.speechSynthesis.speak(u);
    } catch (e) {
      console.warn("speech error", e);
    }
  };

  const speakCurrent = () => {
    if (!current) return;
    const { word } = current;
    // Всегда озвучиваем иврит
    speak(word.he, "he-IL");
  };

  // ---------- Общие статистики ----------
  const totalStats = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    for (const w of dictionary) {
      correct += w.stats?.correct || 0;
      wrong += w.stats?.wrong || 0;
    }
    const total = correct + wrong;
    const accuracy = total ? Math.round((correct / total) * 100) : 0;
    return { correct, wrong, total, accuracy };
  }, [dictionary]);

  // ---------- Построение вопроса для разных режимов ----------
  const buildQuestion = (mode) => {
    if (dictionary.length === 0) {
      setFeedback({
        ok: false,
        text: "Словарь пуст. Добавь хотя бы одно слово.",
      });
      setCurrent(null);
      return;
    }

    let wordPool = [...dictionary];

    // Для Anki — только слова, которые "дозрели"
    if (mode === "anki") {
      const now = Date.now();
      wordPool = wordPool.filter(
        (w) => !w.sr || !w.sr.nextReview || w.sr.nextReview <= now
      );
      if (wordPool.length === 0) {
        setFeedback({
          ok: false,
          text: "Сейчас нет слов для повторения. Вернись позже 🙂",
        });
        setCurrent(null);
        return;
      }
    }

    const word =
      wordPool[Math.floor(Math.random() * wordPool.length)];

    const direction = Math.random() < 0.5 ? "ru-he" : "he-ru";

    if (mode === "input" || mode === "anki") {
      setCurrent({
        word,
        mode,
        direction,
      });
      setUserAnswer("");
      setSelectedOption(null);
      setFeedback(null);
      setCardFlipped(false);
    } else if (mode === "quiz4") {
      const options = [];

      if (direction === "ru-he") {
        const correct = word.heVariants[0] || norm(word.he);
        options.push(correct);

        const pool = dictionary
          .filter((w) => w.id !== word.id)
          .map((w) => w.heVariants[0] || norm(w.he));

        while (options.length < 4 && pool.length > 0) {
          const idx = Math.floor(Math.random() * pool.length);
          const candidate = pool.splice(idx, 1)[0];
          if (!options.includes(candidate)) options.push(candidate);
        }
      } else {
        const correct = word.ruVariants[0] || norm(word.ru);
        options.push(correct);

        const pool = dictionary
          .filter((w) => w.id !== word.id)
          .map((w) => w.ruVariants[0] || norm(w.ru));

        while (options.length < 4 && pool.length > 0) {
          const idx = Math.floor(Math.random() * pool.length);
          const candidate = pool.splice(idx, 1)[0];
          if (!options.includes(candidate)) options.push(candidate);
        }
      }

      while (options.length < 4) {
        options.push("—");
      }

      const shuffled = [...options].sort(() => Math.random() - 0.5);

      setCurrent({
        word,
        mode,
        direction,
        options: shuffled,
      });
      setSelectedOption(null);
      setFeedback(null);
      setUserAnswer("");
      setCardFlipped(false);
    } else if (mode === "flashcards") {
      setCurrent({
        word,
        mode,
        direction,
      });
      setFeedback(null);
      setUserAnswer("");
      setSelectedOption(null);
      setCardFlipped(false);
    }
  };

  const startInput = () => buildQuestion("input");
  const startQuiz4 = () => buildQuestion("quiz4");
  const startFlashcards = () => buildQuestion("flashcards");
  const startAnki = () => buildQuestion("anki");

  // ---------- Проверка ответов ----------
  const checkInputAnswer = () => {
    if (!current) return;
    const { word, direction } = current;

    const ans = norm(userAnswer);
    let ok = false;
    let correctText = "";

    if (direction === "ru-he") {
      const variants =
        word.heVariants.length > 0
          ? word.heVariants
          : [norm(word.he)];
      ok = variants.includes(ans);
      correctText = word.he;
    } else {
      const variants =
        word.ruVariants.length > 0
          ? word.ruVariants
          : [norm(word.ru)];
      ok = variants.includes(ans);
      correctText = word.ru;
    }

    updateWordAfterAnswer(word.id, ok);

    setFeedback({
      ok,
      text: ok
        ? "✔ Правильно!"
        : `✘ Неправильно. Правильный ответ: ${correctText}`,
    });

    // Автоозвучка правильного слова
    speak(word.he, "he-IL");
  };

  const checkChoiceAnswer = (option) => {
    if (!current) return;
    const { word, direction } = current;

    setSelectedOption(option);

    let correct;
    if (direction === "ru-he") {
      correct = word.heVariants[0] || norm(word.he);
    } else {
      correct = word.ruVariants[0] || norm(word.ru);
    }

    const ok = norm(option) === norm(correct);
    updateWordAfterAnswer(word.id, ok);

    setFeedback({
      ok,
      text: ok
        ? "✔ Правильно!"
        : `✘ Неправильно. Правильный ответ: ${correct}`,
    });

    // Автоозвучка
    speak(word.he, "he-IL");
  };

  // ---------- Flashcard: знаю / не знаю ----------
  const handleFlashKnow = () => {
    if (!current) return;
    const { word } = current;
    updateWordAfterAnswer(word.id, true);
    speak(word.he, "he-IL");
    buildQuestion("flashcards");
  };

  const handleFlashDontKnow = () => {
    if (!current) return;
    const { word } = current;
    updateWordAfterAnswer(word.id, false);
    speak(word.he, "he-IL");
    buildQuestion("flashcards");
  };

  // ---------- Вспомогательное: рендер вопроса (текст) ----------
  const renderQuestionPrompt = () => {
    if (!current) {
      return (
        <p style={{ fontSize: 18, opacity: 0.85 }}>
          Нажми «Начать», чтобы запустить тренировку.
        </p>
      );
    }

    const { word, direction } = current;

    if (direction === "ru-he") {
      return (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 20 }}>
            Переведи на иврит:
          </p>
          <div style={{ fontSize: 28, fontWeight: 600 }}>
            {word.ru}
          </div>
        </div>
      );
    } else {
      return (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 20 }}>Переведи на русский:</p>
          <div style={{ fontSize: 28, fontWeight: 600 }}>
            {word.he}
            {word.tr && (
              <span
                style={{
                  marginLeft: 10,
                  fontSize: 16,
                  opacity: 0.8,
                }}
              >
                [{word.tr}]
              </span>
            )}
          </div>
        </div>
      );
    }
  };

  // ---------- Прогресс-бар ----------
  const renderWordProgressBar = (word) => {
    const c = word.stats?.correct || 0;
    const w = word.stats?.wrong || 0;
    const total = c + w;
    const ratio = total ? c / total : 0;
    const percent = Math.round(ratio * 100);

    let color = "#ef4444"; // красный
    if (percent >= 70) color = "#22c55e"; // зелёный
    else if (percent >= 40) color = "#eab308"; // жёлтый

    return (
      <div style={{ marginTop: 4 }}>
        <div
          style={{
            height: 6,
            borderRadius: 999,
            background: "#111827",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${percent}%`,
              height: "100%",
              background: color,
            }}
          />
        </div>
        <div
          style={{
            fontSize: 11,
            opacity: 0.8,
            marginTop: 2,
          }}
        >
          {total === 0
            ? "Пока нет статистики"
            : `Правильно: ${c}, Ошибок: ${w} (${percent}%)`}
        </div>
      </div>
    );
  };

  // ---------- Экраны ----------

  const renderHomeScreen = () => (
    <div
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <h2 style={{ fontSize: 24, marginBottom: 8, color: "#3778FF" }}>
        Режимы тренировок
      </h2>
      <p style={{ fontSize: 14, opacity: 0.8 }}>
        Выбери режим внизу или нажми одну из кнопок:
      </p>

      <button
        style={primaryButton}
        onClick={() => {
          setScreen("flashcards");
          startFlashcards();
        }}
      >
        🔁 Обратные карточки
      </button>

      <button
        style={primaryButton}
        onClick={() => {
          setScreen("quiz4");
          startQuiz4();
        }}
      >
        🎯 Тест из 4 вариантов
      </button>

      <button
        style={primaryButton}
        onClick={() => {
          setScreen("input");
          startInput();
        }}
      >
        ✍️ Ввод ответа
      </button>

      <button
        style={primaryButton}
        onClick={() => {
          setScreen("anki");
          startAnki();
        }}
      >
        🧠 Anki-повторения
      </button>

      <button
        style={secondaryButton}
        onClick={() => setScreen("dict")}
      >
        📚 Открыть словарь
      </button>
    </div>
  );

  const renderInputScreen = () => (
    <div style={screenContainer}>
      <h2 style={screenTitle}>✍️ Ввод ответа</h2>
      <p style={screenSubTitle}>
        Вводи перевод самостоятельно. Ответ засчитывается, если совпадает
        с одним из вариантов.
      </p>

      <div style={card}>
        {renderQuestionPrompt()}

        <input
          value={userAnswer}
          onChange={(e) => setUserAnswer(e.target.value)}
          placeholder="Пиши ответ…"
          style={inputStyle}
        />

        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          <button style={primaryButton} onClick={checkInputAnswer}>
            ✅ Проверить
          </button>
          <button
            style={ghostButton}
            onClick={startInput}
          >
            🔁 Другое слово
          </button>
          <button
            style={ghostButton}
            onClick={speakCurrent}
            disabled={!current}
          >
            🔊
          </button>
        </div>

        {feedback && (
          <p
            style={{
              marginTop: 12,
              fontSize: 16,
              fontWeight: 600,
              color: feedback.ok ? "#22c55e" : "#f97373",
            }}
          >
            {feedback.text}
          </p>
        )}
      </div>
    </div>
  );

  const renderQuiz4Screen = () => (
    <div style={screenContainer}>
      <h2 style={screenTitle}>🎯 4 варианта</h2>
      <p style={screenSubTitle}>
        Выбери правильный перевод. Варианты подбираются автоматически.
      </p>

      <div style={card}>
        {renderQuestionPrompt()}

        {current && current.options ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
              marginTop: 10,
            }}
          >
            {current.options.map((opt, idx) => (
              <button
                key={idx}
                style={{
                  ...optionButton,
                  borderColor:
                    selectedOption === opt
                      ? "#3778FF"
                      : "rgba(148, 163, 184, 0.4)",
                  background:
                    selectedOption === opt
                      ? "rgba(55, 120, 255, 0.15)"
                      : "rgba(15, 23, 42, 1)",
                }}
                onClick={() => checkChoiceAnswer(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 14, opacity: 0.8 }}>
            Нажми «Начать», чтобы получить вопрос.
          </p>
        )}

        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          <button style={ghostButton} onClick={startQuiz4}>
            🔁 Другое слово
          </button>
          <button
            style={ghostButton}
            onClick={speakCurrent}
            disabled={!current}
          >
            🔊
          </button>
        </div>

        {feedback && (
          <p
            style={{
              marginTop: 12,
              fontSize: 16,
              fontWeight: 600,
              color: feedback.ok ? "#22c55e" : "#f97373",
            }}
          >
            {feedback.text}
          </p>
        )}
      </div>
    </div>
  );

  const renderFlashcardsScreen = () => (
    <div style={screenContainer}>
      <h2 style={screenTitle}>🔁 Обратные карточки</h2>
      <p style={screenSubTitle}>
        Нажми на карточку, чтобы увидеть перевод. Потом отметь «Знаю» или
        «Не знаю».
      </p>

      <div
        style={{
          ...card,
          cursor: current ? "pointer" : "default",
          textAlign: "center",
        }}
        onClick={() => current && setCardFlipped((f) => !f)}
      >
        {!current ? (
          <p style={{ fontSize: 16, opacity: 0.8 }}>
            Нажми «Начать», чтобы показать карточки.
          </p>
        ) : (
          <>
            {!cardFlipped ? (
              // лицевая сторона
              <div>
                {current.direction === "ru-he" ? (
                  <>
                    <p style={{ fontSize: 18, opacity: 0.8 }}>
                      Слово:
                    </p>
                    <div
                      style={{
                        fontSize: 32,
                        fontWeight: 700,
                        marginTop: 8,
                      }}
                    >
                      {current.word.ru}
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 18, opacity: 0.8 }}>
                      Слово:
                    </p>
                    <div
                      style={{
                        fontSize: 32,
                        fontWeight: 700,
                        marginTop: 8,
                      }}
                    >
                      {current.word.he}
                      {current.word.tr && (
                        <div
                          style={{
                            fontSize: 18,
                            opacity: 0.8,
                            marginTop: 6,
                          }}
                        >
                          [{current.word.tr}]
                        </div>
                      )}
                    </div>
                  </>
                )}

                <p
                  style={{
                    marginTop: 14,
                    fontSize: 14,
                    opacity: 0.7,
                  }}
                >
                  Нажми на карточку, чтобы показать перевод
                </p>
              </div>
            ) : (
              // оборотная сторона
              <div>
                <p style={{ fontSize: 18, opacity: 0.8 }}>
                  Перевод:
                </p>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 600,
                    marginTop: 8,
                  }}
                >
                  {current.direction === "ru-he"
                    ? current.word.he
                    : current.word.ru}
                </div>
                {current.direction === "ru-he" && current.word.tr && (
                  <div
                    style={{
                      fontSize: 18,
                      opacity: 0.8,
                      marginTop: 6,
                    }}
                  >
                    [{current.word.tr}]
                  </div>
                )}
                <p
                  style={{
                    marginTop: 14,
                    fontSize: 14,
                    opacity: 0.7,
                  }}
                >
                  Ещё раз нажми на карточку, чтобы скрыть перевод
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button style={primaryButton} onClick={startFlashcards}>
          ▶ Начать / следующее
        </button>
        <button
          style={successButton}
          onClick={handleFlashKnow}
          disabled={!current}
        >
          ✅ Знаю
        </button>
        <button
          style={dangerButton}
          onClick={handleFlashDontKnow}
          disabled={!current}
        >
          ❌ Не знаю
        </button>
        <button
          style={ghostButton}
          onClick={speakCurrent}
          disabled={!current}
        >
          🔊
        </button>
      </div>
    </div>
  );

  const renderAnkiScreen = () => (
    <div style={screenContainer}>
      <h2 style={screenTitle}>🧠 Anki-повторения</h2>
      <p style={screenSubTitle}>
        Здесь показываются только те слова, которые «дозрели» до
        повторения.
      </p>

      <div style={card}>
        {current ? (
          <>
            {renderQuestionPrompt()}
            <input
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="Пиши ответ…"
              style={inputStyle}
            />
            <div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 10,
              }}
            >
              <button
                style={primaryButton}
                onClick={checkInputAnswer}
              >
                ✅ Проверить
              </button>
              <button
                style={ghostButton}
                onClick={startAnki}
              >
                🔁 Следующее слово
              </button>
              <button
                style={ghostButton}
                onClick={speakCurrent}
                disabled={!current}
              >
                🔊
              </button>
            </div>

            {feedback && (
              <p
                style={{
                  marginTop: 12,
                  fontSize: 16,
                  fontWeight: 600,
                  color: feedback.ok ? "#22c55e" : "#f97373",
                }}
              >
                {feedback.text}
              </p>
            )}
          </>
        ) : (
          <p style={{ fontSize: 14, opacity: 0.8 }}>
            Нажми «Начать повторение», чтобы получить слово для
            повторения.
          </p>
        )}
      </div>

      <button
        style={{ ...primaryButton, marginTop: 12 }}
        onClick={startAnki}
      >
        ▶ Начать повторение
      </button>
    </div>
  );

  const renderDictScreen = () => {
    if (isLoading) {
      return (
        <div style={screenContainer}>
          <h2 style={screenTitle}>📚 Словарь</h2>
          <p style={{ fontSize: 16, opacity: 0.8 }}>
            Загрузка слов из базы данных...
          </p>
        </div>
      );
    }

    return (
      <div style={screenContainer}>
        <h2 style={screenTitle}>📚 Словарь ({dictionary.length})</h2>
        <p style={screenSubTitle}>
          Здесь ты можешь редактировать, удалять слова и смотреть прогресс.
        </p>

        <button
          style={{ ...primaryButton, marginBottom: 12 }}
          onClick={addWord}
        >
          ➕ Добавить слово
        </button>

        {dictionary.length === 0 ? (
          <p style={{ fontSize: 14, opacity: 0.8 }}>
            Пока нет ни одного слова.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: 320,
              overflow: "auto",
            }}
          >
            {dictionary.map((w) => (
              <div
                key={w.id}
                style={{
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.4)",
                  background: "#020617",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 18 }}>
                      <b>{w.ru}</b> —{" "}
                      <span style={{ fontSize: 20 }}>{w.he}</span>
                      {w.tr && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 14,
                            opacity: 0.8,
                          }}
                        >
                          [{w.tr}]
                        </span>
                      )}
                    </div>
                    {renderWordProgressBar(w)}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    <button
                      style={smallGhost}
                      onClick={() => speak(w.he, "he-IL")}
                    >
                      🔊
                    </button>
                    <button
                      style={smallGhost}
                      onClick={() => editWord(w.id)}
                    >
                      ✏
                    </button>
                    <button
                      style={smallDanger}
                      onClick={() => deleteWord(w.id)}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ---------- Общий layout + нижняя панель ----------
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "white",
        fontFamily: "system-ui, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Верхний заголовок + общая статистика */}
      <header
        style={{
          padding: "16px 16px 8px",
          borderBottom: "1px solid rgba(148,163,184,0.2)",
          background:
            "linear-gradient(to right, #020617, #020617 40%, #0b1730)",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 700,
            color: "#3778FF",
          }}
        >
          My Ulpan
        </h1>
        <div
          style={{
            marginTop: 6,
            fontSize: 13,
            opacity: 0.8,
          }}
        >
          Слов: <b>{dictionary.length}</b> · Ответов:{" "}
          <b>{totalStats.total}</b> · Точность:{" "}
          <b>{totalStats.accuracy}%</b>
        </div>
      </header>

      {/* Основной контент */}
      <main
        style={{
          flex: 1,
          padding: "8px 12px 80px",
          maxWidth: 960,
          margin: "0 auto",
          width: "100%",
        }}
      >
        {screen === "home" && renderHomeScreen()}
        {screen === "input" && renderInputScreen()}
        {screen === "quiz4" && renderQuiz4Screen()}
        {screen === "flashcards" && renderFlashcardsScreen()}
        {screen === "anki" && renderAnkiScreen()}
        {screen === "dict" && renderDictScreen()}
      </main>

      {/* Нижняя навигация */}
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          borderTop: "1px solid rgba(148,163,184,0.2)",
          background: "#020617",
          padding: "8px 6px calc(env(safe-area-inset-bottom, 0px) + 6px)",
          display: "flex",
          justifyContent: "space-around",
          gap: 6,
          zIndex: 50,
        }}
      >
        <NavButton
          label="Дом"
          icon="🏠"
          active={screen === "home"}
          onClick={() => {
            setScreen("home");
            setFeedback(null);
          }}
        />
        <NavButton
          label="Карточки"
          icon="🔁"
          active={screen === "flashcards"}
          onClick={() => {
            setScreen("flashcards");
            startFlashcards();
          }}
        />
        <NavButton
          label="4 варианта"
          icon="🎯"
          active={screen === "quiz4"}
          onClick={() => {
            setScreen("quiz4");
            startQuiz4();
          }}
        />
        <NavButton
          label="Ввод"
          icon="✍️"
          active={screen === "input"}
          onClick={() => {
            setScreen("input");
            startInput();
          }}
        />
        <NavButton
          label="Anki"
          icon="🧠"
          active={screen === "anki"}
          onClick={() => {
            setScreen("anki");
            startAnki();
          }}
        />
        <NavButton
          label="Словарь"
          icon="📚"
          active={screen === "dict"}
          onClick={() => {
            setScreen("dict");
            setFeedback(null);
          }}
        />
      </nav>
    </div>
  );
}

// ---------- МАЛЕНЬКИЕ КОМПОНЕНТЫ / СТИЛИ ----------

const NavButton = ({ label, icon, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      flex: 1,
      border: "none",
      borderRadius: 999,
      padding: "6px 4px",
      background: active ? "rgba(55, 120, 255, 0.16)" : "transparent",
      color: active ? "#3778FF" : "#e5e7eb",
      fontSize: 11,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 2,
    }}
  >
    <span style={{ fontSize: 18 }}>{icon}</span>
    <span>{label}</span>
  </button>
);

const screenContainer = {
  padding: 8,
};

const screenTitle = {
  fontSize: 22,
  margin: "4px 0 4px",
};

const screenSubTitle = {
  fontSize: 13,
  opacity: 0.8,
  marginBottom: 10,
};

const card = {
  borderRadius: 16,
  background: "#020617",
  border: "1px solid rgba(148,163,184,0.5)",
  padding: 16,
};

const primaryButton = {
  borderRadius: 999,
  border: "none",
  background: "#3778FF",
  color: "white",
  padding: "10px 18px",
  fontSize: 16,
  fontWeight: 600,
};

const secondaryButton = {
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.6)",
  background: "transparent",
  color: "#e5e7eb",
  padding: "10px 18px",
  fontSize: 16,
  fontWeight: 500,
};

const ghostButton = {
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.5)",
  background: "transparent",
  color: "#e5e7eb",
  padding: "8px 14px",
  fontSize: 14,
};

const successButton = {
  borderRadius: 999,
  border: "none",
  background: "#22c55e",
  color: "white",
  padding: "8px 16px",
  fontSize: 14,
  fontWeight: 600,
};

const dangerButton = {
  borderRadius: 999,
  border: "none",
  background: "#ef4444",
  color: "white",
  padding: "8px 16px",
  fontSize: 14,
  fontWeight: 600,
};

const optionButton = {
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.4)",
  background: "#020617",
  color: "white",
  padding: "10px 12px",
  fontSize: 16,
  textAlign: "left",
};

const inputStyle = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.7)",
  background: "#020617",
  color: "white",
  fontSize: 16,
  width: "100%",
  maxWidth: 420,
};

const smallGhost = {
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.6)",
  background: "transparent",
  color: "#e5e7eb",
  padding: "4px 8px",
  fontSize: 12,
};

const smallDanger = {
  borderRadius: 999,
  border: "1px solid rgba(248,113,113,0.8)",
  background: "rgba(127,29,29,1)",
  color: "#fecaca",
  padding: "4px 8px",
  fontSize: 12,
};

export default App;