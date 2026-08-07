const app = document.getElementById("app");

const defaultState = {
  currentUser: null,
  learnerName: "Demo Learner",
  moduleProgress: {},
  practicalSignoff: false,
  trainerComments: ""
};

let state = loadState();
let currentModuleId = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("pcaTrainingWebAppV1"));
    return { ...defaultState, ...(saved || {}) };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem("pcaTrainingWebAppV1", JSON.stringify(state));
}

function getModuleState(id) {
  return state.moduleProgress[id] || {
    lessonComplete: false,
    quizPassed: false,
    quizScore: 0
  };
}

function setModuleState(id, patch) {
  state.moduleProgress[id] = { ...getModuleState(id), ...patch };
  saveState();
}

function overallProgress() {
  const totalUnits = TRAINING_MODULES.length * 2 + 1;
  let completed = state.practicalSignoff ? 1 : 0;

  TRAINING_MODULES.forEach(module => {
    const m = getModuleState(module.id);
    if (m.lessonComplete) completed++;
    if (m.quizPassed) completed++;
  });

  return Math.round((completed / totalUnits) * 100);
}

function passedModules() {
  return TRAINING_MODULES.filter(m => getModuleState(m.id).quizPassed).length;
}

function renderShell(content) {
  const user = state.currentUser;
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <h1>PCA Theatre Training Hub</h1>
          <p>Digital onboarding, knowledge checks and practical competency</p>
        </div>
        <div class="top-actions">
          ${user ? `<button class="btn btn-secondary" id="switchRoleBtn">Switch role</button>` : ""}
          ${user ? `<button class="btn btn-danger" id="resetBtn">Reset demo</button>` : ""}
        </div>
      </header>
      <main class="page">${content}</main>
    </div>
  `;

  document.getElementById("switchRoleBtn")?.addEventListener("click", () => {
    state.currentUser = null;
    saveState();
    renderLogin();
  });

  document.getElementById("resetBtn")?.addEventListener("click", () => {
    if (confirm("Reset all demo progress?")) {
      localStorage.removeItem("pcaTrainingWebAppV1");
      state = { ...defaultState, moduleProgress: {} };
      renderLogin();
    }
  });
}

function renderLogin() {
  renderShell(`
    <div class="login-wrap">
      <section class="card login-card">
        <h2>Welcome</h2>
        <p class="small">This prototype lets you test the learner and trainer experience.</p>

        <label>
          Full name
          <input id="nameInput" type="text" placeholder="e.g. Alex Smith" />
        </label>

        <label>
          Role
          <select id="roleInput">
            <option value="learner">New PCA</option>
            <option value="trainer">Trainer</option>
          </select>
        </label>

        <button class="btn" id="loginBtn">Continue</button>
      </section>
    </div>
  `);

  document.getElementById("loginBtn").addEventListener("click", () => {
    const name = document.getElementById("nameInput").value.trim();
    const role = document.getElementById("roleInput").value;

    if (!name) {
      alert("Please enter your name.");
      return;
    }

    state.currentUser = { name, role };
    if (role === "learner") state.learnerName = name;
    saveState();

    role === "learner" ? renderLearnerDashboard() : renderTrainerDashboard();
  });
}

function renderLearnerDashboard() {
  const progress = overallProgress();

  const moduleCards = TRAINING_MODULES.map((module, index) => {
    const m = getModuleState(module.id);
    const status = m.quizPassed
      ? ["Completed", "badge-complete"]
      : m.lessonComplete
        ? ["Quiz required", "badge-in-progress"]
        : ["Not started", "badge-not-started"];

    return `
      <section class="card module-card">
        <div class="small">Module ${index + 1} · ${module.duration}</div>
        <h3>${module.title}</h3>
        <p>${module.summary}</p>
        <div class="module-meta">
          <span class="badge ${status[1]}">${status[0]}</span>
          <button class="btn open-module" data-id="${module.id}">
            ${m.lessonComplete ? "Continue" : "Start"}
          </button>
        </div>
      </section>
    `;
  }).join("");

  renderShell(`
    <section class="hero">
      <div>
        <h2>Welcome, ${escapeHtml(state.learnerName)}</h2>
        <p>Complete each lesson and quiz, then arrange practical competency sign-off.</p>
      </div>
      <div class="card kpi">
        <strong>${progress}%</strong>
        <span class="small">Overall progress</span>
      </div>
    </section>

    <div class="progress-track">
      <div class="progress-bar" style="width:${progress}%"></div>
    </div>

    <div class="grid grid-3">${moduleCards}</div>

    <div class="section-title">
      <h3>Final practical competency</h3>
    </div>

    <section class="card">
      <p>${state.practicalSignoff
        ? "Your practical competency has been signed off."
        : "A trainer must observe your practical work after you complete the required online modules."}</p>
      <span class="badge ${state.practicalSignoff ? "badge-complete" : "badge-in-progress"}">
        ${state.practicalSignoff ? "Signed off" : "Pending"}
      </span>
    </section>

    <p class="footer-note">Prototype only. Replace all lesson content with approved hospital procedures before use.</p>
  `);

  document.querySelectorAll(".open-module").forEach(btn => {
    btn.addEventListener("click", () => {
      currentModuleId = btn.dataset.id;
      renderLesson(currentModuleId);
    });
  });
}

function renderLesson(moduleId) {
  const module = TRAINING_MODULES.find(m => m.id === moduleId);
  const m = getModuleState(moduleId);

  renderShell(`
    <button class="btn btn-secondary" id="backBtn">← Back to dashboard</button>

    <article class="card lesson" style="margin-top:16px;">
      <div class="small">${module.duration}</div>
      <h2>${module.title}</h2>

      <h3>Learning objective</h3>
      <p>${module.lesson.objective}</p>

      <h3>Why this matters</h3>
      <p>${module.lesson.why}</p>

      <div class="notice">
        This is demonstration content. Final wording, sequence, products, PPE and responsibilities must be approved locally.
      </div>

      <h3>Training video</h3>
      <div class="video-placeholder">
        <div>
          <strong>Video placeholder</strong>
          <p class="small">An approved demonstration video can be added here.</p>
        </div>
      </div>

      <h3>Approved process structure</h3>
      <ol>${module.lesson.steps.map(step => `<li>${step}</li>`).join("")}</ol>

      <h3>Common mistakes</h3>
      <ul>${module.lesson.mistakes.map(item => `<li>${item}</li>`).join("")}</ul>

      <button class="btn" id="completeLessonBtn">
        ${m.lessonComplete ? "Continue to quiz" : "Mark lesson complete"}
      </button>
    </article>
  `);

  document.getElementById("backBtn").addEventListener("click", renderLearnerDashboard);
  document.getElementById("completeLessonBtn").addEventListener("click", () => {
    setModuleState(moduleId, { lessonComplete: true });
    renderQuiz(moduleId);
  });
}

function renderQuiz(moduleId) {
  const module = TRAINING_MODULES.find(m => m.id === moduleId);

  const questions = module.quiz.map((item, index) => `
    <fieldset>
      <legend><strong>${index + 1}. ${item.q}</strong></legend>
      ${item.options.map((option, optionIndex) => `
        <label class="quiz-option">
          <input type="radio" name="q${index}" value="${optionIndex}" />
          ${option}
        </label>
      `).join("")}
    </fieldset>
  `).join("");

  renderShell(`
    <button class="btn btn-secondary" id="backBtn">← Back to lesson</button>

    <form class="card lesson" id="quizForm" style="margin-top:16px;">
      <h2>${module.title}: Knowledge Check</h2>
      <p class="small">Pass mark: 80%</p>
      ${questions}
      <button class="btn" type="submit">Submit quiz</button>
      <div id="quizResult"></div>
    </form>
  `);

  document.getElementById("backBtn").addEventListener("click", () => renderLesson(moduleId));

  document.getElementById("quizForm").addEventListener("submit", event => {
    event.preventDefault();

    let correct = 0;
    let answered = 0;

    module.quiz.forEach((item, index) => {
      const selected = document.querySelector(`input[name="q${index}"]:checked`);
      if (selected) {
        answered++;
        if (Number(selected.value) === item.answer) correct++;
      }
    });

    const result = document.getElementById("quizResult");

    if (answered !== module.quiz.length) {
      result.className = "result result-fail";
      result.textContent = "Please answer every question.";
      return;
    }

    const score = Math.round((correct / module.quiz.length) * 100);
    const passed = score >= 80;
    setModuleState(moduleId, { quizPassed: passed, quizScore: score });

    result.className = `result ${passed ? "result-pass" : "result-fail"}`;
    result.innerHTML = passed
      ? `Passed: ${score}%. <button type="button" class="btn" id="dashboardBtn" style="margin-left:10px;">Return to dashboard</button>`
      : `Score: ${score}%. Review the lesson and try again.`;

    document.getElementById("dashboardBtn")?.addEventListener("click", renderLearnerDashboard);
  });
}

function renderTrainerDashboard() {
  const completedLessons = TRAINING_MODULES.filter(m => getModuleState(m.id).lessonComplete).length;
  const passed = passedModules();

  const rows = TRAINING_MODULES.map(module => {
    const m = getModuleState(module.id);
    return `
      <tr>
        <td>${module.title}</td>
        <td>${m.lessonComplete ? "Completed" : "Not completed"}</td>
        <td>${m.quizPassed ? `Passed (${m.quizScore}%)` : m.quizScore ? `Not passed (${m.quizScore}%)` : "Not attempted"}</td>
      </tr>
    `;
  }).join("");

  renderShell(`
    <section class="hero">
      <div>
        <h2>Trainer Dashboard</h2>
        <p>Signed in as ${escapeHtml(state.currentUser.name)}</p>
      </div>
      <div class="grid grid-2">
        <div class="card kpi"><strong>${completedLessons}/${TRAINING_MODULES.length}</strong><span class="small">Lessons completed</span></div>
        <div class="card kpi"><strong>${passed}/${TRAINING_MODULES.length}</strong><span class="small">Quizzes passed</span></div>
      </div>
    </section>

    <section class="card">
      <h3>Learner: ${escapeHtml(state.learnerName)}</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Module</th><th>Lesson</th><th>Quiz</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h3>Practical competency sign-off</h3>
      <p class="small">The trainer should only sign off after directly observing the learner perform the approved practical tasks.</p>

      ${COMPETENCY_ITEMS.map((item, index) => `
        <label class="check-row">
          <input type="checkbox" class="competencyCheck" />
          <span>${item}</span>
        </label>
      `).join("")}

      <label>
        Trainer comments
        <textarea id="trainerComments" placeholder="Strengths, corrections or actions required">${escapeHtml(state.trainerComments || "")}</textarea>
      </label>

      <button class="btn" id="signoffBtn">${state.practicalSignoff ? "Update sign-off" : "Complete sign-off"}</button>
      <div id="signoffResult"></div>
    </section>

    <p class="footer-note">This prototype stores progress only in this browser. A production version needs secure authentication, a database and hospital approval.</p>
  `);

  document.getElementById("signoffBtn").addEventListener("click", () => {
    const checks = [...document.querySelectorAll(".competencyCheck")];
    const allChecked = checks.every(c => c.checked);
    const result = document.getElementById("signoffResult");

    if (passed < TRAINING_MODULES.length) {
      result.className = "result result-fail";
      result.textContent = "The learner must pass all module quizzes before final sign-off.";
      return;
    }

    if (!allChecked) {
      result.className = "result result-fail";
      result.textContent = "Confirm every observed competency item before signing off.";
      return;
    }

    state.practicalSignoff = true;
    state.trainerComments = document.getElementById("trainerComments").value.trim();
    saveState();

    result.className = "result result-pass";
    result.textContent = "Practical competency signed off successfully.";
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

if (!state.currentUser) {
  renderLogin();
} else if (state.currentUser.role === "trainer") {
  renderTrainerDashboard();
} else {
  renderLearnerDashboard();
}
