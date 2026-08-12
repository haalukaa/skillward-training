const app = document.getElementById("app");

const defaultState = {
  currentUser: null,
  selectedDepartment: null,
  learnerName: "Staff Learner",
  moduleProgress: {},
  practicalSignoff: false,
  trainerComments: "",
  trainerAssignments: null,
  traineeRecords: null
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

const WORKPLACE_ROLES = {
  pca: "PCA",
  cleaner: "Cleaner",
  "pca-trainer": "PCA Trainer",
  "cleaner-trainer": "Cleaner Trainer",
  management: "Management"
};

const DEPARTMENT_SELECTION_ROLES = new Set(["pca", "cleaner", "management"]);

const NAV_ITEMS = [
  ["home", "Home", "⌂"],
  ["training", "Training", "▷"],
  ["staff", "Staff", "♙"],
  ["reports", "Reports", "▥"]
];

function workplaceRoleLabel(role) {
  return WORKPLACE_ROLES[role] || "Staff member";
}

function normalizeCurrentUserRole() {
  const role = state.currentUser?.role;

  if (role === "learner" || role === "trainer") {
    state.currentUser.role = role === "trainer" ? "pca-trainer" : "pca";
    saveState();
  }
}

function workflowRecords() {
  if (!Array.isArray(state.traineeRecords)) state.traineeRecords = JSON.parse(JSON.stringify(TRAINEE_RECORDS));
  return state.traineeRecords;
}

function assignmentDirectory() {
  if (!Array.isArray(state.trainerAssignments)) state.trainerAssignments = JSON.parse(JSON.stringify(TRAINER_DIRECTORY));
  return state.trainerAssignments;
}

function currentTrainerRecord() {
  const role = state.currentUser?.role;
  const named = assignmentDirectory().find(item => item.role === role && item.name.toLowerCase() === state.currentUser.name.toLowerCase());
  return named || assignmentDirectory().find(item => item.role === role);
}

function assignedDepartmentsForCurrentTrainer() {
  return currentTrainerRecord()?.departments || [];
}

function departmentName(id) {
  return DEPARTMENTS.find(item => item.id === id)?.name || id;
}

function statusTone(status) {
  if (status === "Approved") return "success";
  if (status === "Reassessment Required") return "danger";
  return status === "Not Started" ? "neutral" : "warning";
}

function routeSignedInUser() {
  normalizeCurrentUserRole();

  if (state.currentUser?.role?.includes("trainer")) {
    const assigned = assignedDepartmentsForCurrentTrainer();
    if (!assigned.includes(state.selectedDepartment)) state.selectedDepartment = assigned[0] || null;
    saveState();
  }

  if (DEPARTMENT_SELECTION_ROLES.has(state.currentUser.role) && !state.selectedDepartment) {
    renderDepartmentSelection();
    return;
  }

  routeCurrentUser();
}

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
  const authenticatedWorkspace = Boolean(user && (department || user.role?.includes("trainer")));
  const navigation = NAV_ITEMS.map(([id, label, icon], index) => `
    <button class="workspace-nav-item ${index === 0 ? "is-active" : ""}" data-nav="${id}" aria-label="${label}">
      <span aria-hidden="true">${icon}</span><small>${label}</small>
    </button>
  `).join("");
  app.innerHTML = `
    <div class="shell ${authenticatedWorkspace ? "authenticated-shell" : ""}">
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
          ${authenticatedWorkspace ? `<button class="notification-button" aria-label="Notifications"><span aria-hidden="true">●</span></button>` : ""}
          ${user ? `<span class="role-pill">${workplaceRoleLabel(user.role)}</span>` : ""}
          ${authenticatedWorkspace ? `<button class="profile-button" id="switchRoleBtn" aria-label="User profile: ${escapeHtml(user.name)}"><span>${escapeHtml(user.name).charAt(0).toUpperCase()}</span><strong>${escapeHtml(user.name)}</strong></button>` : user ? `<button class="btn btn-secondary" id="switchRoleBtn">Switch role</button>` : ""}
        </div>
      </header>
      ${authenticatedWorkspace ? `<nav class="side-nav" aria-label="Primary navigation">${navigation}</nav>` : ""}
      <main class="page" id="mainContent">${content}</main>
      ${authenticatedWorkspace ? `<nav class="bottom-nav" aria-label="Primary navigation">${navigation}</nav>` : ""}
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

  document.querySelectorAll(".workspace-nav-item").forEach(button => {
    button.addEventListener("click", () => {
      document.getElementById(button.dataset.nav)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

}

function renderLogin() {
  renderShell(`
    <div class="login-layout">
      <section class="login-intro">
        <div class="hero-motion" aria-hidden="true">
          <span class="motion-orb motion-orb-one"></span>
          <span class="motion-orb motion-orb-two"></span>
          <span class="motion-grid"></span>
        </div>
        <div class="login-label hero-reveal hero-reveal-1"><span></span> Healthcare workforce enablement</div>
        <h2 class="hero-title" aria-label="Build your confidence before your first shift">
          <span class="hero-line hero-reveal hero-reveal-2">Build Your Confidence</span>
          <span class="hero-line hero-accent hero-reveal hero-reveal-3">Before Your First Shift<span class="typing-cursor" aria-hidden="true"></span></span>
        </h2>
        <p class="hero-reveal hero-reveal-4">Structured, role-based learning that turns approved procedures into confident workplace practice.</p>
        <div class="learning-flow" aria-label="SkillWard learning process">
          <div><span>01</span><strong>Learn</strong><small>Role-based pathways</small></div>
          <i aria-hidden="true"></i>
          <div><span>02</span><strong>Validate</strong><small>Knowledge checks</small></div>
          <i aria-hidden="true"></i>
          <div><span>03</span><strong>Sign off</strong><small>Observed competency</small></div>
        </div>
        <p class="login-platform-note hero-reveal hero-reveal-5">Designed for hospital teams, trainers and frontline staff.</p>
      </section>
      <div class="login-flip-shell">
        <div class="login-flip" id="loginFlip">
          <section class="card login-card login-card-front" id="welcomeCard">
            <div class="get-started-logo" aria-hidden="true">
              <svg viewBox="0 0 48 54" focusable="false">
                <path class="logo-shield" d="M24 2 44 9v16c0 13-8 22-20 28C12 47 4 38 4 25V9L24 2Z" />
                <text class="logo-letters" x="24" y="31" text-anchor="middle">SW</text>
              </svg>
            </div>
            <h2>Get Started</h2>
            <p class="login-card-intro">Enter your SkillWard workspace.</p>
            <button class="btn btn-wide get-started-btn" id="getStartedBtn">Get Started <span aria-hidden="true">→</span></button>
          </section>

          <section class="card login-card login-card-back" id="workspaceCard" aria-hidden="true" inert>
            <div class="access-label"><span></span> SKILLWARD ACCESS</div>
            <h2>Enter your workspace</h2>
            <p class="login-card-intro">Choose your role to continue to the correct training environment.</p>
            <label><span>Full name</span><input id="nameInput" type="text" placeholder="e.g. Alex Smith" /></label>
            <label>
              <span>Workspace role</span>
              <select id="roleInput">
                <option value="pca">PCA</option>
                <option value="cleaner">Cleaner</option>
                <option value="pca-trainer">PCA Trainer</option>
                <option value="cleaner-trainer">Cleaner Trainer</option>
                <option value="management">Management</option>
              </select>
            </label>
            <button class="btn btn-wide login-submit" id="loginBtn">Continue to SkillWard <span aria-hidden="true">→</span></button>
            <div class="access-note"><span aria-hidden="true">✓</span> Training access is organised by role and department.</div>
          </section>
        </div>
      </div>
    </div>
  `);

  const loginFlip = document.getElementById("loginFlip");
  const welcomeCard = document.getElementById("welcomeCard");
  const workspaceCard = document.getElementById("workspaceCard");

  document.getElementById("getStartedBtn").addEventListener("click", () => {
    loginFlip.classList.add("is-flipped");
    welcomeCard.setAttribute("aria-hidden", "true");
    welcomeCard.setAttribute("inert", "");
    welcomeCard.inert = true;
    workspaceCard.removeAttribute("aria-hidden");
    workspaceCard.removeAttribute("inert");
    workspaceCard.inert = false;
    window.setTimeout(() => document.getElementById("nameInput").focus(), 480);
  });

  document.getElementById("loginBtn").addEventListener("click", () => {
    const name = document.getElementById("nameInput").value.trim();
    const role = document.getElementById("roleInput").value;

    if (!name) {
      alert("Please enter your name.");
      return;
    }

    state.currentUser = { name, role };
    state.selectedDepartment = null;
    if (role === "pca") state.learnerName = name;
    saveState();

    routeSignedInUser();
  });
}

function routeCurrentUser() {
  normalizeCurrentUserRole();
  const role = state.currentUser?.role;

  if (role === "pca") {
    renderLearnerDashboard();
  } else if (role === "pca-trainer" || role === "cleaner-trainer") {
    renderTrainerDashboard();
  } else {
    renderRoleWorkspace(role);
  }
}

function renderRoleWorkspace(role) {
  const isManagement = role === "management";
  const isTrainer = role === "cleaner-trainer";
  const title = isManagement
    ? "Management Workspace"
    : isTrainer
      ? "Cleaner Trainer Workspace"
      : "Cleaner Training";
  const description = isManagement
    ? "Review workforce training pathways, learner progress and competency status from one place."
    : isTrainer
      ? "Cleaner learner progress, assessments and practical competency sign-offs will be managed here."
      : "Your role-specific healthcare cleaning modules will appear here without mixing them with PCA training.";

  if (isManagement) {
    renderManagementDashboard();
    return;
  }

  renderShell(`
    <section class="department-heading">
      <span class="eyebrow">OPERATING THEATRE &amp; RECOVERY</span>
      <h2>${title}</h2>
      <p>${description}</p>
    </section>
    <section class="card pathway-ready-card">
      <span class="badge badge-in-progress">Pathway ready</span>
      <h3>${workplaceRoleLabel(role)} access is now separated</h3>
      <p class="small">Approved role-specific modules can be added here next. Your existing PCA training remains unchanged.</p>
    </section>
  `);
}

function renderManagementDashboard() {
  if (state.currentUser?.role !== "management") return routeSignedInUser();
  const department = DEPARTMENTS.find(item => item.id === state.selectedDepartment);
  if (!department) return renderDepartmentSelection();
  const report = MANAGEMENT_REPORTS[state.selectedDepartment];
  const trainers = assignmentDirectory();
  const records = workflowRecords().filter(item => item.department === state.selectedDepartment);
  const assignments = trainers.map(trainer => {
    const assigned = trainer.departments.includes(state.selectedDepartment);
    return `<label class="assignment-row"><span><strong>${escapeHtml(trainer.name)}</strong><small>${workplaceRoleLabel(trainer.role)}</small></span><input class="trainer-assignment" type="checkbox" data-id="${trainer.id}" ${assigned ? "checked" : ""} /></label>`;
  }).join("");
  const recommendations = records.filter(item => item.status === "Sent to Management").map(item => `<article class="review-card" data-id="${item.id}"><div><strong>${escapeHtml(item.name)}</strong><span>${item.role} · ${escapeHtml(item.feedback || "Trainer recommendation")}</span></div><label>Management feedback<textarea class="management-feedback" placeholder="Required when requesting reassessment"></textarea></label><div><button class="btn approve-signoff">Approve</button><button class="btn btn-danger reassess-signoff">Request reassessment</button></div></article>`).join("");
  const staffRows = records.map(person => `<tr><td><strong>${escapeHtml(person.name)}</strong><small>${person.id}</small></td><td>${person.role}</td><td>${person.progress}%</td><td><span class="status-chip status-${statusTone(person.status)}">${person.status}</span></td></tr>`).join("");

  renderShell(`
    <section class="management-title" id="home"><div><span class="eyebrow">MANAGEMENT OVERVIEW</span><h2>${escapeHtml(department.name)}</h2><span class="readonly-label">Department scope</span></div><button class="btn btn-secondary" id="changeDepartmentBtn">Switch Department</button></section>
    <div class="stats-grid management-stats"><div class="stat-card"><span>Total PCA staff</span><strong>${report.pca}</strong></div><div class="stat-card"><span>Total Cleaner staff</span><strong>${report.cleaners}</strong></div><div class="stat-card stat-complete"><span>Completed training</span><strong>${report.completed}</strong></div><div class="stat-card stat-overdue"><span>Overdue training</span><strong>${report.overdue}</strong></div></div>
    <section class="card dashboard-card management-section" id="training"><div class="section-heading"><div><span class="eyebrow">TRAINER ACCESS</span><h3>Department assignments</h3></div><span class="small">Trainer roles only</span></div><p class="readonly-note">Assign PCA Trainers and Cleaner Trainers to this department. Individual learners cannot be assigned here.</p><div class="assignment-list">${assignments}</div></section>
    <section class="card dashboard-card management-section" id="reports"><div class="section-heading"><div><span class="eyebrow">FINAL APPROVAL</span><h3>Sign-off recommendations</h3></div><span class="count-badge">${records.filter(item => item.status === "Sent to Management").length}</span></div><div class="review-list">${recommendations || '<p class="empty-state">No recommendations awaiting Management.</p>'}</div></section>
    <section class="card dashboard-card management-section" id="staff"><div class="section-heading"><div><span class="eyebrow">STAFF</span><h3>Individual staff records</h3></div><span class="small">${escapeHtml(department.name)} only</span></div><div class="table-wrap"><table><thead><tr><th>Staff member</th><th>Role</th><th>Progress</th><th>Sign-off status</th></tr></thead><tbody>${staffRows}</tbody></table></div></section>
    <section class="card coming-soon"><h3>Training content coming soon</h3><p>Management can monitor training and approve competency, but cannot edit clinical training content.</p></section>
  `);

  document.querySelectorAll(".trainer-assignment").forEach(input => input.addEventListener("change", () => {
    const trainer = assignmentDirectory().find(item => item.id === input.dataset.id);
    trainer.departments = input.checked ? [...new Set([...trainer.departments, state.selectedDepartment])] : trainer.departments.filter(id => id !== state.selectedDepartment);
    saveState();
  }));
  document.querySelectorAll(".approve-signoff, .reassess-signoff").forEach(button => button.addEventListener("click", () => {
    const card = button.closest(".review-card");
    const record = workflowRecords().find(item => item.id === card.dataset.id);
    const reassess = button.classList.contains("reassess-signoff");
    const feedback = card.querySelector(".management-feedback").value.trim();
    if (reassess && !feedback) return alert("Enter feedback for the trainer before requesting reassessment.");
    const previous = record.status;
    record.status = reassess ? "Reassessment Required" : "Approved";
    record.reviewStatus = reassess ? "Reassessment" : "Complete";
    record.feedback = feedback || "Management approved final competency.";
    record.history.unshift({ actor: state.currentUser.name, role: "Management", action: reassess ? "Requested reassessment" : "Approved competency", at: new Date().toLocaleString("en-AU"), detail: record.feedback, previousStatus: previous, newStatus: record.status });
    saveState();
    renderManagementDashboard();
  }));
}

function renderDepartmentSelection() {
  const managementSelection = state.currentUser?.role === "management";
  const departmentCards = DEPARTMENTS.map(department => `
    <article class="department-card ${department.active || managementSelection ? "department-active" : "department-planned"}">
      <div class="department-card-top">
        <span class="department-icon" aria-hidden="true">${departmentIcon(department.id)}</span>
        <span class="department-status ${department.active || managementSelection ? "status-active" : "status-planned"}">
          ${department.active || managementSelection ? "Available" : "Coming soon"}
        </span>
      </div>
      <div>
        <h3>${department.name}</h3>
        <p>${department.summary}</p>
      </div>
      <div class="department-card-footer">
        <span>${department.detail}</span>
        ${department.active || managementSelection
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
      routeCurrentUser();
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

    <section class="patient-journey" aria-labelledby="patientJourneyTitle">
      <div class="journey-heading">
        <div>
          <span class="eyebrow">PATIENT JOURNEY</span>
          <h3 id="patientJourneyTitle">From ward pickup to safe return</h3>
        </div>
        <span class="journey-caption">Operating Theatre & Recovery pathway</span>
      </div>
      <ol class="journey-track">
        <li>
          <span class="journey-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M3 18V8m0 7h18v3M6 15v-4h5a3 3 0 0 1 3 3v1"/><circle cx="8" cy="8" r="2"/></svg>
          </span>
          <span class="journey-copy"><small>01</small><strong>Ward pickup</strong><span>Collect assigned patient</span></span>
        </li>
        <li>
          <span class="journey-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M8 4h8v3H8zM6 6h12v15H6z"/><path d="M9 12h6m-3-3v6"/></svg>
          </span>
          <span class="journey-copy"><small>02</small><strong>PRA</strong><span>Patient Reception Area</span></span>
        </li>
        <li>
          <span class="journey-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 17h16M6 17v3m12-3v3M7 14h10l2 3H5l2-3Z"/><path d="M12 3v3m-4-1 2 2m6-2-2 2M8 12a4 4 0 0 1 8 0"/></svg>
          </span>
          <span class="journey-copy"><small>03</small><strong>Theatre</strong><span>Prep-area support</span></span>
        </li>
        <li>
          <span class="journey-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/><path d="m8 12 2-1 2 3 2-5 2 3"/></svg>
          </span>
          <span class="journey-copy"><small>04</small><strong>Recovery</strong><span>Post-procedure care</span></span>
        </li>
        <li>
          <span class="journey-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 18V9l8-6 8 6v9H4Z"/><path d="M8 18v-5h8v5M3 21h18"/></svg>
          </span>
          <span class="journey-copy"><small>05</small><strong>Return to ward</strong><span>Assist safe transport</span></span>
        </li>
      </ol>
    </section>

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
  const role = state.currentUser?.role;
  if (!role?.includes("trainer")) return routeSignedInUser();
  const assigned = assignedDepartmentsForCurrentTrainer();
  if (!assigned.includes(state.selectedDepartment)) {
    state.selectedDepartment = assigned[0] || null;
    saveState();
  }
  const roleLabel = role === "pca-trainer" ? "PCA" : "Cleaner";
  const records = workflowRecords().filter(item => item.role === roleLabel && assigned.includes(item.department));
  const activeRecords = records.filter(item => item.department === state.selectedDepartment);
  const options = assigned.map(id => `<option value="${id}" ${id === state.selectedDepartment ? "selected" : ""}>${escapeHtml(departmentName(id))}</option>`).join("");
  const rows = activeRecords.map(item => `<tr class="trainee-row" data-search="${escapeHtml((item.name + ' ' + item.id).toLowerCase())}" data-progress="${item.progress === 100 ? 'complete' : 'in-progress'}" data-overdue="${item.overdue}" data-review="${escapeHtml(item.reviewStatus.toLowerCase().replaceAll(' ', '-'))}" data-signoff="${escapeHtml(item.status.toLowerCase().replaceAll(' ', '-'))}"><td><button class="link-button open-profile" data-id="${item.id}">${escapeHtml(item.name)}</button><small>${item.id}</small></td><td>${item.progress}%</td><td>${item.knowledge.at(-1)?.score || 0}%</td><td><span class="status-chip status-${statusTone(item.status)}">${item.status}</span></td><td>${item.overdue ? '<span class="status-chip status-danger">Overdue</span>' : 'On track'}</td></tr>`).join("");
  renderShell(`
    <section class="dashboard-hero trainer-hero" id="home"><div class="dashboard-welcome"><span class="eyebrow">${roleLabel.toUpperCase()} TRAINER WORKSPACE</span><h2>${roleLabel} Trainer Dashboard</h2><p>Monitor progress, record observations and recommend sign-off.</p></div><div class="trainer-identity"><span>Assigned departments</span><strong>${assigned.length}</strong></div></section>
    ${assigned.length ? `<section class="department-switcher"><label>Department<select id="trainerDepartment">${options}</select></label><span>${assigned.map(departmentName).map(escapeHtml).join(" · ")}</span></section>` : '<section class="card alert-danger"><h3>No department assigned</h3><p>Ask Management to assign a department.</p></section>'}
    <div class="stats-grid trainer-stats"><div class="stat-card"><span>${roleLabel} trainees</span><strong>${activeRecords.length}</strong></div><div class="stat-card"><span>Pending reviews</span><strong>${activeRecords.filter(i => i.status === 'Ready for Trainer Review' || i.status === 'Reassessment Required').length}</strong></div><div class="stat-card stat-overdue"><span>Overdue training</span><strong>${activeRecords.filter(i => i.overdue).length}</strong></div><div class="stat-card"><span>Recommendations sent</span><strong>${activeRecords.filter(i => i.status === 'Sent to Management').length}</strong></div></div>
    <section class="card dashboard-card" id="staff"><div class="section-heading"><div><span class="eyebrow">TRAINEES</span><h3>Training and competency</h3></div></div><div class="trainer-filters"><input id="traineeSearch" type="search" placeholder="Search trainees"><select id="progressFilter"><option value="all">All progress</option><option value="complete">Complete</option><option value="in-progress">In progress</option></select><select id="overdueFilter"><option value="all">All due dates</option><option value="true">Overdue</option><option value="false">On track</option></select><select id="reviewFilter"><option value="all">All reviews</option><option value="pending-review">Pending review</option><option value="reassessment">Reassessment</option></select><select id="signoffFilter"><option value="all">All sign-offs</option><option value="sent-to-management">Sent to Management</option><option value="approved">Approved</option></select></div><div class="table-wrap"><table><thead><tr><th>Trainee</th><th>Progress</th><th>Latest result</th><th>Sign-off</th><th>Due</th></tr></thead><tbody>${rows}</tbody></table></div><p id="noTrainees" class="empty-state" ${activeRecords.length ? 'hidden' : ''}>No ${roleLabel} trainees in this assigned department.</p></section>
    <section class="card coming-soon" id="training"><h3>Training content coming soon</h3><p>Trainer access is assessment-only. Content editing and Management settings are unavailable.</p></section><div id="profilePanel"></div>
  `);
  document.getElementById("trainerDepartment")?.addEventListener("change", event => { if (assigned.includes(event.target.value)) { state.selectedDepartment = event.target.value; saveState(); renderTrainerDashboard(); } });
  const applyFilters = () => { let visible = 0; document.querySelectorAll(".trainee-row").forEach(row => { const match = row.dataset.search.includes(document.getElementById("traineeSearch").value.toLowerCase()) && ["progress", "overdue", "review", "signoff"].every(key => { const value = document.getElementById(`${key}Filter`).value; return value === "all" || row.dataset[key] === value; }); row.hidden = !match; if (match) visible++; }); document.getElementById("noTrainees").hidden = visible > 0; };
  document.querySelectorAll(".trainer-filters input, .trainer-filters select").forEach(control => control.addEventListener(control.tagName === "INPUT" ? "input" : "change", applyFilters));
  document.querySelectorAll(".open-profile").forEach(button => button.addEventListener("click", () => renderTraineeProfile(button.dataset.id)));
}

function renderTraineeProfile(id) {
  const record = workflowRecords().find(item => item.id === id);
  const allowed = record && record.role === (state.currentUser.role === "pca-trainer" ? "PCA" : "Cleaner") && assignedDepartmentsForCurrentTrainer().includes(record.department);
  if (!allowed) return alert("You do not have access to this trainee or department.");
  const history = record.history.map(item => `<li><div><strong>${escapeHtml(item.action)}</strong><span>${escapeHtml(item.actor)} · ${escapeHtml(item.role)} · ${escapeHtml(item.at)}</span></div><p>${escapeHtml(item.detail || '—')}</p><small>${escapeHtml(item.previousStatus)} → ${escapeHtml(item.newStatus)}</small></li>`).join("");
  document.getElementById("profilePanel").innerHTML = `<section class="card trainee-profile" id="reports"><div class="section-heading"><div><span class="eyebrow">TRAINEE PROFILE</span><h3>${escapeHtml(record.name)}</h3><p>${record.role} · ${escapeHtml(departmentName(record.department))}</p></div><span class="status-chip status-${statusTone(record.status)}">${record.status}</span></div><div class="profile-grid"><div><h4>Modules</h4><strong>${record.modules.completed.length} completed · ${record.modules.remaining.length} remaining</strong><p>${escapeHtml(record.modules.remaining.join(", ") || "All required modules completed")}</p></div><div><h4>Knowledge checks</h4>${record.knowledge.map(k => `<p>${escapeHtml(k.module)} <strong>${k.score}%</strong></p>`).join("")}</div><div><h4>Practical observations</h4>${record.observations.map(o => `<p><strong>${escapeHtml(o.result)}</strong> · ${escapeHtml(o.date)}<br>${escapeHtml(o.note)}</p>`).join("") || '<p>No observation recorded.</p>'}</div><div><h4>Trainer / Management feedback</h4><p class="${record.status === 'Reassessment Required' ? 'alert-text' : ''}">${escapeHtml(record.feedback || "No feedback yet.")}</p></div></div><label>Assessment observation<textarea id="assessmentNote" placeholder="Record observable competency evidence"></textarea></label><div class="profile-actions"><button class="btn" id="recordObservation">Record observation</button><button class="btn" id="recommendSignoff" ${record.progress < 100 || !['Ready for Trainer Review','Reassessment Required'].includes(record.status) ? 'disabled' : ''}>Submit recommendation</button></div><h4>Activity history</h4><ol class="activity-history">${history}</ol></section>`;
  document.getElementById("profilePanel").scrollIntoView({ behavior: "smooth" });
  document.getElementById("recordObservation").addEventListener("click", () => { const note = document.getElementById("assessmentNote").value.trim(); if (!note) return alert("Enter an observation first."); record.observations.unshift({ date: new Date().toLocaleString("en-AU"), result: "Observed", note }); record.feedback = note; record.history.unshift({ actor: state.currentUser.name, role: workplaceRoleLabel(state.currentUser.role), action: "Recorded competency observation", at: new Date().toLocaleString("en-AU"), detail: note, previousStatus: record.status, newStatus: record.status }); saveState(); renderTraineeProfile(id); });
  document.getElementById("recommendSignoff").addEventListener("click", () => { const previous = record.status; const detail = document.getElementById("assessmentNote").value.trim() || record.feedback || "Competency recommended"; record.status = "Sent to Management"; record.reviewStatus = "Management review"; record.feedback = detail; record.history.unshift({ actor: state.currentUser.name, role: workplaceRoleLabel(state.currentUser.role), action: "Submitted sign-off recommendation", at: new Date().toLocaleString("en-AU"), detail, previousStatus: previous, newStatus: record.status }); saveState(); renderTrainerDashboard(); });
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
} else {
  routeSignedInUser();
}
