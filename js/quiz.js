(function () {
  const form = document.querySelector(".quiz");
  if (!form) return;

  const EXAM_SIZE = 50;
  const EXAM_SECONDS = 60 * 60;
  const PASS_MARK = 75;

  const ICONS = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    exit: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 11v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/>',
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

  const code = document.querySelector(".practice-title .subject-code")?.textContent.trim() ?? "";
  const title = document.querySelector(".practice-title h1")?.textContent.trim() ?? document.title;
  const bank = Array.from(form.querySelectorAll(".question")).map((fs, i) => {
    const inputs = Array.from(fs.querySelectorAll(".options input"));
    return {
      id: fs.dataset.id || String(i + 1),
      text: fs.querySelector("legend").textContent.trim(),
      options: inputs.map((inp) => fs.querySelector(`label[for="${inp.id}"]`).textContent.trim()),
      correct: inputs.findIndex((inp) => inp.hasAttribute("data-correct")),
      explanation: fs.querySelector(".exp-text")?.textContent.trim() ?? "",
    };
  });
  const examSize = Math.min(EXAM_SIZE, bank.length);

  // phase: "select" (choose mode) | "quiz" (answering or reviewing) | "result" (exam score)
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

  const shuffled = () => {
    const list = bank.map((_, i) => i);
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };

  function begin(newMode) {
    mode = newMode;
    order = mode === "exam" ? shuffled().slice(0, examSize) : shuffled();
    current = 0;
    answers = new Map();
    submitted = false;
    timeUp = false;
    startedAt = Date.now();
    endsAt = startedAt + EXAM_SECONDS * 1000;
    phase = "quiz";
    go(0);
  }

  document.body.classList.add("exam-mode");
  const app = document.createElement("div");
  app.className = "exam";
  const accent = getComputedStyle(form).getPropertyValue("--accent").trim();
  if (accent) app.style.setProperty("--exam-accent", accent);
  app.innerHTML = `
    <header class="exam-top">
      <button type="button" class="icon-btn" data-action="menu" aria-label="Open question list">${icon("menu")}</button>
      <div class="exam-title"><span>${escapeHtml(code)}</span>${escapeHtml(title)}</div>
      <a class="icon-btn" href="../index.html" data-el="exit" aria-label="Back to subjects">${icon("exit")}</a>
      <div class="exam-progress" aria-hidden="true"><span data-el="progress"></span></div>
    </header>

    <main class="exam-body">
      <section class="mode-view" data-el="modeView">
        <p class="mode-eyebrow">${escapeHtml(code)} &middot; ${escapeHtml(title)} &middot; ${bank.length} questions</p>
        <h1>Choose a mode</h1>
        <div class="mode-grid">
          <button type="button" class="mode-card" data-mode="study">
            <span class="mode-icon">${icon("book", 26)}</span>
            <h2>Study Mode</h2>
            <p>Learn at your own pace with instant feedback.</p>
            <ul>
              <li>All ${bank.length} questions in random order</li>
              <li>No time limit</li>
              <li>Answer revealed after each selection</li>
            </ul>
            <span class="mode-cta">Start studying</span>
          </button>
          <button type="button" class="mode-card mode-card-exam" data-mode="exam">
            <span class="mode-icon">${icon("exam", 26)}</span>
            <h2>Exam Mode</h2>
            <p>Simulate the real exam under timed conditions.</p>
            <ul>
              <li>${examSize} random questions from the bank</li>
              <li>1 hour time limit</li>
              <li>Answers revealed after you submit</li>
              <li>Pass mark ${PASS_MARK}%</li>
            </ul>
            <span class="mode-cta">Start exam</span>
          </button>
        </div>
      </section>

      <div class="exam-inner" data-el="inner">
        <div class="exam-meta">
          <span class="chip chip-strong" data-el="position"></span>
          <span class="chip chip-mode" data-el="modeChip"></span>
          <span class="chip exam-clock" data-el="clockChip">${icon("clock")}<span data-el="clock"></span></span>
        </div>
        <div class="q-card">
          <span class="q-subject">${escapeHtml(code)} &middot; ${escapeHtml(title)}</span>
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
      <div class="drawer-actions" data-el="drawerActions"></div>
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
    } else if (chosen === item.correct) {
      el.feedback.className = "exam-feedback show good";
      el.feedback.innerHTML = "<strong>Correct!</strong> Nice work.";
    } else {
      const letter = String.fromCharCode(65 + item.correct);
      const skipped = chosen === undefined;
      el.feedback.className = `exam-feedback show bad${skipped ? " skipped" : ""}`;
      el.feedback.innerHTML = `
        <div class="fb-head">
          <span class="fb-icon">${skipped ? "&ndash;" : "&#10005;"}</span>
          <div>
            <p class="fb-title">${skipped ? "Not answered" : "Incorrect"}</p>
            <p class="fb-sub">${skipped ? "You skipped this question." : "Don't worry &mdash; here's what you need to know."}</p>
          </div>
        </div>
        <div class="fb-answer">
          <span class="fb-label">Correct answer</span>
          <span class="fb-value"><span class="fb-key">${letter}</span>${escapeHtml(item.options[item.correct])}</span>
        </div>
        ${item.explanation ? `<div class="fb-explain"><span class="fb-label">Explanation</span><p>${escapeHtml(item.explanation)}</p></div>` : ""}`;
    }
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
      el.drawerActions.innerHTML = `
        <button type="button" class="drawer-btn drawer-btn-dark" data-action="end-study">End study &amp; see results</button>
        <button type="button" class="drawer-btn" data-action="restart">Restart with new random order</button>
        <button type="button" class="drawer-btn" data-action="change-mode">Change mode</button>`;
    } else if (!submitted) {
      el.score.innerHTML = `<small>Exam Mode</small><strong>${answered}</strong> of <strong>${n}</strong> answered<br><small>${n - answered} unanswered &middot; <span data-el="drawerClock">${formatTime(secondsLeft())}</span> left</small>`;
      el.legend.innerHTML = '<span class="dot answered"></span>Answered <span class="dot empty"></span>Unanswered';
      el.drawerActions.innerHTML = `
        <button type="button" class="drawer-btn drawer-btn-dark" data-action="submit">Submit exam</button>
        <button type="button" class="drawer-btn" data-action="change-mode">Change mode</button>`;
    } else {
      const pct = Math.round((correct / n) * 100);
      el.score.innerHTML = `<small>Exam result</small><strong>${pct}%</strong> &middot; ${passed() ? "Passed" : "Not passed"}<br><small>${correct} of ${n} correct &middot; pass mark ${PASS_MARK}%</small>`;
      el.legend.innerHTML = '<span class="dot correct"></span>Correct <span class="dot wrong"></span>Wrong <span class="dot skipped"></span>Unanswered';
      el.drawerActions.innerHTML = `
        <button type="button" class="drawer-btn drawer-btn-dark" data-action="results">View results</button>
        <button type="button" class="drawer-btn" data-action="retake">Retake exam</button>
        <button type="button" class="drawer-btn" data-action="change-mode">Change mode</button>`;
    }
  }

  const passed = () => (correctCount() / order.length) * 100 >= PASS_MARK;

  function renderStudyResult() {
    const n = order.length;
    const answered = answers.size;
    const correct = correctCount();
    const wrong = answered - correct;
    const pct = answered ? Math.round((correct / answered) * 100) : 0;
    const taken = (finishedAt - startedAt) / 1000;
    const remaining = n - answered;
    el.resultView.innerHTML = `
      <div class="result-card study">
        ${remaining ? `<p class="result-note">Session ended early &mdash; ${remaining} question${remaining === 1 ? "" : "s"} not attempted.</p>` : ""}
        <div class="result-ring" style="--p:${pct}"><span>${pct}%</span></div>
        <h1>Study summary</h1>
        <p class="result-sub">You answered ${correct} of ${answered} question${answered === 1 ? "" : "s"} correctly (${answered} of ${n} attempted).</p>
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
          <button type="button" class="result-btn" data-action="change-mode">Change mode</button>
        </div>
      </div>`;
  }

  function renderResult() {
    if (mode === "study") return renderStudyResult();
    const n = order.length;
    const correct = correctCount();
    const unanswered = n - answers.size;
    const wrong = n - correct - unanswered;
    const pct = Math.round((correct / n) * 100);
    const ok = passed();
    const taken = Math.min((finishedAt - startedAt) / 1000, EXAM_SECONDS);
    el.resultView.innerHTML = `
      <div class="result-card ${ok ? "pass" : "fail"}">
        ${timeUp ? '<p class="result-note">Time is up &mdash; your exam was submitted automatically.</p>' : ""}
        <div class="result-ring" style="--p:${pct}"><span>${pct}%</span></div>
        <h1>${ok ? "Passed" : "Not passed"}</h1>
        <p class="result-sub">You scored ${correct} out of ${n}. The pass mark is ${PASS_MARK}% (${Math.ceil((n * PASS_MARK) / 100)} correct).</p>
        <div class="result-stats">
          <div><strong class="good">${correct}</strong><span>Correct</span></div>
          <div><strong class="bad">${wrong}</strong><span>Wrong</span></div>
          <div><strong>${unanswered}</strong><span>Unanswered</span></div>
          <div><strong>${formatTime(taken)}</strong><span>Time taken</span></div>
        </div>
        <div class="result-actions">
          <button type="button" class="result-btn primary" data-action="review">Review answers</button>
          <button type="button" class="result-btn" data-action="retake">Retake exam</button>
          <button type="button" class="result-btn" data-action="change-mode">Change mode</button>
        </div>
      </div>`;
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
      return;
    }

    const n = order.length;
    el.progress.style.width = `${(answers.size / n) * 100}%`;
    renderDrawer();
    if (phase !== "quiz") return;

    el.position.textContent = `Q ${current + 1} / ${n}`;
    el.question.textContent = q().text;
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

    const target = e.target.closest("[data-mode], [data-option], [data-action], [data-goto]");
    if (!target) return;

    if (target.dataset.mode) {
      begin(target.dataset.mode);
    } else if (target.dataset.option !== undefined) {
      const item = q();
      if (isRevealed(item)) return;
      answers.set(item.id, Number(target.dataset.option));
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
          phase = "quiz";
          go(0);
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
