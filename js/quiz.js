(async function () {
  const root = document.querySelector("[data-quiz]");
  if (!root) return;

  const EXAM_SIZE = 50;
  const EXAM_SECONDS = 60 * 60;
  const PASS_MARK = 75;
  const ICONS = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',    back: '<path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/>',
    prev: '<path d="M15 4l-8 8 8 8"/>',
    next: '<path d="M9 4l8 8-8 8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>',
    exam: '<path d="M9 3h6v3H9z"/><path d="M8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2"/><path d="M9 13l2 2 4-4"/>',
  };
  const icon = (name, size = 22) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  const escapeHtml = (s) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const formatTime = (totalSeconds, withHours = false) => {
    const s = Math.max(0, Math.floor(totalSeconds));
    const parts = withHours ? [s / 3600, (s % 3600) / 60, s % 60] : [s / 60, s % 60];
    return parts.map((v) => String(Math.floor(v)).padStart(2, "0")).join(":");
  };

  const code = root.dataset.code ?? "";
  const title = root.dataset.title ?? document.title;
  const status = root.querySelector("[data-quiz-status]");

  let raw;
  try {
    const res = await fetch(root.dataset.bank);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.json();
  } catch (err) {
    if (status) {
      status.textContent = `Could not load the question bank (${err.message}). Open the site through a web server, e.g. python3 -m http.server.`;
    }
    return;
  }
  status?.remove();

  const bank = raw.map((q, i) => ({
    id: String(q.id ?? i + 1),
    text: q.question,
    options: q.options,
    correct: q.answer,
    explanation: q.explanation ?? "",
    quick: q.explanation_quick ?? "",
    topic: q.topic ?? "",
    topicName: q.topicName ?? "",
    difficulty: q.difficulty ?? "",
  }));

  const topics = [];
  bank.forEach((item, i) => {
    let t = topics.find((x) => x.code === item.topic);
    if (!t) topics.push((t = { code: item.topic, name: item.topicName, items: [] }));
    t.items.push(i);
  });
  topics.sort((a, b) => a.code.localeCompare(b.code));

  const storeKey = `atpl-qbank:${code || title}`;
  const store = (() => {
    try {
      return JSON.parse(localStorage.getItem(storeKey)) || {};
    } catch {
      return {};
    }
  })();
  store.history ??= {};
  const saveStore = () => {
    try {
      localStorage.setItem(storeKey, JSON.stringify(store));
    } catch {}
  };
  const record = (item, choice) => {
    store.history[item.id] = choice === item.correct ? 1 : 0;
  };

  const validTopics = new Set(topics.map((t) => t.code));
  let selected = new Set((store.selected ?? [...validTopics]).filter((c) => validTopics.has(c)));
  if (!selected.size) selected = new Set(validTopics);
  const prefs = Object.assign({ mode: "study", filter: "all", shuffle: true }, store.prefs);
  store.prefs = prefs;
  const matchesFilter = (item) =>
    prefs.filter === "unattempted" ? !(item.id in store.history)
    : prefs.filter === "mistakes" ? store.history[item.id] === 0
    : true;
  const pool = (forMode = prefs.mode) =>
    forMode === "exam"
      ? bank.map((_, i) => i)
      : bank.map((_, i) => i).filter((i) => selected.has(bank[i].topic) && matchesFilter(bank[i]));
  const examSizeFor = (n) => Math.min(EXAM_SIZE, n);
  const examSecondsFor = (n) => Math.round((EXAM_SECONDS * examSizeFor(n)) / EXAM_SIZE / 60) * 60;

  // phase: "select" (subject dashboard) | "quiz" (answering or reviewing) | "result" (score)
  let mode = null;
  let phase = "select";
  let order = [];
  let current = 0;
  let answers = new Map();
  let submitted = false;
  let timeUp = false;
  let startedAt = 0;
  let endsAt = 0;
  let finishedAt = 0;
  let examSeconds = EXAM_SECONDS;
  let reviewFilter = null;

  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };

  function begin(newMode) {
    const list = shuffle(pool(newMode));
    if (!list.length) return;
    mode = newMode;
    order = mode === "exam" ? list.slice(0, examSizeFor(list.length)) : list;
    if (mode === "study" && !prefs.shuffle) order.sort((a, b) => a - b);
    current = 0;
    answers = new Map();
    submitted = false;
    timeUp = false;
    examSeconds = examSecondsFor(list.length);
    reviewFilter = null;
    startedAt = Date.now();
    endsAt = startedAt + examSeconds * 1000;
    phase = "quiz";
    go(0);
  }

  document.body.classList.add("exam-mode");
  const app = document.createElement("div");
  app.className = "exam";
  const accent = getComputedStyle(root).getPropertyValue("--accent").trim();
  if (accent) app.style.setProperty("--exam-accent", accent);
  app.innerHTML = `
    <header class="exam-top">
      <a class="icon-btn" href="../index.html" data-el="exit" aria-label="Back to subjects">${icon("back")}</a>
      <div class="exam-title"><span>${escapeHtml(code)}</span>${escapeHtml(title)}</div>
      <button type="button" class="icon-btn" data-action="menu" aria-label="Open question list">${icon("menu")}</button>
      <div class="exam-progress" aria-hidden="true"><span data-el="progress"></span></div>
    </header>

    <main class="exam-body">
      <section class="mode-view dash" data-el="modeView">
        <header class="dash-hero">
          <div class="dash-hero-text">
            <span class="dash-badge">${icon("book", 14)} Subject ${escapeHtml(code)}</span>
            <h1>${escapeHtml(title)}</h1>
            <p class="dash-sub">${bank.length} questions across ${topics.length} topics &middot; Pass mark ${PASS_MARK}%</p>
          </div>
          <div class="dash-stats" data-el="dashStats"></div>
        </header>

        <div class="dash-layout">
          <div class="dash-main">
            <section class="dash-panel">
              <div class="dash-head">
                <h2><span class="step">1</span>Practice mode</h2>
              </div>
              <div class="pick-grid">
                <button type="button" class="pick-card" data-pick-mode="study">
                  <span class="pick-icon">${icon("book", 22)}</span>
                  <span class="pick-body">
                    <strong>Study Mode</strong>
                    <small>No timer. The answer and explanation appear right after each selection.</small>
                  </span>
                </button>
                <button type="button" class="pick-card" data-pick-mode="exam">
                  <span class="pick-icon">${icon("clock", 22)}</span>
                  <span class="pick-body">
                    <strong>Exam Mode</strong>
                    <small>Timed, ${Math.min(EXAM_SIZE, bank.length)} random questions from the whole bank. Answers are revealed after you submit.</small>
                  </span>
                </button>
              </div>
            </section>

            <section class="dash-panel lockable" data-el="topicsPanel">
              <p class="lock-note">Exam Mode uses ${Math.min(EXAM_SIZE, bank.length)} random questions from all topics. Topic selection applies to Study Mode only.</p>
              <div class="dash-head">
                <h2><span class="step">2</span>Topics</h2>
                <div class="dash-tools">
                  <button type="button" data-action="topics-all">Select all</button>
                  <button type="button" data-action="topics-none">Deselect all</button>
                </div>
              </div>
              <div class="topic-grid" data-el="topicGrid"></div>
            </section>
          </div>

          <aside class="dash-side">
            <section class="dash-panel lockable" data-el="optionsPanel">
              <p class="lock-note">Options apply to Study Mode only.</p>
              <div class="dash-head"><h2>Options</h2></div>
              <div class="opt-list">
                <button type="button" class="opt-row" data-filter="unattempted">
                  <span><strong>Unattempted only</strong><small data-el="optUnattempted"></small></span>
                  <span class="switch" aria-hidden="true"></span>
                </button>
                <button type="button" class="opt-row" data-filter="mistakes">
                  <span><strong>Mistakes only</strong><small data-el="optMistakes"></small></span>
                  <span class="switch" aria-hidden="true"></span>
                </button>
                <button type="button" class="opt-row" data-action="toggle-shuffle" data-el="optShuffle">
                  <span><strong>Shuffle questions</strong><small>Random question order</small></span>
                  <span class="switch" aria-hidden="true"></span>
                </button>
              </div>
            </section>

            <section class="dash-panel ready-card">
              <p class="ready-eyebrow">Ready to start</p>
              <p class="ready-count" data-el="readyCount"></p>
              <p class="ready-meta" data-el="readyMeta"></p>
              <button type="button" class="ready-btn" data-action="start" data-el="startBtn"></button>
            </section>

            <button type="button" class="dash-reset" data-action="reset-progress">Reset saved progress</button>
          </aside>
        </div>
      </section>

      <div class="exam-inner" data-el="inner">
        <div class="exam-meta">
          <span class="chip chip-strong" data-el="position"></span>
          <span class="chip chip-mode" data-el="modeChip"></span>
          <span class="chip chip-diff" data-el="diffChip"></span>
          <span class="chip exam-clock" data-el="clockChip">${icon("clock")}<span data-el="clock"></span></span>
        </div>
        <div class="q-card">
          <span class="q-subject" data-el="topicLabel"></span>
          <p class="exam-question" data-el="question"></p>
        </div>
        <div class="exam-options" data-el="options"></div>
        <div class="exam-feedback" data-el="feedback" aria-live="polite"></div>
      </div>

      <section class="result-view" data-el="resultView"></section>
    </main>

    <footer class="exam-bottom">
      <div class="dock">
        <button type="button" class="icon-btn nav-btn" data-action="prev" aria-label="Previous question">${icon("prev")}</button>
        <button type="button" class="dock-action" data-el="dockAction"></button>
        <button type="button" class="icon-btn nav-btn nav-next" data-action="next" aria-label="Next question">${icon("next")}</button>
      </div>
    </footer>

    <div class="drawer-backdrop" data-action="close"></div>
    <aside class="drawer" aria-label="Question list">
      <div class="drawer-head">
        <div><small>${escapeHtml(code)}</small><strong>${escapeHtml(title)}</strong></div>
        <button type="button" class="icon-btn" data-action="close" aria-label="Close">${icon("close")}</button>
      </div>
      <div class="drawer-score" data-el="score"></div>
      <div class="drawer-legend" data-el="legend"></div>
      <div class="drawer-grid" data-el="grid"></div>
    </aside>

    <div class="modal-backdrop" data-el="modalBackdrop">
      <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title" data-el="modalTitle"></h2>
        <p data-el="modalText"></p>
        <div class="modal-actions">
          <button type="button" class="modal-btn" data-el="modalCancel"></button>
          <button type="button" class="modal-btn modal-btn-primary" data-el="modalOk"></button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(app);

  const el = Object.fromEntries(
    Array.from(app.querySelectorAll("[data-el]")).map((n) => [n.dataset.el, n])
  );
  const q = () => bank[order[current]];
  const examRunning = () => mode === "exam" && phase === "quiz" && !submitted;
  const isRevealed = (item) => (mode === "study" ? answers.has(item.id) : submitted);
  const correctCount = () =>
    [...answers].filter(([id, i]) => bank.find((b) => b.id === id).correct === i).length;
  const secondsLeft = () => (endsAt - Date.now()) / 1000;

  function confirmDialog({ title, message, confirm, cancel = "Cancel" }) {
    return new Promise((resolve) => {
      el.modalTitle.textContent = title;
      el.modalText.textContent = message;
      el.modalOk.textContent = confirm;
      el.modalCancel.textContent = cancel;
      app.classList.add("modal-open");
      const done = (value) => {
        app.classList.remove("modal-open");
        el.modalOk.onclick = el.modalCancel.onclick = el.modalBackdrop.onclick = null;
        confirmDialog.cancel = null;
        resolve(value);
      };
      el.modalOk.onclick = () => done(true);
      el.modalCancel.onclick = () => done(false);
      el.modalBackdrop.onclick = (e) => e.target === el.modalBackdrop && done(false);
      confirmDialog.cancel = () => done(false);
      el.modalOk.focus();
    });
  }

  function renderOptions() {
    const item = q();
    const chosen = answers.get(item.id);
    const revealed = isRevealed(item);
    el.options.classList.toggle("is-locked", revealed);
    el.options.innerHTML = item.options
      .map((text, i) => {
        const isCorrect = revealed && i === item.correct;
        const isWrong = revealed && chosen === i && i !== item.correct;
        const isSelected = !revealed && chosen === i;
        const cls = [
          "exam-option",
          isCorrect ? "is-correct" : "",
          isWrong ? "is-wrong" : "",
          isSelected ? "is-selected" : "",
        ].join(" ");
        const key = isCorrect ? "&#10003;" : isWrong ? "&#10005;" : String.fromCharCode(65 + i);
        return `<button type="button" class="${cls.trim()}" data-option="${i}"${revealed ? " disabled" : ""}>
            <span class="opt-key">${key}</span><span class="opt-text">${escapeHtml(text)}</span>
          </button>`;
      })
      .join("");

    if (!revealed) {
      el.feedback.className = "exam-feedback";
      el.feedback.innerHTML = "";
      return;
    }

    const letter = String.fromCharCode(65 + item.correct);
    const good = chosen === item.correct;
    const skipped = chosen === undefined;
    const head = good
      ? ["&#10003;", "Correct", "Nice work &mdash; here's why."]
      : skipped
        ? ["&ndash;", "Not answered", "You skipped this question."]
        : ["&#10005;", "Incorrect", "Don't worry &mdash; here's what you need to know."];
    el.feedback.className = `exam-feedback show ${good ? "good" : "bad"}${skipped ? " skipped" : ""}`;
    el.feedback.innerHTML = `
      <div class="fb-head">
        <span class="fb-icon">${head[0]}</span>
        <div>
          <p class="fb-title">${head[1]}</p>
          <p class="fb-sub">${head[2]}</p>
        </div>
      </div>
      ${good ? "" : `<div class="fb-answer">
        <span class="fb-label">Correct answer</span>
        <span class="fb-value"><span class="fb-key">${letter}</span>${escapeHtml(item.options[item.correct])}</span>
      </div>`}
      ${item.quick ? `<div class="fb-explain"><span class="fb-label">Key point</span><p class="fb-quick">${escapeHtml(item.quick)}</p></div>` : ""}
      ${item.explanation ? `<div class="fb-explain"><span class="fb-label">Explanation</span><p>${escapeHtml(item.explanation)}</p></div>` : ""}`;
  }

  function renderDrawer() {
    const reviewing = mode === "study" || submitted;
    el.grid.innerHTML = order
      .map((idx, pos) => {
        const item = bank[idx];
        const chosen = answers.get(item.id);
        let state = "";
        if (reviewing) {
          state = chosen === undefined ? (submitted ? "skipped" : "") : chosen === item.correct ? "correct" : "wrong";
        } else if (chosen !== undefined) {
          state = "answered";
        }
        return `<button type="button" class="${[pos === current ? "current" : "", state].join(" ").trim()}" data-goto="${pos}">${pos + 1}</button>`;
      })
      .join("");

    const n = order.length;
    const answered = answers.size;
    const correct = correctCount();
    if (mode === "study") {
      const pct = answered ? Math.round((correct / answered) * 100) : 0;
      el.score.innerHTML = `<small>Study Mode</small><strong>${correct}</strong> correct of <strong>${answered}</strong> answered &middot; ${pct}%<br><small>${n - answered} remaining</small>`;
      el.legend.innerHTML = '<span class="dot correct"></span>Correct <span class="dot wrong"></span>Wrong';
    } else if (!submitted) {
      el.score.innerHTML = `<small>Exam Mode</small><strong>${answered}</strong> of <strong>${n}</strong> answered<br><small>${n - answered} unanswered &middot; <span data-el="drawerClock">${formatTime(secondsLeft())}</span> left</small>`;
      el.legend.innerHTML = '<span class="dot answered"></span>Answered <span class="dot empty"></span>Unanswered';
    } else {
      const pct = Math.round((correct / n) * 100);
      el.score.innerHTML = `<small>Exam result</small><strong>${pct}%</strong> &middot; ${passed() ? "Passed" : "Not passed"}<br><small>${correct} of ${n} correct &middot; pass mark ${PASS_MARK}%</small>`;
      el.legend.innerHTML = '<span class="dot correct"></span>Correct <span class="dot wrong"></span>Wrong <span class="dot skipped"></span>Unanswered';
    }
  }

  const passed = () => (correctCount() / order.length) * 100 >= PASS_MARK;

  function reviewState(item) {
    const chosen = answers.get(item.id);
    return chosen === undefined ? "skipped" : chosen === item.correct ? "correct" : "wrong";
  }

  function renderReviewList() {
    const study = mode === "study";
    const items = order.map((idx, pos) => ({ item: bank[idx], pos, state: reviewState(bank[idx]) }));
    const count = (state) => items.filter((x) => x.state === state).length;
    const filters = [
      [study ? "answered" : "all", study ? "Attempted" : "All", study ? items.length - count("skipped") : items.length],
      ["wrong", "Wrong", count("wrong")],
      ["correct", "Correct", count("correct")],
      ["skipped", study ? "Not attempted" : "Unanswered", count("skipped")],
    ];
    if (!filters.some(([key]) => key === reviewFilter)) reviewFilter = filters[0][0];
    const shown = items.filter(({ state }) =>
      reviewFilter === "all" ? true : reviewFilter === "answered" ? state !== "skipped" : state === reviewFilter
    );
    const statusText = { correct: "Correct", wrong: "Wrong", skipped: study ? "Not attempted" : "Unanswered" };

    return `
      <section class="review" data-el="review">
        <div class="review-head">
          <h2>Answer review</h2>
          <div class="review-tabs">
            ${filters
              .map(
                ([key, label, n]) =>
                  `<button type="button" class="${key === reviewFilter ? "is-on" : ""}" data-review-filter="${key}">${label} <span>${n}</span></button>`
              )
              .join("")}
          </div>
        </div>
        ${shown.length ? "" : '<p class="review-empty">No questions in this list.</p>'}
        ${shown
          .map(({ item, pos, state }) => {
            const chosen = answers.get(item.id);
            return `
          <article class="rv-item rv-${state}">
            <div class="rv-head">
              <span class="rv-num">${pos + 1}</span>
              <span class="rv-topic">${escapeHtml(item.topic ? `${item.topic} · ${item.topicName}` : title)}</span>
              <span class="rv-status">${statusText[state]}</span>
            </div>
            <p class="rv-q">${escapeHtml(item.text)}</p>
            <ul class="rv-opts">
              ${item.options
                .map((text, i) => {
                  const cls = i === item.correct ? "is-correct" : i === chosen ? "is-wrong" : "";
                  const key = i === item.correct ? "&#10003;" : i === chosen ? "&#10005;" : String.fromCharCode(65 + i);
                  const tag = i === chosen ? '<em>Your answer</em>' : "";
                  return `<li class="${cls}"><span class="rv-key">${key}</span><span>${escapeHtml(text)}</span>${tag}</li>`;
                })
                .join("")}
            </ul>
            ${item.quick ? `<p class="rv-quick"><strong>Key point:</strong> ${escapeHtml(item.quick)}</p>` : ""}
            ${item.explanation ? `<details class="rv-exp"><summary>Show explanation</summary><p>${escapeHtml(item.explanation)}</p></details>` : ""}
          </article>`;
          })
          .join("")}
      </section>`;
  }

  function renderStudyResult() {
    const n = order.length;
    const answered = answers.size;
    const correct = correctCount();
    const remaining = n - answered;
    const wrong = n - correct;
    const pct = Math.round((correct / n) * 100);
    const taken = (finishedAt - startedAt) / 1000;
    el.resultView.innerHTML = `
      <div class="result-card study">
        ${remaining ? `<p class="result-note">Session ended early &mdash; ${remaining} question${remaining === 1 ? "" : "s"} not attempted.</p>` : ""}
        <div class="result-ring" style="--p:${pct}"><span>${pct}%</span></div>
        <h1>Study summary</h1>
        <p class="result-sub">You scored ${correct} out of ${n}.${remaining ? " Questions not attempted are counted as wrong." : ""}</p>
        <div class="result-stats">
          <div><strong class="good">${correct}</strong><span>Correct</span></div>
          <div><strong class="bad">${wrong}</strong><span>Wrong</span></div>
          <div><strong>${remaining}</strong><span>Not attempted</span></div>
          <div><strong>${formatTime(taken, taken >= 3600)}</strong><span>Time spent</span></div>
        </div>
        <div class="result-actions">
          ${remaining ? '<button type="button" class="result-btn primary" data-action="continue">Continue studying</button>' : ""}
          ${answered ? `<button type="button" class="result-btn${remaining ? "" : " primary"}" data-action="review">Review answers</button>` : ""}
          <button type="button" class="result-btn" data-action="restart">Restart</button>
          <button type="button" class="result-btn" data-action="change-mode">Back to dashboard</button>
        </div>
      </div>
      ${renderReviewList()}`;
  }

  function renderResult() {
    if (mode === "study") return renderStudyResult();
    const n = order.length;
    const correct = correctCount();
    const unanswered = n - answers.size;
    const wrong = n - correct;
    const pct = Math.round((correct / n) * 100);
    const ok = passed();
    const taken = Math.min((finishedAt - startedAt) / 1000, examSeconds);
    el.resultView.innerHTML = `
      <div class="result-card ${ok ? "pass" : "fail"}">
        ${timeUp ? '<p class="result-note">Time is up &mdash; your exam was submitted automatically.</p>' : ""}
        <div class="result-ring" style="--p:${pct}"><span>${pct}%</span></div>
        <h1>${ok ? "Passed" : "Not passed"}</h1>
        <p class="result-sub">You scored ${correct} out of ${n}.${unanswered ? " Unanswered questions are counted as wrong." : ""} The pass mark is ${PASS_MARK}% (${Math.ceil((n * PASS_MARK) / 100)} correct).</p>
        <div class="result-stats">
          <div><strong class="good">${correct}</strong><span>Correct</span></div>
          <div><strong class="bad">${wrong}</strong><span>Wrong</span></div>
          <div><strong>${unanswered}</strong><span>Unanswered</span></div>
          <div><strong>${formatTime(taken)}</strong><span>Time taken</span></div>
        </div>
        <div class="result-actions">
          <button type="button" class="result-btn primary" data-action="review">Review answers</button>
          <button type="button" class="result-btn" data-action="retake">Retake exam</button>
          <button type="button" class="result-btn" data-action="change-mode">Back to dashboard</button>
        </div>
      </div>
      ${renderReviewList()}`;
  }

  function renderDashboard() {
    const history = store.history;
    const inTopics = bank.filter((b) => selected.has(b.topic));
    const seen = bank.filter((b) => b.id in history);
    const right = seen.filter((b) => history[b.id] === 1).length;
    const mastery = Math.round((right / bank.length) * 100);
    const last = store.lastExam;

    el.dashStats.innerHTML = `
      <div><span>Bank total</span><strong>${bank.length}</strong><small>questions</small></div>
      <div><span>Mastered</span><strong class="accent">${mastery}%</strong><small>${right} correct</small></div>
      <div><span>Last exam</span><strong class="${last ? (last.passed ? "good" : "bad") : ""}">${last ? `${last.pct}%` : "&ndash;"}</strong><small>${last ? (last.passed ? "Passed" : "Not passed") : "No exam yet"}</small></div>`;

    el.topicGrid.innerHTML = topics
      .map((t) => {
        const on = selected.has(t.code);
        const done = t.items.filter((i) => history[bank[i].id] === 1).length;
        const wrong = t.items.filter((i) => history[bank[i].id] === 0).length;
        const pct = Math.round((done / t.items.length) * 100);
        return `<button type="button" class="topic-card${on ? " is-on" : ""}" data-topic="${escapeHtml(t.code)}" aria-pressed="${on}">
            <span class="topic-check" aria-hidden="true"></span>
            <span class="topic-code">${escapeHtml(t.code)}</span>
            <span class="topic-name">${escapeHtml(t.name)}</span>
            ${wrong ? `<span class="topic-wrong">${wrong} wrong</span>` : ""}
            <span class="topic-bar" title="${pct}% mastered"><span style="width:${pct}%"></span></span>
            <span class="topic-count">${t.items.length} Qs</span>
          </button>`;
      })
      .join("");

    app.querySelectorAll("[data-pick-mode]").forEach((b) => {
      const on = b.dataset.pickMode === prefs.mode;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on);
    });
    app.querySelectorAll("[data-filter]").forEach((b) => {
      const on = b.dataset.filter === prefs.filter;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on);
    });
    el.optShuffle.classList.toggle("is-on", prefs.shuffle);
    el.optShuffle.setAttribute("aria-pressed", prefs.shuffle);
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    el.optUnattempted.textContent = `${plural(inTopics.filter((b) => !(b.id in history)).length, "question")} in selected topics`;
    el.optMistakes.textContent = `${plural(inTopics.filter((b) => history[b.id] === 0).length, "question")} answered wrong`;

    const n = pool().length;
    const exam = prefs.mode === "exam";
    const count = exam ? examSizeFor(n) : n;
    el.topicsPanel.classList.toggle("is-locked", exam);
    el.optionsPanel.classList.toggle("is-locked", exam);
    el.topicsPanel.inert = el.optionsPanel.inert = exam;
    el.readyCount.innerHTML = `<strong>${count}</strong> question${count === 1 ? "" : "s"}`;
    el.readyMeta.textContent = !n
      ? "No questions match. Select a topic or change the options."
      : exam
        ? `Random from all topics · ${examSecondsFor(n) / 60} min · pass mark ${PASS_MARK}%`
        : `${selected.size} topic${selected.size === 1 ? "" : "s"} · no time limit`;
    el.startBtn.textContent = exam ? "Start exam" : "Start studying";
    el.startBtn.disabled = n === 0;
  }

  function updateClock() {
    if (!examRunning()) return;
    const left = secondsLeft();
    el.clock.textContent = formatTime(left);
    el.clockChip.classList.toggle("is-low", left <= 300);
    const drawerClock = app.querySelector('[data-el="drawerClock"]');
    if (drawerClock) drawerClock.textContent = formatTime(left);
  }

  function render() {
    app.dataset.phase = phase;
    app.dataset.activeMode = mode ?? "";
    app.dataset.submitted = submitted;
    el.modeView.hidden = phase !== "select";
    el.inner.hidden = phase !== "quiz";
    el.resultView.hidden = phase !== "result";

    if (phase === "result") renderResult();
    if (phase === "select") {
      el.progress.style.width = "0";
      renderDashboard();
      return;
    }

    const n = order.length;
    el.progress.style.width = `${(answers.size / n) * 100}%`;
    renderDrawer();
    if (phase !== "quiz") return;

    el.position.textContent = `Q ${current + 1} / ${n}`;
    el.question.textContent = q().text;
    el.topicLabel.textContent = q().topic ? `${q().topic} · ${q().topicName}` : `${code} · ${title}`;
    el.diffChip.textContent = q().difficulty;
    el.diffChip.dataset.level = q().difficulty.toLowerCase();
    el.diffChip.hidden = !q().difficulty;
    el.modeChip.textContent = mode === "study" ? "Study Mode" : submitted ? "Exam review" : "Exam Mode";
    el.clockChip.hidden = !examRunning();
    updateClock();
    renderOptions();

    app.querySelector('[data-action="prev"]').disabled = current === 0;
    app.querySelector('[data-action="next"]').disabled = current === n - 1;
    if (mode === "study") {
      el.dockAction.dataset.action = "end-study";
      el.dockAction.textContent = answers.size === n ? "See results" : "End study";
    } else {
      el.dockAction.dataset.action = submitted ? "results" : "submit";
      el.dockAction.textContent = submitted ? "View results" : "Submit exam";
    }
  }

  function go(pos) {
    current = Math.max(0, Math.min(pos, order.length - 1));
    render();
    app.querySelector(".exam-body").scrollTop = 0;
    el.inner.classList.remove("enter");
    void el.inner.offsetWidth;
    el.inner.classList.add("enter");
  }

  function finishExam(auto = false) {
    submitted = true;
    timeUp = auto;
    finishedAt = Date.now();
    answers.forEach((choice, id) => record(bank.find((b) => b.id === id), choice));
    const correct = correctCount();
    store.lastExam = {
      pct: Math.round((correct / order.length) * 100),
      correct,
      total: order.length,
      passed: passed(),
      at: finishedAt,
    };
    saveStore();
    phase = "result";
    setDrawer(false);
    render();
    app.querySelector(".exam-body").scrollTop = 0;
  }

  async function requestSubmit() {
    const unanswered = order.length - answers.size;
    if (unanswered > 0) {
      const ok = await confirmDialog({
        title: "Submit exam?",
        message: `You still have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. Unanswered questions will be marked as incorrect. Are you sure you want to submit?`,
        confirm: "Submit exam",
        cancel: "Keep answering",
      });
      if (!ok) return;
    }
    finishExam();
  }

  async function requestEndStudy() {
    const remaining = order.length - answers.size;
    if (remaining > 0) {
      const ok = await confirmDialog({
        title: "End study session?",
        message: `You have answered ${answers.size} of ${order.length} questions. End now and see your results? You can continue studying afterwards.`,
        confirm: "See results",
        cancel: "Keep studying",
      });
      if (!ok) return;
    }
    finishedAt = Date.now();
    phase = "result";
    render();
    app.querySelector(".exam-body").scrollTop = 0;
  }

  async function confirmLeaveExam() {
    if (!examRunning()) return true;
    return confirmDialog({
      title: "Leave the exam?",
      message: "Your exam is still in progress. If you leave now, your answers will be lost.",
      confirm: "Leave exam",
      cancel: "Stay",
    });
  }

  const showFeedback = () =>
    requestAnimationFrame(() => el.feedback.scrollIntoView({ behavior: "smooth", block: "end" }));

  const setDrawer = (open) => app.classList.toggle("drawer-open", open);

  app.addEventListener("click", async (e) => {
    if (e.target.closest(".modal-backdrop")) return;

    const exit = e.target.closest('[data-el="exit"]');
    if (exit && examRunning()) {
      e.preventDefault();
      if (await confirmLeaveExam()) location.href = exit.href;
      return;
    }

    const target = e.target.closest("[data-pick-mode], [data-filter], [data-review-filter], [data-option], [data-action], [data-goto], [data-topic]");
    if (!target) return;

    if (target.closest(".lockable.is-locked")) return;

    if (target.dataset.reviewFilter) {
      reviewFilter = target.dataset.reviewFilter;
      app.querySelector('[data-el="review"]').outerHTML = renderReviewList();
      return;
    }

    if (target.dataset.topic !== undefined) {
      const topic = target.dataset.topic;
      selected.has(topic) ? selected.delete(topic) : selected.add(topic);
      store.selected = [...selected];
      saveStore();
      renderDashboard();
    } else if (target.dataset.pickMode) {
      prefs.mode = target.dataset.pickMode;
      saveStore();
      renderDashboard();
    } else if (target.dataset.filter) {
      prefs.filter = prefs.filter === target.dataset.filter ? "all" : target.dataset.filter;
      saveStore();
      renderDashboard();
    } else if (target.dataset.option !== undefined) {
      const item = q();
      if (isRevealed(item)) return;
      answers.set(item.id, Number(target.dataset.option));
      if (mode === "study") {
        record(item, answers.get(item.id));
        saveStore();
      }
      render();
      if (mode === "study" && answers.get(item.id) !== item.correct) showFeedback();
    } else if (target.dataset.goto !== undefined) {
      if (phase !== "quiz") phase = "quiz";
      go(Number(target.dataset.goto));
      setDrawer(false);
    } else {
      switch (target.dataset.action) {
        case "prev": go(current - 1); break;
        case "next": go(current + 1); break;
        case "menu": setDrawer(true); break;
        case "close": setDrawer(false); break;
        case "restart": setDrawer(false); begin("study"); break;
        case "retake": setDrawer(false); begin("exam"); break;
        case "submit": setDrawer(false); requestSubmit(); break;
        case "end-study": setDrawer(false); requestEndStudy(); break;
        case "continue": {
          const next = order.findIndex((idx) => !answers.has(bank[idx].id));
          phase = "quiz";
          go(next === -1 ? current : next);
          break;
        }
        case "results":
          setDrawer(false);
          phase = "result";
          render();
          app.querySelector(".exam-body").scrollTop = 0;
          break;
        case "review":
          app.querySelector('[data-el="review"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
          break;
        case "start": begin(prefs.mode); break;
        case "toggle-shuffle":
          prefs.shuffle = !prefs.shuffle;
          saveStore();
          renderDashboard();
          break;
        case "topics-all":
        case "topics-none":
          selected = new Set(target.dataset.action === "topics-all" ? topics.map((t) => t.code) : []);
          store.selected = [...selected];
          saveStore();
          renderDashboard();
          break;
        case "reset-progress":
          if (
            await confirmDialog({
              title: "Reset saved progress?",
              message: "This clears your answer history and last exam result for this subject.",
              confirm: "Reset",
            })
          ) {
            store.history = {};
            delete store.lastExam;
            saveStore();
            renderDashboard();
          }
          break;
        case "change-mode":
          setDrawer(false);
          if (await confirmLeaveExam()) {
            phase = "select";
            mode = null;
            render();
          }
          break;
      }
    }
  });

  document.addEventListener("keydown", (e) => {
    if (app.classList.contains("modal-open")) {
      if (e.key === "Escape") confirmDialog.cancel?.();
      return;
    }
    if (e.key === "Escape") setDrawer(false);
    if (phase !== "quiz") return;
    if (e.key === "ArrowRight") go(current + 1);
    if (e.key === "ArrowLeft") go(current - 1);
    const n = Number(e.key);
    if (n >= 1 && n <= q().options.length) {
      app.querySelector(`[data-option="${n - 1}"]`)?.click();
    }
  });

  setInterval(() => {
    if (!examRunning()) return;
    if (secondsLeft() <= 0) {
      if (app.classList.contains("modal-open")) confirmDialog.cancel?.();
      finishExam(true);
    } else {
      updateClock();
    }
  }, 1000);

  render();
})();
