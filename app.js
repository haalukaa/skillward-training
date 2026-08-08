const app = document.getElementById("app");

const defaultState = {
  currentUser: null,
  selectedDepartment: null,
  learnerName: "Staff Learner",
  moduleProgress: {},
  practicalSignoff: false,
  trainerComments: ""
};

const DEPARTMENTS = [
  {
    id: "operating-theatre",
    code: "OT",
    name: "Operating Theatre & Recovery",
    summary: "PCA onboarding, theatre and recovery workflows, cleaning, safety and practical competency.",
    detail: "6 modules",
    active: true
  },
  {
    id: "day-surgery",
    code: "DS",
    name: "Day Surgery",
    summary: "Patient preparation, movement, daily readiness and day-surgery support workflows.",
    detail: "Planned",
    active: false
  },
  {
    id: "acute-surgical-unit",
    code: "ASU",
    name: "Acute Surgical Unit",
    summary: "PCA support, patient flow, equipment readiness and Acute Surgical Unit workflows.",
    detail: "Planned",
    active: false
  },
  {
    id: "dialysis",
    code: "DI",
    name: "Dialysis",
    summary: "Patient support, treatment-area readiness, cleaning and dialysis workflows.",
    detail: "Planned",
    active: false
  },
  {
    id: "gastro",
    code: "GA",
    name: "Gastro",
    summary: "Procedure-area preparation, patient support, cleaning and gastro workflows.",
    detail: "Planned",
    active: false
  },
  {
    id: "emergency-department",
    code: "ED",
    name: "Emergency Department",
    summary: "Department readiness, urgent patient transport, safety and emergency workflows.",
    detail: "Planned",
    active: false
  }
];

function departmentIcon(departmentId) {
  const paths = {
    "operating-theatre": `
      <path d="M4 16h16M6 16v3m12-3v3M7 13h10l2 3H5l2-3Z" />
      <path d="M12 4v3m-4.5-.5 2 2m7-2-2 2M8 11a4 4 0 0 1 8 0" />`,
    "day-surgery": `
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2m0-14-2 2M7 17l-2 2" />`,
    "acute-surgical-unit": `
      <path d="M3 18V8m0 7h18v3M6 15v-4h5a3 3 0 0 1 3 3v1" />
      <path d="M15 8h2m-1-1v2" />`,
    "dialysis": `
      <path d="M12 3S6.5 9.5 6.5 14a5.5 5.5 0 0 0 11 0C17.5 9.5 12 3 12 3Z" />
      <path d="M10 17c1.8 1 4 .2 4.8-1.6" />`,
    "gastro": `
      <path d="M10 3v6c0 1.2-.8 2.2-2 2.6-2.2.8-3 3.3-2 5.3 1.2 2.4 4.3 3.4 6.6 2 2.8-1.7 3.2-4.8 2.4-7.4-.6-2 .2-3.9 2-4.8" />
      <path d="M17 6.7c1.3 1 2 2.5 2 4.3" />`,
    "emergency-department": `
      <path d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5V3Z" />
      <path d="m6 12 3-1 2 3 2-5 2 3h3" />`
  };

  return `<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[departmentId] || ""}</svg>`;
}

let state = loadState();
let currentModuleId = null;
let currentAreaId = null;

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

function getArea(areaId) {
  return TRAINING_AREAS.find(area => area.id === areaId);
}

function modulesForArea(areaId) {
  return TRAINING_MODULES.filter(module => module.area === areaId);
}

function moduleCard(module) {
  const m = getModuleState(module.id);
  const status = m.quizPassed
    ? ["Completed", "badge-complete"]
    : m.lessonComplete
      ? ["Quiz required", "badge-in-progress"]
      : ["Not started", "badge-not-started"];

  return `
    <section class="card module-card">
      <div class="module-card-head">
        <span class="module-number">${String(module.number).padStart(2, "0")}</span>
        <span class="module-duration">${module.duration}</span>
      </div>
      <div>
        <div class="small">MODULE ${module.number}</div>
        <h3>${module.title}</h3>
      </div>
      <p>${module.summary}</p>
      <div class="module-meta">
        <span class="badge ${status[1]}">${status[0]}</span>
        <button class="btn open-module" data-id="${module.id}">
          ${m.lessonComplete ? "Continue" : "Start"}
        </button>
      </div>
    </section>
  `;
}

function bindModuleButtons() {
  document.querySelectorAll(".open-module").forEach(btn => {
    btn.addEventListener("click", () => {
      currentModuleId = btn.dataset.id;
      currentAreaId = TRAINING_MODULES.find(module => module.id === currentModuleId)?.area || currentAreaId;
      renderLesson(currentModuleId);
    });
  });
}

function renderShell(content) {
  const user = state.currentUser;
  const department = DEPARTMENTS.find(item => item.id === state.selectedDepartment);
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 48 54" focusable="false">
              <path class="logo-shield" d="M24 2 44 9v16c0 13-8 22-20 28C12 47 4 38 4 25V9L24 2Z" />
              <text class="logo-letters" x="24" y="31" text-anchor="middle">SW</text>
            </svg>
          </div>
          <div class="brand-copy">
            <h1>SkillWard</h1>
            <p>${department ? `${department.name} Training Hub` : "Healthcare Workforce Training"}</p>
          </div>
        </div>
        <div class="top-actions">
          ${user ? `<span class="role-pill">${user.role === "trainer" ? "Trainer" : "Staff learner"}</span>` : ""}
          ${user && department ? `<button class="btn btn-secondary" id="changeDepartmentBtn">Departments</button>` : ""}
          ${user ? `<button class="btn btn-secondary" id="switchRoleBtn">Switch role</button>` : ""}
        </div>
      </header>
      <main class="page">${content}</main>
      <footer class="site-footer">
        <div class="footer-inner">
          <span class="footer-wordmark">SkillWard</span>
          <span class="footer-divider" aria-hidden="true"></span>
          <span>Co-founded by <strong>Haleluya Yilma</strong> and <strong>Abdulkader</strong></span>
        </div>
      </footer>
    </div>
  `;

  document.getElementById("switchRoleBtn")?.addEventListener("click", () => {
    state.currentUser = null;
    state.selectedDepartment = null;
    saveState();
    renderLogin();
  });

  document.getElementById("changeDepartmentBtn")?.addEventListener("click", () => {
    state.selectedDepartment = null;
    saveState();
    renderDepartmentSelection();
  });

}

function renderLogin() {
  renderShell(`
    <div class="login-layout">
      <section class="login-intro">
        <div class="login-label"><span></span> Healthcare workforce enablement</div>
        <h2>Build confidence before the first shift.</h2>
        <p>Structured, role-based learning that turns approved procedures into confident workplace practice.</p>
        <div class="learning-flow" aria-label="SkillWard learning process">
          <div><span>01</span><strong>Learn</strong><small>Role-based pathways</small></div>
          <i aria-hidden="true"></i>
          <div><span>02</span><strong>Validate</strong><small>Knowledge checks</small></div>
          <i aria-hidden="true"></i>
          <div><span>03</span><strong>Sign off</strong><small>Observed competency</small></div>
        </div>
        <p class="login-platform-note">Designed for hospital teams, trainers and frontline staff.</p>
      </section>
      <section class="card login-card">
        <div class="access-label"><span></span> SKILLWARD ACCESS</div>
        <h2>Enter your workspace</h2>
        <p class="login-card-intro">Choose your role to continue to the correct training environment.</p>

        <label>
          <span>Full name</span>
          <input id="nameInput" type="text" placeholder="e.g. Alex Smith" />
        </label>

        <label>
          <span>Workspace role</span>
          <select id="roleInput">
            <option value="learner">Staff / Learner</option>
            <option value="trainer">Trainer</option>
          </select>
        </label>

        <button class="btn btn-wide login-submit" id="loginBtn">Continue to SkillWard <span aria-hidden="true">→</span></button>
        <div class="access-note"><span aria-hidden="true">✓</span> Training access is organised by role and department.</div>
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
    state.selectedDepartment = null;
    if (role === "learner") state.learnerName = name;
    saveState();

    renderDepartmentSelection();
  });
}

function renderDepartmentSelection() {
  const departmentCards = DEPARTMENTS.map(department => `
    <article class="department-card ${department.active ? "department-active" : "department-planned"}">
      <div class="department-card-top">
        <span class="department-icon" aria-hidden="true">${departmentIcon(department.id)}</span>
        <span class="department-status ${department.active ? "status-active" : "status-planned"}">
          ${department.active ? "Available" : "Coming soon"}
        </span>
      </div>
      <div>
        <h3>${department.name}</h3>
        <p>${department.summary}</p>
      </div>
      <div class="department-card-footer">
        <span>${department.detail}</span>
        ${department.active
          ? `<button class="btn open-department" data-id="${department.id}">Open department</button>`
          : `<button class="btn btn-disabled" disabled>In development</button>`}
      </div>
    </article>
  `).join("");

  renderShell(`
    <section class="department-heading">
      <span class="eyebrow">TRAINING DIRECTORY</span>
      <h2>Choose your department</h2>
      <p>Open the learning pathway assigned to your role. Additional departments will be introduced as their content is approved.</p>
    </section>

    <div class="department-grid">${departmentCards}</div>

    <div class="platform-note">
      <strong>One platform, multiple departments.</strong>
      <span>SkillWard keeps role-based learning, competency and progress in one consistent experience.</span>
    </div>
  `);

  document.querySelectorAll(".open-department").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedDepartment = button.dataset.id;
      saveState();
      state.currentUser.role === "trainer" ? renderTrainerDashboard() : renderLearnerDashboard();
    });
  });
}

function renderLearnerDashboard() {
  const progress = overallProgress();
  const completedLessons = TRAINING_MODULES.filter(module => getModuleState(module.id).lessonComplete).length;
  const passed = passedModules();
  const remaining = TRAINING_MODULES.length - passed;

  const areaCards = TRAINING_AREAS.map((area, index) => {
    const areaModules = modulesForArea(area.id);
    const areaPassed = areaModules.filter(module => getModuleState(module.id).quizPassed).length;
    const areaPercent = Math.round((areaPassed / areaModules.length) * 100);
    return `
      <article class="card training-area-card">
        <div class="training-area-top">
          <span class="area-code">${area.code}</span>
          <span class="small">AREA ${index + 1}</span>
        </div>
        <div>
          <h3>${area.name}</h3>
          <span class="area-full-name">${area.fullName}</span>
          <p>${area.summary}</p>
        </div>
        <div class="area-progress"><span style="width:${areaPercent}%"></span></div>
        <div class="module-meta">
          <span class="small">${areaPassed}/${areaModules.length} modules complete</span>
          <button class="btn open-area" data-id="${area.id}">Open area</button>
        </div>
      </article>
    `;
  }).join("");

  renderShell(`
    <section class="dashboard-hero">
      <div class="dashboard-welcome">
        <span class="eyebrow">MY LEARNING</span>
        <h2>Welcome, ${escapeHtml(state.learnerName)}</h2>
        <p>Choose your assigned work area and continue the Operating Theatre & Recovery learning pathway.</p>
      </div>
      <div class="progress-ring" style="--progress:${progress * 3.6}deg" aria-label="${progress}% overall progress">
        <div><strong>${progress}%</strong><span>complete</span></div>
      </div>
    </section>

    <div class="stats-grid">
      <div class="stat-card"><span>Lessons viewed</span><strong>${completedLessons}/${TRAINING_MODULES.length}</strong></div>
      <div class="stat-card"><span>Knowledge checks</span><strong>${passed}/${TRAINING_MODULES.length}</strong></div>
      <div class="stat-card"><span>Modules remaining</span><strong>${remaining}</strong></div>
    </div>

    <div class="section-heading">
      <div><span class="eyebrow">OPERATING THEATRE & RECOVERY</span><h3>Choose a training area</h3></div>
      <span class="small">3 areas · ${TRAINING_MODULES.length} modules</span>
    </div>
    <div class="grid grid-3">${areaCards}</div>

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

    <p class="footer-note">Training content must be reviewed and approved by the relevant hospital teams before workplace use.</p>
  `);

  document.querySelectorAll(".open-area").forEach(btn => {
    btn.addEventListener("click", () => {
      currentAreaId = btn.dataset.id;
      renderAreaDashboard(currentAreaId);
    });
  });
}

function renderAreaDashboard(areaId) {
  const area = getArea(areaId);
  if (!area) {
    renderLearnerDashboard();
    return;
  }

  currentAreaId = areaId;
  const areaModules = modulesForArea(areaId);
  const completed = areaModules.filter(module => getModuleState(module.id).quizPassed).length;

  renderShell(`
    <button class="btn btn-secondary" id="backBtn">← Back to training areas</button>

    <section class="area-hero">
      <div class="area-code area-code-large">${area.code}</div>
      <div>
        <span class="eyebrow">OPERATING THEATRE & RECOVERY</span>
        <h2>${area.name}</h2>
        <p>${area.fullName}</p>
      </div>
      <div class="area-completion"><strong>${completed}/${areaModules.length}</strong><span>complete</span></div>
    </section>

    <div class="area-workflow-note">
      <strong>Your role in this area</strong>
      <span>${area.summary}</span>
    </div>

    <div class="section-heading">
      <div><span class="eyebrow">AREA TRAINING</span><h3>Lessons and knowledge checks</h3></div>
      <span class="small">${areaModules.length} modules</span>
    </div>
    <div class="grid grid-2">${areaModules.map(moduleCard).join("")}</div>

    <p class="footer-note">Draft training content must be reviewed and approved by the relevant hospital teams before workplace use.</p>
  `);

  document.getElementById("backBtn").addEventListener("click", renderLearnerDashboard);
  bindModuleButtons();
}

function renderLesson(moduleId) {
  const module = TRAINING_MODULES.find(m => m.id === moduleId);
  const m = getModuleState(moduleId);

  renderShell(`
    <button class="btn btn-secondary" id="backBtn">← Back to ${getArea(module.area)?.name || "training area"}</button>

    <article class="card lesson" style="margin-top:16px;">
      <div class="small">${module.duration}</div>
      <h2>${module.title}</h2>

      <h3>Learning objective</h3>
      <p>${module.lesson.objective}</p>

      <h3>Why this matters</h3>
      <p>${module.lesson.why}</p>

      <div class="notice">
        Always follow your organisation's current approved procedures. Local requirements take priority if they differ from this module.
      </div>

      <h3>Training video</h3>
      <div class="video-placeholder">
        <div>
          <strong>Training video</strong>
          <p class="small">Approved video content will be available here.</p>
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

  document.getElementById("backBtn").addEventListener("click", () => renderAreaDashboard(module.area));
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
      ? `Passed: ${score}%. <button type="button" class="btn" id="dashboardBtn" style="margin-left:10px;">Return to ${getArea(module.area)?.name || "training area"}</button>`
      : `Score: ${score}%. Review the lesson and try again.`;

    document.getElementById("dashboardBtn")?.addEventListener("click", () => renderAreaDashboard(module.area));
  });
}

function renderTrainerDashboard() {
  const completedLessons = TRAINING_MODULES.filter(m => getModuleState(m.id).lessonComplete).length;
  const passed = passedModules();

  const rows = TRAINING_MODULES.map(module => {
    const m = getModuleState(module.id);
    return `
      <tr>
        <td>${getArea(module.area)?.name || "—"}</td>
        <td>${module.title}</td>
        <td>${m.lessonComplete ? "Completed" : "Not completed"}</td>
        <td>${m.quizPassed ? `Passed (${m.quizScore}%)` : m.quizScore ? `Not passed (${m.quizScore}%)` : "Not attempted"}</td>
      </tr>
    `;
  }).join("");

  renderShell(`
    <section class="dashboard-hero trainer-hero">
      <div class="dashboard-welcome">
        <span class="eyebrow">TRAINER WORKSPACE</span>
        <h2>Trainer Dashboard</h2>
        <p>Monitor learning progress and record observed practical competency.</p>
      </div>
      <div class="trainer-identity">
        <span>Signed in as</span>
        <strong>${escapeHtml(state.currentUser.name)}</strong>
      </div>
    </section>

    <div class="stats-grid trainer-stats">
      <div class="stat-card"><span>Lessons completed</span><strong>${completedLessons}/${TRAINING_MODULES.length}</strong></div>
      <div class="stat-card"><span>Quizzes passed</span><strong>${passed}/${TRAINING_MODULES.length}</strong></div>
      <div class="stat-card"><span>Practical sign-off</span><strong class="status-word">${state.practicalSignoff ? "Complete" : "Pending"}</strong></div>
    </div>

    <section class="card dashboard-card">
      <h3>Learner: ${escapeHtml(state.learnerName)}</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Area</th><th>Module</th><th>Lesson</th><th>Quiz</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>

    <section class="card dashboard-card">
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

    <p class="footer-note">This preview stores progress only in this browser. Secure accounts and central reporting will be enabled before operational use.</p>
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
} else if (!state.selectedDepartment) {
  renderDepartmentSelection();
} else if (state.currentUser.role === "trainer") {
  renderTrainerDashboard();
} else {
  renderLearnerDashboard();
}
