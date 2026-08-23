const app = document.getElementById("app");

const defaultState = {
  currentUser: null,
  selectedDepartment: null,
  activeOrganizationId: null,
  activeWorkspaceView: "home",
  organizationSetupStep: "identity",
  learnerName: "Staff Learner",
  moduleProgress: {},
  practicalSignoff: false,
  trainerComments: "",
  trainerAssignments: null,
  traineeRecords: null,
  managementData: null
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

const DEPARTMENT_SELECTION_ROLES = new Set(["pca", "cleaner"]);

const NAV_ITEMS = [
  ["home", "Home", "⌂"],
  ["training", "Training", "▷"],
  ["staff", "Staff", "♙"],
  ["reports", "Reports", "▥"]
];

const AUTHENTICATED_NAV_ITEMS = {
  "Organisation Administrator": [["home", "Home", "⌂"], ["pathways", "Pathways", "▷"], ["people", "People", "♙"], ["competency", "Competency", "✓"], ["reports", "Reports", "▥"], ["admin", "Admin", "⚙"]],
  "Content Administrator/Educator": [["home", "Home", "⌂"], ["pathways", "Pathways", "▷"], ["people", "People", "♙"], ["reports", "Reports", "▥"]],
  worker: [["home", "Home", "⌂"], ["pathways", "Pathways", "▷"], ["competency", "Competency", "✓"]],
  trainer: [["home", "Home", "⌂"], ["people", "Trainees", "♙"], ["competency", "Assess", "✓"], ["reports", "Reports", "▥"]],
  management: [["home", "Home", "⌂"], ["pathways", "Pathways", "▷"], ["people", "People", "♙"], ["competency", "Competency", "✓"], ["reports", "Reports", "▥"]]
};

function authenticatedNavigation(role) {
  if (AUTHENTICATED_NAV_ITEMS[role]) return AUTHENTICATED_NAV_ITEMS[role];
  if (["PCA", "Cleaner", "Support Worker"].includes(role)) return AUTHENTICATED_NAV_ITEMS.worker;
  if (role?.includes("Trainer")) return AUTHENTICATED_NAV_ITEMS.trainer;
  return AUTHENTICATED_NAV_ITEMS.management;
}

function workplaceRoleLabel(role) {
  return WORKPLACE_ROLES[role] || role || "Staff member";
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

function managementStore() {
  if (!state.managementData) state.managementData = JSON.parse(JSON.stringify(SKILLWARD_MANAGEMENT_SAMPLE));
  return SkillWardManagement.createStore(state.managementData);
}

function currentManager(store = managementStore()) {
  return store.data.managers.find(item => item.name.toLowerCase() === state.currentUser.name.toLowerCase()) || store.data.managers.find(item => item.level === "Hospital Administrator" && item.accountStatus === "Active");
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
  return DEPARTMENTS.find(item => item.id === id)?.name || authenticatedContext?.departmentDetails?.find(item => item.id === id)?.name || id;
}

function statusTone(status) {
  if (status === "Approved") return "success";
  if (status === "Reassessment Required") return "danger";
  return status === "Not Started" ? "neutral" : "warning";
}

function workspaceHeader(user, department) {
  if (!user) return "Healthcare Workforce Training";
  if (user.role === "platform-admin") return "Platform Administration";
  if (user.role === "management") {
    return "Healthcare Workforce Training";
  }
  const labels = {
    pca: "PCA Training Hub",
    cleaner: "Cleaner Training Hub",
    "pca-trainer": "PCA Trainer Workspace",
    "cleaner-trainer": "Cleaner Trainer Workspace"
  };
  return `${department?.name || "Assigned department"} · ${labels[user.role] || "Healthcare Workforce Training"}`;
}

function routeSignedInUser() {
  normalizeCurrentUserRole();

  const known = state.currentUser?.role === "management"
    ? managementStore().data.managers.find(item => item.name.toLowerCase() === state.currentUser.name.toLowerCase())
    : managementStore().data.staff.find(item => item.name.toLowerCase() === state.currentUser?.name?.toLowerCase());
  if (known && ["Suspended", "Archived"].includes(known.accountStatus)) {
    renderShell(`<section class="card access-blocked"><h2>Access unavailable</h2><p>${known.accountStatus === "Suspended" ? "Your access is suspended. Contact Management for assistance." : "This account is archived and cannot sign in."}</p></section>`);
    return;
  }

  if (state.currentUser?.role?.includes("trainer")) {
    const assigned = assignedDepartmentsForCurrentTrainer();
    if (!assigned.includes(state.selectedDepartment)) state.selectedDepartment = assigned[0] || null;
    saveState();
  }

  if (state.currentUser?.role === "management" && !state.selectedDepartment) {
    const actor = currentManager();
    state.selectedDepartment = actor?.departments?.[0] || null;
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
  const user = authenticatedContext?.appUser || state.currentUser;
  const department = DEPARTMENTS.find(item => item.id === state.selectedDepartment) || authenticatedContext?.departmentDetails?.find(item => item.id === state.selectedDepartment);
  const authenticatedWorkspace = Boolean(authenticatedContext || (user && (department || user.role?.includes("trainer"))));
  const navigationItems = authenticatedContext ? authenticatedNavigation(authenticatedContext.membership?.role) : NAV_ITEMS;
  const activeView = authenticatedContext ? (state.activeWorkspaceView || "home") : "home";
  if (!navigationItems.some(([id]) => id === activeView)) state.activeWorkspaceView = navigationItems[0][0];
  const navigation = navigationItems.map(([id, label, icon]) => `
    <button class="workspace-nav-item ${id === (state.activeWorkspaceView || "home") ? "is-active" : ""}" data-nav="${id}" aria-label="${label}">
      <span aria-hidden="true">${icon}</span><small>${label}</small>
    </button>
  `).join("");
  app.innerHTML = `
    <div class="shell ${authenticatedWorkspace ? "authenticated-shell" : ""} ${authenticatedContext ? "database-workspace" : ""}">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">
            <svg viewBox="0 0 48 54" focusable="false">
              <title>SkillWard</title>
              <path class="logo-shield" d="M24 2 44 9v16c0 13-8 22-20 28C12 47 4 38 4 25V9L24 2Z" />
              <path class="logo-symbol" d="m14.5 27.5 6.2 6.2 13-14" />
            </svg>
          </div>
          <div class="brand-copy">
            <h1>SkillWard</h1>
            <p>${escapeHtml(workspaceHeader(user, department))}</p>
          </div>
        </div>
        <div class="top-actions">
          ${authenticatedWorkspace ? `<button class="notification-button" aria-label="Notifications"><span aria-hidden="true">●</span></button>` : ""}
          ${user ? `<span class="role-pill">${workplaceRoleLabel(user.role)}</span>` : ""}
          ${authenticatedContext?.organization ? `<span class="workspace-organization">${escapeHtml(authenticatedContext.organization.name)}</span>` : ""}
          ${authenticatedContext ? `<button class="btn btn-secondary" id="signOutBtn">Sign Out</button>` : ""}${authenticatedWorkspace ? `<button class="profile-button" id="switchRoleBtn" aria-label="User profile: ${escapeHtml(user.name)}"><span>${escapeHtml(user.name).charAt(0).toUpperCase()}</span><strong>${escapeHtml(user.name)}</strong></button>` : user ? `<button class="btn btn-secondary" id="switchRoleBtn">Switch role</button>` : ""}
        </div>
      </header>
      ${authenticatedWorkspace ? `<nav class="side-nav" style="--nav-count:${navigationItems.length}" aria-label="Primary navigation">${navigation}</nav>` : ""}
      <main class="page" id="mainContent">${content}</main>
      ${authenticatedWorkspace ? `<nav class="bottom-nav" style="--nav-count:${navigationItems.length}" aria-label="Primary navigation">${navigation}</nav>` : ""}
      <footer class="site-footer">
        <div class="footer-inner">
          <p class="footer-copyright">© 2026 SkillWard. All rights reserved.</p>
          <nav class="footer-links" aria-label="Legal and support">
            <a href="legal.html#privacy">Privacy Policy</a>
            <span aria-hidden="true">·</span>
            <a href="legal.html#terms">Terms of Use</a>
            <span aria-hidden="true">·</span>
            <a href="legal.html#accessibility">Accessibility</a>
            <span aria-hidden="true">·</span>
            <a href="legal.html#support">Contact &amp; Support</a>
          </nav>
          <p class="footer-disclaimer">SkillWard is a workforce training and competency platform. Training content does not replace workplace policies, clinical guidelines, or professional judgement.</p>
        </div>
      </footer>
    </div>
  `;

  document.getElementById("signOutBtn")?.addEventListener("click", async () => { await authService?.signOut(); authenticatedContext=null; state.currentUser = null; state.selectedDepartment = null; state.activeOrganizationId = null; saveState(); renderLogin(); });

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
      if (authenticatedContext) {
        state.activeWorkspaceView = button.dataset.nav;
        saveState();
        renderAuthenticatedWorkspace();
        return;
      }
      document.getElementById(button.dataset.nav)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

}

let authService = null;
let authenticatedContext = null;

function authMessage(code) {
  const messages = {
    ACCOUNT_SUSPENDED: "Your access is currently suspended. Contact Management.",
    ACCOUNT_ARCHIVED: "This account is no longer active. Contact Management.",
    ACCOUNT_INVITED: "Your account setup is not complete. Contact Management.",
    MISSING_PROFILE: "Your account is not configured for SkillWard. Contact Management.",
    MISSING_MEMBERSHIP: "Your account is not configured for SkillWard. Contact Management.",
    CONFIGURATION_MISSING: "Secure sign-in is not configured for this deployment.",
    CONTEXT_READ_FAILED: "We could not load your workplace access. Check your connection or contact Management.",
    CONTEXT_TABLE_PERMISSION: "We could not load your workplace access. Check your connection or contact Management.",
    RECOVERY_INVALID: "This recovery link is invalid or has expired. Request a new link."
  };
  return messages[code] || "We could not sign you in. Check your details and try again.";
}

function renderLogin(message = "") {
  const sectorIcon = (sector) => {
    const icons = {
      hospital: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 42V15a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v27M7 42h34M20 11V6h8v5M24 18v10m-5-5h10M17 42V32h14v10"/></svg>`,
      "aged-care": `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 22 24 8l16 14v20H8V22Z"/><path d="M18 42V29h12v13M17 20c2.4-3.1 5.3-3.4 7-.7 1.7-2.7 4.6-2.4 7 .7-1.2 4-4.2 6.7-7 8.5-2.8-1.8-5.8-4.5-7-8.5Z"/></svg>`,
      disability: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="9" r="4"/><path d="M15 17h18M24 14v13m0 0-8 14m8-14 9 14M12 27l12-6 12 6"/></svg>`
    };
    return icons[sector];
  };

  renderShell(`
    <div class="entry-experience">
      <section class="entry-view welcome-view" id="welcomeView">
        <div class="welcome-atmosphere" aria-hidden="true"><span class="welcome-orb welcome-orb-one"></span><span class="welcome-orb welcome-orb-two"></span><span class="welcome-grid"></span></div>
        <div class="welcome-content">
          <div class="welcome-emblem"><svg viewBox="0 0 48 54" focusable="false"><title>SkillWard</title><path class="logo-shield" d="M24 2 44 9v16c0 13-8 22-20 28C12 47 4 38 4 25V9L24 2Z" /><path class="logo-symbol" d="m14.5 27.5 6.2 6.2 13-14" /></svg></div>
          <p class="welcome-kicker"><span></span> Workforce learning, built around care</p>
          <h2>Welcome to <span>SkillWard</span></h2>
          <p class="welcome-lead">One trusted platform for training, competency and confident practice across care organisations.</p>
          <div class="welcome-actions">
            <button class="btn welcome-primary" id="getStartedBtn">Get Started <span aria-hidden="true">→</span></button>
            <a class="welcome-secondary" href="legal.html#support">For organisations <span aria-hidden="true">↗</span></a>
          </div>
          <div class="welcome-trust" aria-label="Platform capabilities"><span>Structured learning</span><i></i><span>Competency evidence</span><i></i><span>Compliance visibility</span></div>
        </div>
        <aside class="welcome-visual" aria-hidden="true">
          <div class="visual-card visual-card-main"><small>WORKFORCE READINESS</small><strong>Learning that becomes confident practice.</strong><div class="visual-progress"><span></span></div><div class="visual-metrics"><div><b>01</b><small>Learn</small></div><div><b>02</b><small>Validate</small></div><div><b>03</b><small>Sign off</small></div></div></div>
          <div class="visual-card visual-card-float"><span>✓</span><div><strong>Competency ready</strong><small>Visible. Structured. Accountable.</small></div></div>
        </aside>
      </section>

      <section class="entry-view sector-view" id="sectorView" hidden>
        <button class="entry-back" id="backToWelcome" type="button"><span aria-hidden="true">←</span> Back</button>
        <header class="sector-heading">
          <p class="welcome-kicker"><span></span> SkillWard environments</p>
          <h2>Choose your sector</h2>
          <p>Select the care environment you want to enter. Your organisation and permissions are securely connected after sign-in.</p>
        </header>
        <div class="sector-grid">
          <button class="sector-card sector-card-active" id="selectHospital" type="button">
            <span class="sector-status sector-status-live"><i></i> Available</span>
            <span class="sector-icon">${sectorIcon("hospital")}</span>
            <span class="sector-copy"><strong>Hospital</strong><small>Clinical support workforce training, competency and department readiness.</small></span>
            <span class="sector-arrow" aria-hidden="true">→</span>
          </button>
          <button class="sector-card" type="button" disabled aria-describedby="agedCareStatus">
            <span class="sector-status">Coming soon</span>
            <span class="sector-icon">${sectorIcon("aged-care")}</span>
            <span class="sector-copy"><strong>Aged Care</strong><small>Care workforce onboarding, capability and compliance.</small></span>
            <span class="sr-only" id="agedCareStatus">This SkillWard environment is coming soon.</span>
          </button>
          <button class="sector-card" type="button" disabled aria-describedby="disabilityStatus">
            <span class="sector-status">Coming soon</span>
            <span class="sector-icon">${sectorIcon("disability")}</span>
            <span class="sector-copy"><strong>Disability Support</strong><small>Support-worker learning, practical capability and continuing development.</small></span>
            <span class="sr-only" id="disabilityStatus">This SkillWard environment is coming soon.</span>
          </button>
        </div>
        <p class="sector-footnote">More care environments will become available as their approved learning pathways are developed.</p>
      </section>

      <section class="entry-view hospital-entry-view" id="hospitalView" hidden>
        <button class="entry-back hospital-back" id="backToSectors" type="button"><span aria-hidden="true">←</span> All sectors</button>
        <div class="login-layout hospital-login-layout">
          <section class="login-intro">
            <div class="hero-motion" aria-hidden="true"><span class="motion-orb motion-orb-one"></span><span class="motion-orb motion-orb-two"></span><span class="motion-grid"></span></div>
            <div class="login-label hero-reveal hero-reveal-1"><span></span> Hospital workforce enablement</div>
            <h2 class="hero-title" aria-label="Build your confidence before your first shift"><span class="hero-line hero-reveal hero-reveal-2">Build Your Confidence</span><span class="hero-line hero-accent hero-reveal hero-reveal-3">Before Your First Shift<span class="typing-cursor" aria-hidden="true"></span></span></h2>
            <p class="hero-reveal hero-reveal-4">Structured, role-based learning that turns approved hospital procedures into confident workplace practice.</p>
            <div class="learning-flow" aria-label="SkillWard learning process"><div><span>01</span><strong>Learn</strong><small>Role-based pathways</small></div><i aria-hidden="true"></i><div><span>02</span><strong>Validate</strong><small>Knowledge checks</small></div><i aria-hidden="true"></i><div><span>03</span><strong>Sign off</strong><small>Observed competency</small></div></div>
            <p class="login-platform-note hero-reveal hero-reveal-5">Designed for hospital teams, trainers and frontline staff.</p>
          </section>
          <section class="card login-card hospital-access-card" id="workspaceCard" data-entry-transition="login-flip">
            <div class="hospital-card-heading"><span class="sector-mini-icon">${sectorIcon("hospital")}</span><div><div class="access-label"><span></span> HOSPITAL ENVIRONMENT</div><h2>Enter your workspace</h2></div></div>
            <p class="login-card-intro">Sign in securely or explore SkillWard with sample data.</p>
            ${message ? `<p class="auth-status" role="status">${escapeHtml(message)}</p>` : ""}
            <div class="entry-options" id="entryOptions"><button class="entry-option" id="showSignIn"><span class="option-icon" aria-hidden="true">→</span><strong>Sign in to SkillWard</strong><small>Use your Management-issued account.</small></button><button class="entry-option" id="showDemo"><span class="option-icon" aria-hidden="true">◇</span><strong>Explore Demo Mode</strong><small>Preview workflows using sample browser data.</small></button></div>
            <form id="signInForm" class="access-form" hidden novalidate><h3>Sign in to SkillWard</h3><label><span>Email</span><input id="emailInput" type="email" autocomplete="username" inputmode="email" required /></label><label><span>Password</span><input id="passwordInput" type="password" autocomplete="current-password" required /></label><p id="authError" class="auth-status" role="alert"></p><button class="btn btn-wide login-submit" type="submit">Sign in <span aria-hidden="true">→</span></button><button class="link-button" type="button" id="forgotPassword">Forgot password?</button><button class="link-button backChoices" type="button">Back to access options</button></form>
            <form id="demoForm" class="access-form" hidden><h3>Explore Hospital Demo</h3><p class="small">Nothing in Demo Mode is written to Supabase. Sample information stays only in this browser.</p><label><span>Full name</span><input id="nameInput" type="text" autocomplete="name" placeholder="e.g. Alex Smith" required /></label><label><span>Workspace role</span><select id="roleInput"><option value="pca">PCA</option><option value="cleaner">Cleaner</option><option value="pca-trainer">PCA Trainer</option><option value="cleaner-trainer">Cleaner Trainer</option><option value="management">Management</option></select></label><button class="btn btn-wide login-submit" type="submit">Continue in Demo Mode <span aria-hidden="true">→</span></button><button class="link-button backChoices" type="button">Back to access options</button></form>
            <form id="resetForm" class="access-form" hidden><h3>Reset password</h3><p class="small">Enter your email. For privacy, the confirmation is always the same.</p><label><span>Email</span><input id="resetEmail" type="email" autocomplete="username" required /></label><button class="btn btn-wide" type="submit">Send recovery link</button><button class="link-button backChoices" type="button">Back</button></form>
          </section>
        </div>
      </section>
    </div>`);

  const views = {
    welcome: document.getElementById("welcomeView"),
    sectors: document.getElementById("sectorView"),
    hospital: document.getElementById("hospitalView")
  };
  const showView = (name) => {
    Object.entries(views).forEach(([key, view]) => { view.hidden = key !== name; });
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.querySelector(`#${name === "welcome" ? "getStartedBtn" : name === "sectors" ? "selectHospital" : "showSignIn"}`)?.focus({ preventScroll: true });
  };

  document.getElementById("getStartedBtn").addEventListener("click", () => showView("sectors"));
  document.getElementById("backToWelcome").addEventListener("click", () => showView("welcome"));
  document.getElementById("selectHospital").addEventListener("click", () => showView("hospital"));
  document.getElementById("backToSectors").addEventListener("click", () => showView("sectors"));

  const choices = document.getElementById("entryOptions");
  const forms = ["signInForm", "demoForm", "resetForm"].map(id => document.getElementById(id));
  const show = id => { choices.hidden = true; forms.forEach(form => { form.hidden = form.id !== id; }); };
  document.getElementById("showSignIn").addEventListener("click", () => show("signInForm"));
  document.getElementById("showDemo").addEventListener("click", () => show("demoForm"));
  document.getElementById("forgotPassword").addEventListener("click", () => show("resetForm"));
  document.querySelectorAll(".backChoices").forEach(button => button.addEventListener("click", () => { forms.forEach(form => { form.hidden = true; }); choices.hidden = false; }));
  document.getElementById("demoForm").addEventListener("submit", async event => { event.preventDefault(); const name = document.getElementById("nameInput").value.trim(); if (!name) return; await authService?.signOut(); authenticatedContext = null; state.currentUser = { name, role: document.getElementById("roleInput").value, mode: "demo", sector: "hospital" }; state.selectedDepartment = null; if (state.currentUser.role === "pca") state.learnerName = name; saveState(); routeSignedInUser(); });
  document.getElementById("signInForm").addEventListener("submit", async event => { event.preventDefault(); const form = event.currentTarget, button = form.querySelector("button[type=submit]"), error = document.getElementById("authError"); button.disabled = true; error.textContent = "Signing in securely…"; try { state.currentUser = null; state.selectedDepartment = null; saveState(); authenticatedContext = await authService.signIn(document.getElementById("emailInput").value, document.getElementById("passwordInput").value); state.activeOrganizationId = authenticatedContext.organization?.id || null; saveState(); renderAuthenticatedWorkspace(); } catch (e) { error.textContent = authMessage(e.message); if (["MISSING_PROFILE", "MISSING_MEMBERSHIP"].includes(e.message)) await authService?.signOut(); } finally { button.disabled = false; } });
  document.getElementById("resetForm").addEventListener("submit", async event => { event.preventDefault(); const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true; const recoveryUrl = new URL(location.href); recoveryUrl.search = ""; recoveryUrl.hash = ""; recoveryUrl.searchParams.set("recovery", "1"); try { await authService.resetPassword(document.getElementById("resetEmail").value, recoveryUrl.toString()); } catch {} renderLogin("If an eligible account exists, a password recovery link has been sent."); });
  if (message) showView("hospital");
}

function renderLegacyAuthenticatedWorkspace() {
  const c=authenticatedContext; if(!c)return renderLogin();
  const departments=c.departmentDetails, role=c.membership.role;
  if(role!=="Hospital Administrator" && !departments.length) return renderShell('<section class="card access-blocked"><h2>No assigned department</h2><p>Contact Management to have a department assigned.</p></section>');
  if(departments.length && !departments.some(item=>item.id===state.selectedDepartment)) state.selectedDepartment=departments[0].id;
  const choose=departments.length>1;
  const title=role==="Hospital Administrator"?"Management Dashboard":role==="Department Manager"?"Department Management Workspace":`${role} ${role.includes("Trainer")?"Workspace":"Training Workspace"}`;
  const selected=departments.find(item=>item.id===state.selectedDepartment)||departments[0];
  const assignments=c.trainingAssignments.filter(item=>!selected||item.department_id===selected.id);
  const progressFor=assignment=>c.moduleProgress.filter(item=>item.training_assignment_id===assignment.id);
  const assignmentCards=assignments.map(assignment=>{const pathway=assignment.training_pathways||{};const progress=Math.round(Number(assignment.progress_percentage)||0);const modules=progressFor(assignment);return `<article class="card training-area-card"><div class="training-area-top"><span class="area-code">${escapeHtml(role)}</span><span class="status-chip status-${statusTone(assignment.status)}">${escapeHtml(assignment.status)}</span></div><div><h3>${escapeHtml(pathway.title||"Assigned training pathway")}</h3><p>${escapeHtml(pathway.description||"Complete the pathway assigned by Management.")}</p></div><div class="area-progress"><span style="width:${progress}%"></span></div><div class="module-meta"><span class="small">${progress}% complete · ${modules.filter(item=>item.status==="Approved"||item.status==="Ready for Trainer Review").length}/${modules.length} tracked modules</span>${assignment.due_date?`<span class="small">Due ${escapeHtml(assignment.due_date)}</span>`:""}</div></article>`;}).join("");
  const learner=["PCA","Cleaner"].includes(role), trainer=role.includes("Trainer");
  const trainerRelationships=c.trainerAssignments.filter(item=>!selected||item.department_id===selected.id);
  const traineeRows=trainerRelationships.map(relationship=>{const profile=c.traineeProfiles.find(item=>item.user_id===relationship.trainee_user_id);const assignment=c.trainingAssignments.find(item=>item.user_id===relationship.trainee_user_id&&item.department_id===relationship.department_id);if(!profile)return "";const progress=Math.round(Number(assignment?.progress_percentage)||0);const recommended=assignment&&c.signoffRecommendations.some(item=>item.training_assignment_id===assignment.id);return `<article class="card trainee-profile"><div class="section-heading"><div><span class="eyebrow">${escapeHtml(profile.employee_id||"ASSIGNED TRAINEE")}</span><h3>${escapeHtml(profile.full_name)}</h3><p>${escapeHtml(assignment?.training_pathways?.title||"No pathway assigned")}</p></div><span class="status-chip status-${statusTone(assignment?.status||"Not Started")}">${escapeHtml(assignment?.status||"Not Started")}</span></div><div class="area-progress"><span style="width:${progress}%"></span></div><p class="small">${progress}% complete${assignment?.due_date?` · Due ${escapeHtml(assignment.due_date)}`:""}</p>${assignment?`<label>Practical observation<textarea class="trainer-observation" data-assignment="${escapeHtml(assignment.id)}" placeholder="Record observable competency evidence"></textarea></label><label>Outcome<select class="trainer-outcome" data-assignment="${escapeHtml(assignment.id)}"><option>Competent</option><option>Needs Development</option><option>Not Observed</option></select></label><div class="profile-actions"><button class="btn save-real-observation" data-assignment="${escapeHtml(assignment.id)}" data-trainee="${escapeHtml(profile.user_id)}" data-department="${escapeHtml(relationship.department_id)}">Record observation</button><button class="btn send-real-recommendation" data-assignment="${escapeHtml(assignment.id)}" ${recommended||!["Ready for Trainer Review","Reassessment Required"].includes(assignment.status)?"disabled":""}>${recommended?"Recommendation sent":"Send to Management"}</button></div><p class="auth-status" id="trainer-status-${escapeHtml(assignment.id)}" role="status"></p>`:'<p class="empty-state">Management has not assigned a training pathway yet.</p>'}</article>`;}).join("");
  const learnerSummary=`<div class="stats-grid"><div class="stat-card"><span>Assigned pathways</span><strong>${assignments.length}</strong></div><div class="stat-card"><span>Unread notifications</span><strong>${c.notifications.length}</strong></div><div class="stat-card"><span>Competency records</span><strong>${c.competencyRecords.length}</strong></div></div><div class="section-heading" id="training"><div><span class="eyebrow">YOUR TRAINING</span><h3>Assigned pathways</h3></div></div><div class="grid grid-3">${assignmentCards||'<p class="empty-state">No training pathway has been assigned for this department yet.</p>'}</div>`;
  const trainerSummary=`<div class="stats-grid"><div class="stat-card"><span>Assigned trainees</span><strong>${trainerRelationships.length}</strong></div><div class="stat-card"><span>Pending reviews</span><strong>${c.trainingAssignments.filter(item=>item.status==="Ready for Trainer Review").length}</strong></div><div class="stat-card"><span>Unread notifications</span><strong>${c.notifications.length}</strong></div></div><div class="section-heading" id="staff"><div><span class="eyebrow">ASSIGNED TRAINEES</span><h3>Training and competency</h3></div></div><div class="grid grid-2">${traineeRows||'<p class="empty-state">No trainees are assigned in this department.</p>'}</div>`;
  const summary=learner?learnerSummary:trainer?trainerSummary:`<section class="card"><h3>${role==="Hospital Administrator"?"Hospital-wide Management access":escapeHtml(selected?.name||"Assigned access")}</h3><p class="small">Your permitted workspace is connected to SkillWard's secured database. Management write actions will be enabled in a later controlled phase.</p></section>`;
  renderShell(`<section class="dashboard-hero" id="home"><div class="dashboard-welcome"><span class="eyebrow">AUTHENTICATED WORKSPACE</span><h2>${escapeHtml(title)}</h2><p>Welcome, ${escapeHtml(c.profile.full_name)}. Your role, access and training records are loaded securely from SkillWard's database.</p></div>${learner?`<div class="progress-ring" style="--progress:${Math.round(Number(assignments[0]?.progress_percentage)||0)*3.6}deg"><div><strong>${Math.round(Number(assignments[0]?.progress_percentage)||0)}%</strong><span>complete</span></div></div>`:""}</section>${choose?`<section class="card"><label>Permitted department<select id="authenticatedDepartment">${departments.map(d=>`<option value="${escapeHtml(d.id)}" ${d.id===selected?.id?"selected":""}>${escapeHtml(d.name)}</option>`).join("")}</select></label></section>`:""}${summary}`);
  document.getElementById("authenticatedDepartment")?.addEventListener("change",event=>{state.selectedDepartment=event.target.value;renderAuthenticatedWorkspace();});
  document.querySelectorAll(".save-real-observation").forEach(button=>button.addEventListener("click",async()=>{const id=button.dataset.assignment,status=document.getElementById(`trainer-status-${id}`),note=document.querySelector(`.trainer-observation[data-assignment="${id}"]`),outcome=document.querySelector(`.trainer-outcome[data-assignment="${id}"]`);button.disabled=true;status.textContent="Saving observation…";try{await authService.database.recordPracticalObservation(c,{trainingAssignmentId:id,traineeUserId:button.dataset.trainee,departmentId:button.dataset.department,observationText:note.value,outcome:outcome.value});authenticatedContext=await authService.restore();renderAuthenticatedWorkspace();}catch{status.textContent="Observation could not be saved. Add evidence and try again.";button.disabled=false;}}));
  document.querySelectorAll(".send-real-recommendation").forEach(button=>button.addEventListener("click",async()=>{const id=button.dataset.assignment,status=document.getElementById(`trainer-status-${id}`);if(!confirm("Send this competency recommendation to Management?"))return;button.disabled=true;status.textContent="Sending recommendation…";try{await authService.database.submitSignoffRecommendation(c,{trainingAssignmentId:id,recommendationStatus:"Sent to Management",recommendationText:"Trainer recommends competency approval based on completed training and practical observation."});authenticatedContext=await authService.restore();renderAuthenticatedWorkspace();}catch{status.textContent="Recommendation could not be sent.";button.disabled=false;}}));
}

// Phase 1 authenticated workspace. This declaration intentionally supersedes
// the compatibility renderer above while Demo Mode continues to use its
// established route and sample-data dashboards.
function renderAuthenticatedWorkspace() {
  const c = authenticatedContext;
  if (!c) return renderLogin();
  if (c.membership.role === "SkillWard Super Administrator" && !c.organization) return renderPlatformAdministration(c);

  const departments = c.departmentDetails;
  const role = c.membership.role;
  const unrestrictedRoles = new Set(["Organisation Administrator", "Content Administrator/Educator"]);
  if (!unrestrictedRoles.has(role) && !departments.length) {
    return renderShell(`${organizationSwitcher(c)}<section class="card access-blocked"><h2>No assigned department</h2><p>Contact your Organisation Administrator to request authorised department access.</p></section>`);
  }
  if (departments.length && !departments.some(item => item.id === state.selectedDepartment)) state.selectedDepartment = departments[0].id;
  const selected = departments.find(item => item.id === state.selectedDepartment) || departments[0];
  const assignments = c.trainingAssignments.filter(item => !selected || item.department_id === selected.id);
  const learner = ["PCA", "Cleaner", "Support Worker"].includes(role);
  const trainer = role.includes("Trainer");
  const title = role === "Organisation Administrator" ? "Organisation Administration"
    : role === "Facility Administrator" ? "Facility Administration"
      : role === "Department Manager" ? "Department Management Workspace"
        : `${role} ${trainer ? "Workspace" : "Training Workspace"}`;

  if (role === "Organisation Administrator") return renderOrganizationAdministration(c);

  const assignmentCards = assignments.map(assignment => {
    const pathway = assignment.training_pathways || {};
    const progress = Math.round(Number(assignment.progress_percentage) || 0);
    const modules = c.moduleProgress.filter(item => item.training_assignment_id === assignment.id);
    return `<article class="card training-area-card"><div class="training-area-top"><span class="area-code">${escapeHtml(role)}</span><span class="status-chip status-${statusTone(assignment.status)}">${escapeHtml(assignment.status)}</span></div><div><h3>${escapeHtml(pathway.title || "Assigned training pathway")}</h3><p>${escapeHtml(pathway.description || "Complete the pathway assigned by Management.")}</p></div><div class="area-progress"><span style="width:${progress}%"></span></div><div class="module-meta"><span class="small">${progress}% complete · ${modules.length} tracked modules</span>${assignment.due_date ? `<span class="small">Due ${escapeHtml(assignment.due_date)}</span>` : ""}</div></article>`;
  }).join("");
  const trainerRelationships = c.trainerAssignments.filter(item => !selected || item.department_id === selected.id);
  const traineeRows = trainerRelationships.map(relationship => {
    const profile = c.traineeProfiles.find(item => item.user_id === relationship.trainee_user_id);
    const assignment = c.trainingAssignments.find(item => item.user_id === relationship.trainee_user_id && item.department_id === relationship.department_id);
    if (!profile) return "";
    const progress = Math.round(Number(assignment?.progress_percentage) || 0);
    return `<article class="card trainee-profile"><div class="section-heading"><div><span class="eyebrow">ASSIGNED TRAINEE</span><h3>${escapeHtml(profile.full_name)}</h3><p>${escapeHtml(assignment?.training_pathways?.title || "No pathway assigned")}</p></div><span class="status-chip status-${statusTone(assignment?.status || "Not Started")}">${escapeHtml(assignment?.status || "Not Started")}</span></div><div class="area-progress"><span style="width:${progress}%"></span></div>${assignment ? `<label>Practical observation<textarea class="trainer-observation" data-assignment="${escapeHtml(assignment.id)}" placeholder="Record observable competency evidence"></textarea></label><label>Outcome<select class="trainer-outcome" data-assignment="${escapeHtml(assignment.id)}"><option>Competent</option><option>Needs Development</option><option>Not Observed</option></select></label><div class="profile-actions"><button class="btn save-real-observation" data-assignment="${escapeHtml(assignment.id)}" data-trainee="${escapeHtml(profile.user_id)}" data-department="${escapeHtml(relationship.department_id)}">Record observation</button><button class="btn send-real-recommendation" data-assignment="${escapeHtml(assignment.id)}">Send to Management</button></div><p class="auth-status" id="trainer-status-${escapeHtml(assignment.id)}" role="status"></p>` : '<p class="empty-state">Management has not assigned a pathway.</p>'}</article>`;
  }).join("");
  const summary = learner
    ? `<div class="stats-grid"><div class="stat-card"><span>Assigned pathways</span><strong>${assignments.length}</strong></div><div class="stat-card"><span>Unread notifications</span><strong>${c.notifications.length}</strong></div><div class="stat-card"><span>Competency records</span><strong>${c.competencyRecords.length}</strong></div></div><div class="section-heading" id="training"><div><span class="eyebrow">YOUR TRAINING</span><h3>Assigned pathways</h3></div></div><div class="grid grid-3">${assignmentCards || '<p class="empty-state">No pathway has been assigned in this workspace.</p>'}</div>`
    : trainer
      ? `<div class="stats-grid"><div class="stat-card"><span>Assigned trainees</span><strong>${trainerRelationships.length}</strong></div><div class="stat-card"><span>Pending reviews</span><strong>${c.trainingAssignments.filter(item => item.status === "Ready for Trainer Review").length}</strong></div><div class="stat-card"><span>Unread notifications</span><strong>${c.notifications.length}</strong></div></div><div class="section-heading" id="staff"><div><span class="eyebrow">ASSIGNED TRAINEES</span><h3>Training and competency</h3></div></div><div class="grid grid-2">${traineeRows || '<p class="empty-state">No trainees are assigned in this department.</p>'}</div>`
      : `<section class="card"><h3>${escapeHtml(selected?.name || "Authorised workspace")}</h3><p class="small">Access is limited to your assigned facility and departments.</p></section>`;

  renderShell(`${organizationSwitcher(c)}<section class="dashboard-hero" id="home"><div class="dashboard-welcome"><span class="eyebrow">${escapeHtml(c.organization.name)}</span><h2>${escapeHtml(title)}</h2><p>Welcome, ${escapeHtml(c.profile.full_name)}. Records are scoped to this organisation workspace.</p></div></section>${departments.length > 1 ? `<section class="card workspace-filter"><label>Permitted department<select id="authenticatedDepartment">${departments.map(d => `<option value="${escapeHtml(d.id)}" ${d.id === selected?.id ? "selected" : ""}>${escapeHtml(d.name)}</option>`).join("")}</select></label></section>` : ""}${summary}`);
  bindAuthenticatedWorkspace(c);
}

function organizationSwitcher(context) {
  const platformOption = context.platformAdministrator?.is_active ? '<option value="">SkillWard Platform Administration</option>' : "";
  if (context.memberships.length < 2 && !platformOption) return "";
  return `<section class="card organization-switcher"><label><span>Organisation workspace</span><select id="organizationWorkspace">${platformOption}${context.memberships.map(item => `<option value="${escapeHtml(item.organization_id)}" ${item.organization_id === context.organization?.id ? "selected" : ""}>${escapeHtml(item.organizations?.name || "Organisation")} · ${escapeHtml(item.role)}</option>`).join("")}</select></label><small>Each workspace has separate facilities, departments and records.</small></section>`;
}

function bindAuthenticatedWorkspace(context) {
  document.getElementById("organizationWorkspace")?.addEventListener("change", async event => {
    event.target.disabled = true;
    state.activeOrganizationId = event.target.value;
    state.selectedDepartment = null;
    saveState();
    authenticatedContext = event.target.value ? await authService.switchOrganization(event.target.value) : await authService.restore();
    renderAuthenticatedWorkspace();
  });
  document.getElementById("authenticatedDepartment")?.addEventListener("change", event => { state.selectedDepartment = event.target.value; saveState(); renderAuthenticatedWorkspace(); });
  document.querySelectorAll(".save-real-observation").forEach(button => button.addEventListener("click", async () => {
    const id = button.dataset.assignment, status = document.getElementById(`trainer-status-${id}`), note = document.querySelector(`.trainer-observation[data-assignment="${id}"]`), outcome = document.querySelector(`.trainer-outcome[data-assignment="${id}"]`);
    button.disabled = true; status.textContent = "Saving observation…";
    try { await authService.database.recordPracticalObservation(context, { trainingAssignmentId:id, traineeUserId:button.dataset.trainee, departmentId:button.dataset.department, observationText:note.value, outcome:outcome.value }); authenticatedContext = await authService.restore(state.activeOrganizationId); renderAuthenticatedWorkspace(); }
    catch { status.textContent = "Observation could not be saved. Add evidence and try again."; button.disabled = false; }
  }));
  document.querySelectorAll(".send-real-recommendation").forEach(button => button.addEventListener("click", async () => {
    const status = document.getElementById(`trainer-status-${button.dataset.assignment}`);
    if (!confirm("Send this competency recommendation to Management?")) return;
    button.disabled = true; status.textContent = "Sending recommendation…";
    try { await authService.database.submitSignoffRecommendation(context, { trainingAssignmentId:button.dataset.assignment, recommendationStatus:"Sent to Management", recommendationText:"Trainer recommends competency approval based on completed training and practical observation." }); authenticatedContext = await authService.restore(state.activeOrganizationId); renderAuthenticatedWorkspace(); }
    catch { status.textContent = "Recommendation could not be sent."; button.disabled = false; }
  }));
}

function renderPlatformAdministration(context) {
  const organizations = context.organizations || [];
  const usage = new Map((context.organizationUsage || []).map(item => [item.organization_id, item]));
  renderShell(`<section class="dashboard-hero"><div class="dashboard-welcome"><span class="eyebrow">SKILLWARD CONTROL PLANE</span><h2>Platform Administration</h2><p>Create and govern organisations, subscriptions, templates and explicitly authorised support access.</p></div></section><div class="stats-grid"><div class="stat-card"><span>Organisations</span><strong>${organizations.length}</strong></div><div class="stat-card"><span>Active</span><strong>${organizations.filter(item => item.status === "Active").length}</strong></div><div class="stat-card"><span>Pilot plans</span><strong>${organizations.filter(item => item.subscription_plan === "Pilot").length}</strong></div></div><section class="admin-setup-grid"><form class="card setup-form" id="createOrganizationForm"><span class="eyebrow">NEW WORKSPACE</span><h3>Create organisation</h3><label>Name<input name="name" required></label><label>Type<select name="type"><option>Hospital</option><option>Aged Care</option><option>Disability Support</option></select></label><label>Slug<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required></label><button class="btn" type="submit">Create organisation</button><p class="auth-status" role="status"></p></form><section class="card"><span class="eyebrow">SUBSCRIPTIONS &amp; USAGE</span><h3>Organisation register</h3><div class="organization-register">${organizations.map(item => { const totals = usage.get(item.id) || {}; return `<article><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.organization_type)} · ${escapeHtml(item.subscription_plan)} · ${escapeHtml(item.subscription_status)}</small><small>${Number(totals.active_members || 0)} members · ${Number(totals.active_facilities || 0)} facilities · ${Number(totals.active_departments || 0)} departments</small></div><span class="status-chip status-${item.status === "Active" ? "success" : "neutral"}">${escapeHtml(item.status)}</span>${item.status === "Active" ? `<button class="link-button archive-organization" data-id="${escapeHtml(item.id)}">Archive</button>` : ""}</article>`; }).join("") || '<p class="empty-state">No organisations have been created.</p>'}</div></section></section><section class="card"><span class="eyebrow">EXPLICIT SUPPORT MODE</span><h3>Authorised sessions</h3><p class="small">Support access is organisation-approved, time-limited and fully audited. Platform administration alone cannot open clinical workforce records.</p><div class="organization-register">${(context.supportSessions || []).map(item => `<article><div><strong>${escapeHtml(item.reason)}</strong><small>Expires ${escapeHtml(new Date(item.expires_at).toLocaleString("en-AU"))}</small></div><span class="status-chip status-${item.status === "Active" ? "success" : "warning"}">${escapeHtml(item.status)}</span>${item.status === "Pending" ? `<button class="link-button activate-support" data-id="${escapeHtml(item.id)}">Enter support mode</button>` : ""}</article>`).join("") || '<p class="empty-state">No organisation has authorised a support session.</p>'}</div></section><section class="card"><span class="eyebrow">SKILLWARD TEMPLATES</span><h3>Pathway template governance</h3><p class="small">Template ownership is established in Phase 1. The guided authoring and version-control tools arrive in Phase 2.</p></section>`);
  document.querySelector(".admin-setup-grid")?.insertAdjacentHTML("beforeend", `<form class="card setup-form" id="firstAdministratorForm"><span class="eyebrow">FIRST ADMINISTRATOR</span><h3>Invite organisation owner</h3><label>Organisation<select name="organizationId" required><option value="">Choose organisation</option>${organizations.filter(item => item.status === "Active").map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</select></label><label>Full name<input name="fullName" required></label><label>Employee ID<input name="employeeId" required></label><label>Email<input name="email" type="email" required></label><button class="btn" type="submit">Invite first administrator</button><p class="auth-status" role="status"></p></form>`);
  document.getElementById("createOrganizationForm")?.addEventListener("submit", async event => { event.preventDefault(); const form = event.currentTarget, status = form.querySelector(".auth-status"), values = new FormData(form); status.textContent = "Creating secure workspace…"; try { await authService.database.createOrganization({ name:values.get("name"), organizationType:values.get("type"), slug:values.get("slug") }); authenticatedContext = await authService.restore(); renderAuthenticatedWorkspace(); } catch { status.textContent = "The organisation could not be created. Check the slug and try again."; } });
  document.getElementById("firstAdministratorForm")?.addEventListener("submit", async event => { event.preventDefault(); const form = event.currentTarget, status = form.querySelector(".auth-status"), values = new FormData(form); status.textContent = "Creating protected invitation…"; try { await authService.database.inviteOrganizationMember(context, { organizationId:values.get("organizationId"), fullName:values.get("fullName"), employeeId:values.get("employeeId"), email:values.get("email"), role:"Organisation Administrator" }); status.textContent = "Invitation created and submitted for delivery."; form.reset(); } catch { status.textContent = "The first-administrator invitation could not be delivered."; } });
  document.querySelectorAll(".archive-organization").forEach(button => button.addEventListener("click", async () => { if (!confirm("Archive this organisation? Its records will be retained and access will stop.")) return; await authService.database.archiveOrganization(button.dataset.id); authenticatedContext = await authService.restore(); renderAuthenticatedWorkspace(); }));
  document.querySelectorAll(".activate-support").forEach(button => button.addEventListener("click", async () => { if (!confirm("Enter this time-limited support session? The action and all access will be audited.")) return; const session = (context.supportSessions || []).find(item => item.id === button.dataset.id); await authService.database.activateSupportSession(button.dataset.id); state.activeOrganizationId = session.organization_id; saveState(); authenticatedContext = await authService.switchOrganization(session.organization_id); renderAuthenticatedWorkspace(); }));
}

function renderOrganizationAdministration(context) {
  const facilities = context.facilities || [], departments = context.departmentDetails || [], settings = context.organization.branding_settings || {};
  const roleOptions = ["Organisation Administrator","Facility Administrator","Department Manager","Content Administrator/Educator","PCA Trainer","Cleaner Trainer","PCA","Cleaner","Support Worker"];
  const view = state.activeWorkspaceView || "home";
  const staff = context.organizationStaff || [];
  const identityComplete = Boolean(context.organization.logo_path || settings.primaryColor || settings.accentColor);
  const setupItems = [
    ["identity", "Organisation identity", identityComplete, "Add your logo and brand colours"],
    ["facility", "First facility", facilities.length > 0, "Create the hospital or care location"],
    ["department", "Departments", departments.length > 0, "Add the teams that deliver training"],
    ["people", "Administrators and staff", staff.length > 1, "Invite the people who will use SkillWard"]
  ];
  const completed = setupItems.filter(item => item[2]).length;
  const progress = Math.round((completed / setupItems.length) * 100);
  const workspaceHero = (eyebrow, title, description, action = "") => `${organizationSwitcher(context)}<section class="dashboard-hero workspace-page-hero"><div class="dashboard-welcome"><span class="eyebrow">${eyebrow}</span><h2>${title}</h2><p>${description}</p></div>${action}</section>`;
  const stats = `<div class="stats-grid workspace-stats"><div class="stat-card"><span>Facilities</span><strong>${facilities.length}</strong></div><div class="stat-card"><span>Departments</span><strong>${departments.length}</strong></div><div class="stat-card"><span>People</span><strong>${staff.length}</strong></div><div class="stat-card"><span>Setup</span><strong>${progress}%</strong></div></div>`;
  const staffRows = staff.map(item => { const profile = item.user_profiles || {}; return `<article class="person-row"><span class="person-avatar">${escapeHtml((profile.full_name || item.employee_id || "S").charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(profile.full_name || "Staff member")}</strong><small>${escapeHtml(item.employee_id || "Employee ID pending")} · ${escapeHtml(item.employment_status || "Active")}</small></div><span class="status-chip status-${item.account_status === "Active" ? "success" : "warning"}">${escapeHtml(item.account_status || "Profile")}</span></article>`; }).join("");
  const inviteForm = `<form class="card setup-form focused-form" id="organizationInviteForm"><span class="eyebrow">PEOPLE &amp; PERMISSIONS</span><h3>Invite a team member</h3><p class="small">Create one secure account, then assign only the organisation, facility and department access this person needs.</p><div class="form-grid"><label>Full name<input name="fullName" autocomplete="name" required></label><label>Employee ID<input name="employeeId" required></label><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Role<select name="role">${roleOptions.map(role => `<option>${escapeHtml(role)}</option>`).join("")}</select></label><label>Facility<select name="facilityId"><option value="">Organisation-wide</option>${facilities.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</select></label><label>Department<select name="departmentId"><option value="">No department yet</option>${departments.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</select></label></div><button class="btn" type="submit">Send secure invitation</button><p class="small trust-note">Invitation delivery is protected, role-scoped and written to the audit history.</p><p class="auth-status" role="status"></p></form>`;

  let content = "";
  if (view === "home") {
    const checklist = setupItems.map(([step, label, done, detail], index) => `<button class="setup-check ${done ? "is-complete" : ""}" data-setup-step="${step}"><span>${done ? "✓" : index + 1}</span><div><strong>${label}</strong><small>${done ? "Complete" : detail}</small></div><b>→</b></button>`).join("");
    content = `${workspaceHero("ORGANISATION HOME", escapeHtml(context.organization.name), `Welcome, ${escapeHtml(context.profile.full_name)}. Set up your organisation, then manage learning and competency from the workspace navigation.`)}${stats}<section class="workspace-home-grid"><section class="card setup-progress-card"><div class="section-heading"><div><span class="eyebrow">GET STARTED</span><h3>Organisation setup</h3></div><strong>${completed}/${setupItems.length}</strong></div><div class="setup-progress-track"><span style="width:${progress}%"></span></div><div class="setup-checklist">${checklist}</div></section><section class="card workspace-overview-card"><span class="eyebrow">WORKSPACE OVERVIEW</span><h3>Everything in one secure organisation</h3><div class="overview-links"><button class="workspace-route" data-view="pathways"><span>▷</span><div><strong>Training pathways</strong><small>Lessons, quizzes and practical requirements</small></div><b>→</b></button><button class="workspace-route" data-view="people"><span>♙</span><div><strong>People and permissions</strong><small>Staff, trainers, managers and access</small></div><b>→</b></button><button class="workspace-route" data-view="competency"><span>✓</span><div><strong>Competency</strong><small>Assessment, approval and renewal status</small></div><b>→</b></button><button class="workspace-route" data-view="reports"><span>▥</span><div><strong>Reports</strong><small>Readiness and compliance visibility</small></div><b>→</b></button></div></section></section>`;
  } else if (view === "pathways") {
    const pathways = [...new Map((context.trainingAssignments || []).filter(item => item.training_pathways).map(item => [item.training_pathways.id || item.training_pathway_id, item.training_pathways])).values()];
    content = `${workspaceHero("LEARNING", "Training pathways", "Build structured learning from SkillWard templates, then assign the published version to workers.", '<button class="btn workspace-route" data-view="admin" data-setup-step="department">Check department readiness</button>')}<section class="workspace-home-grid"><section class="card"><span class="eyebrow">PATHWAY LIBRARY</span><h3>${pathways.length ? "Available pathways" : "No organisation pathways yet"}</h3>${pathways.map(item => `<article class="pathway-list-item"><span>▷</span><div><strong>${escapeHtml(item.title || "Training pathway")}</strong><small>${escapeHtml(item.description || "Organisation learning pathway")}</small></div><span class="status-chip status-success">Published</span></article>`).join("") || '<div class="purpose-empty"><span>＋</span><h4>Start with a SkillWard template</h4><p>The Canvas-style pathway builder will guide educators through modules, lessons, quizzes, practical checklists, review and publishing without starting from a blank screen.</p></div>'}</section><section class="card pathway-structure"><span class="eyebrow">PATHWAY STRUCTURE</span><h3>Learning that becomes competency</h3><ol><li><span>1</span><div><strong>Modules and lessons</strong><small>Local procedures, objectives, media and documents</small></div></li><li><span>2</span><div><strong>Knowledge checks</strong><small>Quizzes, pass marks, prerequisites and attempts</small></div></li><li><span>3</span><div><strong>Practical assessment</strong><small>Trainer checklist, evidence and recommendation</small></div></li><li><span>4</span><div><strong>Approval and renewal</strong><small>Manager decision, competency record and reassessment</small></div></li></ol></section></section>`;
  } else if (view === "people") {
    content = `${workspaceHero("PEOPLE", "People and permissions", "Invite staff once, assign trusted roles and keep every facility and department boundary explicit.")}${stats}<section class="people-layout"><section class="card people-directory"><div class="section-heading"><div><span class="eyebrow">DIRECTORY</span><h3>Organisation people</h3></div><span class="count-badge">${staff.length}</span></div><div class="people-list">${staffRows || '<div class="purpose-empty compact"><h4>No staff profiles yet</h4><p>Use the invitation form to add the first administrator, manager, educator, trainer or worker.</p></div>'}</div></section>${inviteForm}</section>`;
  } else if (view === "competency") {
    content = `${workspaceHero("COMPETENCY", "Assessment and assurance", "Track the complete journey from learning through practical assessment, manager approval and reassessment.")}<div class="stats-grid workspace-stats"><div class="stat-card"><span>Awaiting assessment</span><strong>0</strong></div><div class="stat-card"><span>Awaiting approval</span><strong>0</strong></div><div class="stat-card"><span>Current</span><strong>${context.competencyRecords?.length || 0}</strong></div><div class="stat-card"><span>Reassessment</span><strong>0</strong></div></div><section class="card competency-flow"><span class="eyebrow">CONTROLLED WORKFLOW</span><h3>One auditable competency record</h3><div><article><span>1</span><strong>Worker completes learning</strong></article><article><span>2</span><strong>Trainer assesses practice</strong></article><article><span>3</span><strong>Manager approves</strong></article><article><span>4</span><strong>SkillWard monitors renewal</strong></article></div><p class="empty-state">No organisation-wide competency decisions require attention yet.</p></section>`;
  } else if (view === "reports") {
    content = `${workspaceHero("REPORTS", "Readiness and compliance", "See whether the organisation is configured, staffed and ready to deliver controlled training.")}${stats}<section class="reports-grid"><article class="card report-panel"><span class="eyebrow">SETUP READINESS</span><h3>${progress}% ready</h3><div class="setup-progress-track"><span style="width:${progress}%"></span></div><ul>${setupItems.map(item => `<li><span>${item[2] ? "✓" : "○"}</span>${item[1]}<strong>${item[2] ? "Ready" : "Action required"}</strong></li>`).join("")}</ul></article><article class="card report-panel"><span class="eyebrow">ACCESS ASSURANCE</span><h3>Organisation boundary active</h3><p>Every workplace record is restricted by active membership, role and authorised facility or department access.</p><div class="assurance-badge">✓ RLS protected</div></article></section>`;
  } else {
    const step = state.organizationSetupStep || "identity";
    const steps = [["identity", "Identity"], ["facility", "Facilities"], ["department", "Departments"], ["people", "Invitations"], ["support", "Support"]];
    const stepper = `<nav class="admin-stepper" aria-label="Organisation setup">${steps.map(([id, label], index) => `<button class="${step === id ? "is-active" : ""}" data-setup-step="${id}"><span>${index + 1}</span>${label}</button>`).join("")}</nav>`;
    let panel = "";
    if (step === "identity") panel = `<form class="card setup-form focused-form" id="brandingForm"><span class="eyebrow">1 · ORGANISATION IDENTITY</span><h3>Brand this workspace</h3><p class="small">Use an approved logo URL and colours that staff will recognise when they sign in.</p><label>Organisation logo URL<input name="logoPath" type="url" value="${escapeHtml(context.organization.logo_path || "")}" placeholder="https://example.org/organisation-logo.svg"></label><div class="colour-fields"><label><span>Primary colour</span><input name="primaryColor" type="color" value="${escapeHtml(settings.primaryColor || "#0b4051")}"><small>${escapeHtml(settings.primaryColor || "#0b4051")}</small></label><label><span>Accent colour</span><input name="accentColor" type="color" value="${escapeHtml(settings.accentColor || "#20b8ad")}"><small>${escapeHtml(settings.accentColor || "#20b8ad")}</small></label></div><button class="btn" type="submit">Save and continue</button><p class="auth-status" role="status"></p></form>`;
    if (step === "facility") panel = `<section class="admin-focus-grid"><form class="card setup-form focused-form" id="facilityForm"><span class="eyebrow">2 · FACILITIES</span><h3>Add a care location</h3><p class="small">A facility is a physical hospital or care site. Departments are created inside it.</p><label>Facility name<input name="name" placeholder="Royal Perth Hospital" required></label><label>Location<input name="location" placeholder="Perth, Western Australia"></label><button class="btn" type="submit">Add facility and continue</button><p class="auth-status" role="status"></p></form><section class="card setup-register"><span class="eyebrow">CURRENT FACILITIES</span><h3>${facilities.length} configured</h3>${facilities.map(item => `<article><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.location || "Location not provided")}</small></div><span class="status-chip status-success">Active</span></article>`).join("") || '<p class="empty-state">No facilities have been added.</p>'}</section></section>`;
    if (step === "department") panel = `<section class="admin-focus-grid"><form class="card setup-form focused-form" id="departmentForm"><span class="eyebrow">3 · DEPARTMENTS</span><h3>Add a department</h3><p class="small">Departments control content, staff access, trainers, reporting and competency workflows.</p><label>Facility<select name="facilityId" required><option value="">Choose facility</option>${facilities.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</select></label><div class="form-grid"><label>Department code<input name="code" maxlength="30" placeholder="OT" required></label><label>Department name<input name="name" placeholder="Operating Theatre & Recovery" required></label></div><label>Description<textarea name="description" placeholder="Describe the team and its training responsibilities"></textarea></label><button class="btn" type="submit" ${facilities.length ? "" : "disabled"}>Add department and continue</button>${facilities.length ? "" : '<p class="form-guidance">Add a facility before creating a department.</p>'}<p class="auth-status" role="status"></p></form><section class="card setup-register"><span class="eyebrow">CURRENT DEPARTMENTS</span><h3>${departments.length} configured</h3>${departments.map(item => `<article><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.code || "Department")}</small></div><span class="status-chip status-success">Active</span></article>`).join("") || '<p class="empty-state">No departments have been added.</p>'}</section></section>`;
    if (step === "people") panel = inviteForm;
    if (step === "support") panel = `<form class="card setup-form focused-form support-form" id="supportAuthorizationForm"><span class="eyebrow">5 · SUPPORT ACCESS</span><h3>Authorise a verified support request</h3><p class="small">Use this only when SkillWard support has supplied a verified support user ID. Access is time-limited and fully audited.</p><label>Verified support user ID<input name="supportUserId" type="text" autocomplete="off" required></label><label>Reason for access<textarea name="reason" minlength="10" placeholder="Describe the support request and approved scope" required></textarea></label><label class="hours-field">Access duration in hours <input name="hours" type="number" min="1" max="24" value="1" required></label><button class="btn" type="submit">Authorise time-limited access</button><p class="trust-note">The support user must separately activate the session. Every access event is written to immutable audit history.</p><p class="auth-status" role="status"></p></form>`;
    content = `${workspaceHero("ADMIN", "Organisation settings", "Complete the guided setup once, then return here only when your organisation structure or access changes.")}${stepper}<div class="admin-focus">${panel}</div>`;
  }

  renderShell(content);
  bindAuthenticatedWorkspace(context);
  document.querySelectorAll(".workspace-route").forEach(button => button.addEventListener("click", () => { state.activeWorkspaceView = button.dataset.view; if (button.dataset.setupStep) state.organizationSetupStep = button.dataset.setupStep; saveState(); renderAuthenticatedWorkspace(); }));
  document.querySelectorAll("[data-setup-step]").forEach(button => button.addEventListener("click", () => { state.activeWorkspaceView = "admin"; state.organizationSetupStep = button.dataset.setupStep; saveState(); renderAuthenticatedWorkspace(); }));
  bindSetupForm("brandingForm", async values => { await authService.database.updateOrganizationBranding(context, { logoPath:values.get("logoPath"), primaryColor:values.get("primaryColor"), accentColor:values.get("accentColor") }); state.organizationSetupStep = "facility"; saveState(); });
  bindSetupForm("facilityForm", async values => { await authService.database.createFacility(context, { name:values.get("name"), location:values.get("location") }); state.organizationSetupStep = "department"; saveState(); });
  bindSetupForm("departmentForm", async values => { await authService.database.createDepartment(context, { facilityId:values.get("facilityId"), code:values.get("code"), name:values.get("name"), description:values.get("description") }); state.organizationSetupStep = "people"; saveState(); });
  bindSetupForm("organizationInviteForm", async values => { await authService.database.inviteOrganizationMember(context, { fullName:values.get("fullName"), employeeId:values.get("employeeId"), email:values.get("email"), role:values.get("role"), facilityId:values.get("facilityId"), departmentId:values.get("departmentId") }); state.activeWorkspaceView = "people"; saveState(); });
  bindSetupForm("supportAuthorizationForm", values => authService.database.authorizeSupportAccess(context, { supportUserId:values.get("supportUserId"), reason:values.get("reason"), hours:values.get("hours") }));
}

function bindSetupForm(id, submit) {
  document.getElementById(id)?.addEventListener("submit", async event => { event.preventDefault(); const form = event.currentTarget, status = form.querySelector(".auth-status"); status.textContent = "Saving…"; try { await submit(new FormData(form)); authenticatedContext = await authService.restore(state.activeOrganizationId); renderAuthenticatedWorkspace(); } catch { status.textContent = "This change could not be saved. Check your authorised scope and the entered details."; } });
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
      <span class="eyebrow">${escapeHtml(departmentName(state.selectedDepartment))}</span>
      <h2>${role === "cleaner" ? "Cleaner Training Hub" : title}</h2>
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
  const store = managementStore(), actor = currentManager(store);
  const department = DEPARTMENTS.find(item => item.id === state.selectedDepartment);
  if (!department) return renderDepartmentSelection();
  if (!store.actorCanAccess(actor, department.id)) { state.selectedDepartment = actor.departments[0] || null; saveState(); return state.selectedDepartment ? renderManagementDashboard() : renderShell('<section class="card access-blocked"><h2>No department access</h2><p>Ask Management to assign a department.</p></section>'); }
  const hospitalWide = actor.level === "Hospital Administrator";
  const report = MANAGEMENT_REPORTS[state.selectedDepartment];
  const records = workflowRecords().filter(item => item.department === state.selectedDepartment);
  const visibleStaff = store.data.staff.filter(person => hospitalWide || person.departments.some(id => actor.departments.includes(id)));
  const departmentOptions = DEPARTMENTS.filter(d => actor.departments.includes(d.id)).map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join("");
  const identity = person => `<span class="staff-identity"><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.id)}</small></span>`;
  const staffDepartmentRows = visibleStaff.filter(p => ["PCA", "Cleaner"].includes(p.role)).map(p => `<div class="assignment-control" data-id="${p.id}">${identity(p)}<span>${p.role}</span><label><span>Department</span><select class="staff-department"><option value="">Choose department</option>${DEPARTMENTS.filter(d => actor.departments.includes(d.id)).map(d => `<option value="${d.id}" ${p.departments.includes(d.id) ? "selected" : ""}>${escapeHtml(d.name)}</option>`).join("")}</select></label><button class="btn btn-secondary save-staff-department">Confirm</button></div>`).join("");
  const trainerDepartmentRows = visibleStaff.filter(p => p.role.includes("Trainer")).map(p => `<div class="assignment-control" data-id="${p.id}">${identity(p)}<span>${p.role}</span><fieldset class="department-checks"><legend>Departments</legend>${DEPARTMENTS.filter(d => actor.departments.includes(d.id)).map(d => `<label><input type="checkbox" value="${d.id}" ${p.departments.includes(d.id) ? "checked" : ""}> ${escapeHtml(d.name)}</label>`).join("")}</fieldset><button class="btn btn-secondary save-trainer-departments">Confirm</button></div>`).join("");
  const staffTrainerRows = visibleStaff.filter(p => ["PCA", "Cleaner"].includes(p.role)).map(p => { const required = `${p.role} Trainer`; const compatible = visibleStaff.filter(t => t.role === required && p.departments.some(d => t.departments.includes(d))); return `<div class="assignment-control" data-id="${p.id}">${identity(p)}<span>${p.role}</span><label><span>Trainer</span><select class="staff-trainer"><option value="">Choose trainer</option>${compatible.map(t => { const cap=store.trainerCapacity(t.id); return `<option value="${t.id}" ${p.trainerId===t.id?"selected":""}>${escapeHtml(t.name)} · ${t.id} (${cap.active}/${cap.capacity})</option>`; }).join("")}</select></label><button class="btn btn-secondary save-staff-trainer">Review and confirm</button></div>`; }).join("");
  const recommendations = records.filter(item => item.status === "Sent to Management").map(item => `<article class="review-card" data-id="${item.id}"><div><strong>${escapeHtml(item.name)}</strong><span>${item.role} · ${escapeHtml(item.feedback || "Trainer recommendation")}</span></div><label>Management feedback<textarea class="management-feedback" placeholder="Required when requesting reassessment"></textarea></label><div><button class="btn approve-signoff">Approve</button><button class="btn btn-danger reassess-signoff">Request reassessment</button></div></article>`).join("");
  const staffRows = visibleStaff.map(person => { const trainer=store.data.staff.find(p=>p.id===person.trainerId), manager=store.data.managers.find(p=>p.id===person.managerId), overdue=store.data.assignments.some(a=>a.staffId===person.id && a.dueDate < new Date().toISOString().slice(0,10) && a.managementApprovalStatus!=="Approved"); return `<tr class="directory-row" data-search="${escapeHtml((person.name+' '+person.id+' '+person.email).toLowerCase())}" data-role="${person.role}" data-department="${person.departments.join(' ')}" data-account="${person.accountStatus}" data-employment="${person.employmentStatus}" data-competency="${person.competencyStatus}" data-trainer="${trainer?.id||'unassigned'}" data-manager="${manager?.id||'unassigned'}" data-progress="${person.progress}" data-overdue="${overdue?'overdue':'current'}"><td><input type="checkbox" class="bulk-select" data-id="${person.id}" aria-label="Select ${escapeHtml(person.name)}"> <button class="link-button staff-profile" data-id="${person.id}">${identity(person)}</button></td><td>${person.role}</td><td>${person.departments.map(departmentName).map(escapeHtml).join(', ')}</td><td>${person.progress}%</td><td><span class="status-chip status-${person.accountStatus==='Suspended'?'danger':person.accountStatus==='Active'?'success':'warning'}">${person.accountStatus}</span></td></tr>`; }).join("");

  renderShell(`
    <section class="management-title" id="home"><div><h2>Management Dashboard</h2><p class="management-subtitle">${hospitalWide ? "Hospital-wide workspace" : `${escapeHtml(department.name)} · Department management workspace`}</p></div><button class="btn btn-secondary" id="changeDepartmentBtn">Switch Department</button></section>
    <div class="stats-grid management-stats"><div class="stat-card"><span>Total PCA staff</span><strong>${report.pca}</strong></div><div class="stat-card"><span>Total Cleaner staff</span><strong>${report.cleaners}</strong></div><div class="stat-card stat-complete"><span>Completed training</span><strong>${report.completed}</strong></div><div class="stat-card stat-overdue"><span>Overdue training</span><strong>${report.overdue}</strong></div></div>
    <section class="card dashboard-card management-section" id="training"><div class="section-heading"><div><span class="eyebrow">WORKFORCE ASSIGNMENTS</span><h3>Assignments</h3></div><span class="small">Role and capacity checked</span></div><p class="readonly-note">Assign staff and trainers to departments, then connect each staff member with the appropriate trainer.</p><div class="assignment-groups"><section><h4>1. Staff department assignments</h4><div class="assignment-list">${staffDepartmentRows}</div></section><section><h4>2. Trainer department assignments</h4><div class="assignment-list">${trainerDepartmentRows}</div></section><section><h4>3. Staff-to-trainer assignments</h4><p class="small">Trainer capacity is shown before confirmation. Selecting a new trainer replaces the current assignment.</p><div class="assignment-list">${staffTrainerRows}</div></section></div></section>
    <section class="card dashboard-card management-section" id="reports"><div class="section-heading"><div><span class="eyebrow">FINAL APPROVAL</span><h3>Sign-off recommendations</h3></div><span class="count-badge">${records.filter(item=>item.status==="Sent to Management").length}</span></div><div class="review-list">${recommendations || '<p class="empty-state">No recommendations awaiting Management.</p>'}</div></section>
    <section class="card dashboard-card management-section" id="staff"><div class="section-heading"><div><span class="eyebrow">STAFF DIRECTORY</span><h3>Profiles and assignments</h3></div><button class="btn" id="inviteStaff">Invite staff</button></div>
      <div class="directory-filters"><label class="search-filter"><span>Name, employee ID or email</span><input id="staffSearch" type="search" placeholder="Search staff"></label>${[["roleFilter","Role","All roles",["PCA","Cleaner","PCA Trainer","Cleaner Trainer"]],["departmentFilter","Department","All departments",DEPARTMENTS.filter(d=>actor.departments.includes(d.id)).map(d=>[d.id,d.name])],["accountFilter","Account status","All account statuses",store.ACCOUNT_STATUSES],["employmentFilter","Employment status","All employment statuses",store.EMPLOYMENT_STATUSES],["competencyFilter","Competency status","All competencies",["Not Started","In Progress","Approved","Reassessment Required"]],["trainerFilter","Trainer","All trainers",visibleStaff.filter(p=>p.role.includes('Trainer')).map(p=>[p.id,p.name])],["managerFilter","Manager","All managers",store.data.managers.map(p=>[p.id,p.name])],["progressFilter","Training progress","All progress",[["0-49","0–49%"],["50-99","50–99%"],["100","100%"]]],["overdueFilter","Overdue status","All due dates",[["overdue","Overdue"],["current","Current"]]]].map(([id,label,all,values])=>`<label><span>${label}</span><select id="${id}"><option value="all">${all}</option>${values.map(v=>Array.isArray(v)?`<option value="${v[0]}">${escapeHtml(v[1])}</option>`:`<option>${v}</option>`).join('')}</select></label>`).join('')}</div>
      <div class="bulk-bar"><strong id="selectionCount">0 selected</strong><label><span class="sr-only">Bulk action</span><select id="bulkAction"><option value="">Bulk action</option><option value="Suspended">Suspend access</option><option value="Archived">Archive accounts</option></select></label><button class="btn btn-secondary" id="applyBulk" disabled>Review and apply</button></div><div class="table-wrap"><table class="staff-table"><thead><tr><th>Staff member</th><th>Role</th><th>Department</th><th>Progress</th><th>Account</th></tr></thead><tbody>${staffRows}</tbody></table></div><p id="emptyDirectory" class="empty-state" hidden>No staff match these filters.</p><div id="staffProfilePanel"></div></section>
    <section class="card dashboard-card management-section" id="audit"><div class="section-heading"><div><span class="eyebrow">PERMANENT HISTORY</span><h3>Audit history</h3></div><span class="small">Read only</span></div><div class="audit-feed">${store.data.audit.slice(0,20).map(a=>`<article><strong>${escapeHtml(a.action)}</strong><span class="staff-identity"><strong>${escapeHtml(a.staffName)}</strong><small>${escapeHtml(a.staffId)}</small></span><span>By ${escapeHtml(a.actor)} (${escapeHtml(a.actorRole)})</span><small>${escapeHtml(a.at)} · ${escapeHtml(departmentName(a.department)||'Hospital-wide workspace')}</small></article>`).join('') || '<p class="empty-state">No management changes recorded yet.</p>'}</div></section>
    <section class="card coming-soon"><h3>Training content coming soon</h3><p>Management can monitor training and approve competency, but cannot edit clinical training content.</p></section>`);

  const persist = () => { state.managementData=store.data; saveState(); };
  const confirmChange = (message, action) => { if (!confirm(message)) return; try { action(); persist(); renderManagementDashboard(); } catch (error) { alert(error.message); } };
  document.querySelectorAll('.save-staff-department').forEach(btn=>btn.addEventListener('click',()=>{const row=btn.closest('.assignment-control'),id=row.dataset.id,value=row.querySelector('select').value;confirmChange(`Assign ${id} to ${departmentName(value)}?`,()=>store.assignDepartments(actor,id,[value]));}));
  document.querySelectorAll('.save-trainer-departments').forEach(btn=>btn.addEventListener('click',()=>{const row=btn.closest('.assignment-control'),id=row.dataset.id,values=[...row.querySelectorAll('input:checked')].map(x=>x.value);confirmChange(`Confirm ${values.length} department assignment(s) for ${id}?`,()=>store.assignDepartments(actor,id,values));}));
  document.querySelectorAll('.save-staff-trainer').forEach(btn=>btn.addEventListener('click',()=>{const row=btn.closest('.assignment-control'),id=row.dataset.id,trainerId=row.querySelector('select').value;if(!trainerId)return alert('Choose a compatible trainer.');const cap=store.trainerCapacity(trainerId);confirmChange(`Assign trainer ${trainerId} to ${id}? Capacity: ${cap.active}/${cap.capacity}.`,()=>store.assignTrainer(actor,id,trainerId,cap.atCapacity));}));
  const filters=[['role','roleFilter'],['department','departmentFilter'],['account','accountFilter'],['employment','employmentFilter'],['competency','competencyFilter'],['trainer','trainerFilter'],['manager','managerFilter'],['overdue','overdueFilter']];
  const filterDirectory=()=>{let shown=0;document.querySelectorAll('.directory-row').forEach(row=>{const progress=document.getElementById('progressFilter').value,p=Number(row.dataset.progress),progressOK=progress==='all'||(progress==='100'?p===100:progress==='0-49'?p<50:p>=50&&p<100);const ok=row.dataset.search.includes(document.getElementById('staffSearch').value.toLowerCase())&&progressOK&&filters.every(([key,id])=>document.getElementById(id).value==='all'||row.dataset[key].includes(document.getElementById(id).value));row.hidden=!ok;if(ok)shown++;});document.getElementById('emptyDirectory').hidden=shown>0;};
  document.querySelectorAll('.directory-filters input,.directory-filters select').forEach(el=>el.addEventListener(el.tagName==='INPUT'?'input':'change',filterDirectory));
  const updateBulk=()=>{const count=document.querySelectorAll('.bulk-select:checked').length;document.getElementById('selectionCount').textContent=`${count} selected`;document.getElementById('applyBulk').disabled=!count||!document.getElementById('bulkAction').value;};
  document.querySelectorAll('.bulk-select').forEach(el=>el.addEventListener('change',updateBulk)); document.getElementById('bulkAction').addEventListener('change',updateBulk);
  document.getElementById('applyBulk').addEventListener('click',()=>{const ids=[...document.querySelectorAll('.bulk-select:checked')].map(el=>el.dataset.id),status=document.getElementById('bulkAction').value;confirmChange(`Apply ${status} to ${ids.map(id=>store.data.staff.find(p=>p.id===id)?.name+' · '+id).join(', ')}?`,()=>store.bulk(actor,ids,{accountStatus:status},true));});
  document.getElementById('inviteStaff').addEventListener('click',async()=>{ const Service=globalThis.SkillWardServices?.InvitationService; const result=Service ? await new Service().invite({email:'',role:'PCA',departmentId:department.id}) : {message:'Staff invitations are not available in this development integration. A protected Management service must be deployed first.'}; alert(result.message); });
  document.querySelectorAll('.staff-profile').forEach(button=>button.addEventListener('click',()=>{const person=store.data.staff.find(p=>p.id===button.dataset.id),trainer=store.data.staff.find(p=>p.id===person.trainerId);document.getElementById('staffProfilePanel').innerHTML=`<article class="staff-detail"><span class="eyebrow">STAFF PROFILE</span><h3>${escapeHtml(person.name)}</h3><span class="employee-id">${person.id}</span><p>${escapeHtml(person.email)}</p><dl><div><dt>Role</dt><dd>${person.role}</dd></div><div><dt>Department</dt><dd>${person.departments.map(departmentName).join(', ')}</dd></div><div><dt>Trainer</dt><dd>${trainer?`${escapeHtml(trainer.name)}<small>${trainer.id}</small>`:'Not assigned'}</dd></div><div><dt>Account</dt><dd>${person.accountStatus}</dd></div></dl></article>`;}));
  document.querySelectorAll('.approve-signoff,.reassess-signoff').forEach(button=>button.addEventListener('click',()=>{const card=button.closest('.review-card'),record=workflowRecords().find(item=>item.id===card.dataset.id),reassess=button.classList.contains('reassess-signoff'),feedback=card.querySelector('.management-feedback').value.trim();if(reassess&&!feedback)return alert('Enter feedback for the trainer before requesting reassessment.');record.status=reassess?'Reassessment Required':'Approved';record.feedback=feedback||'Management approved final competency.';saveState();renderManagementDashboard();}));
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
        <span class="eyebrow">${escapeHtml(departmentName(state.selectedDepartment))}</span>
        <h2>PCA Training Hub</h2>
        <p>Welcome, ${escapeHtml(state.learnerName)}</p>
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
  const rows = activeRecords.map(item => `<tr class="trainee-row" data-search="${escapeHtml((item.name + ' ' + item.id).toLowerCase())}" data-progress="${item.progress === 100 ? 'complete' : 'in-progress'}" data-overdue="${item.overdue}" data-review="${escapeHtml(item.reviewStatus.toLowerCase().replaceAll(' ', '-'))}" data-signoff="${escapeHtml(item.status.toLowerCase().replaceAll(' ', '-'))}"><td><button class="link-button open-profile staff-identity" data-id="${item.id}"><strong>${escapeHtml(item.name)}</strong><small>${item.id}</small></button></td><td>${item.progress}%</td><td>${item.knowledge.at(-1)?.score || 0}%</td><td><span class="status-chip status-${statusTone(item.status)}">${item.status}</span></td><td>${item.overdue ? '<span class="status-chip status-danger">Overdue</span>' : 'On track'}</td></tr>`).join("");
  renderShell(`
    <section class="dashboard-hero trainer-hero" id="home"><div class="dashboard-welcome"><span class="eyebrow">${escapeHtml(departmentName(state.selectedDepartment))}</span><h2>${roleLabel} Trainer Workspace</h2><p>Monitor progress, record observations and recommend sign-off.</p></div><div class="trainer-identity"><span>Assigned departments</span><strong>${assigned.length}</strong></div></section>
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
  document.getElementById("profilePanel").innerHTML = `<section class="card trainee-profile" id="reports"><div class="section-heading"><div><span class="eyebrow">TRAINEE PROFILE</span><h3>${escapeHtml(record.name)}</h3><span class="employee-id">${escapeHtml(record.id)}</span><p>${record.role} · ${escapeHtml(departmentName(record.department))}</p></div><span class="status-chip status-${statusTone(record.status)}">${record.status}</span></div><div class="profile-grid"><div><h4>Modules</h4><strong>${record.modules.completed.length} completed · ${record.modules.remaining.length} remaining</strong><p>${escapeHtml(record.modules.remaining.join(", ") || "All required modules completed")}</p></div><div><h4>Knowledge checks</h4>${record.knowledge.map(k => `<p>${escapeHtml(k.module)} <strong>${k.score}%</strong></p>`).join("")}</div><div><h4>Practical observations</h4>${record.observations.map(o => `<p><strong>${escapeHtml(o.result)}</strong> · ${escapeHtml(o.date)}<br>${escapeHtml(o.note)}</p>`).join("") || '<p>No observation recorded.</p>'}</div><div><h4>Trainer / Management feedback</h4><p class="${record.status === 'Reassessment Required' ? 'alert-text' : ''}">${escapeHtml(record.feedback || "No feedback yet.")}</p></div></div><label>Assessment observation<textarea id="assessmentNote" placeholder="Record observable competency evidence"></textarea></label><div class="profile-actions"><button class="btn" id="recordObservation">Record observation</button><button class="btn" id="recommendSignoff" ${record.progress < 100 || !['Ready for Trainer Review','Reassessment Required'].includes(record.status) ? 'disabled' : ''}>Submit recommendation</button></div><h4>Activity history</h4><ol class="activity-history">${history}</ol></section>`;
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

async function bootstrap() {
  if (!globalThis.SkillWardServices) return state.currentUser ? routeSignedInUser() : renderLogin();
  authService = new globalThis.SkillWardServices.AuthService();
  const recovery = globalThis.SkillWardRecovery.parseRecoveryCallback(globalThis.location.href);
  if (recovery.requested) return processRecoveryCallback(recovery);
  if (globalThis.SkillWardRecovery.isRecoveryPending(sessionStorage)) {
    const session = await authService.recoverySession();
    if (session?.user) return renderPasswordUpdate();
    globalThis.SkillWardRecovery.clearRecoveryPending(sessionStorage);
    return renderRecoveryInvalid();
  }
  if (state.currentUser?.mode === "demo" || (state.currentUser && !state.currentUser.mode)) return routeSignedInUser();
  renderShell('<section class="card"><h2>Loading SkillWard…</h2><p>Resolving your secure session and workplace access.</p></section>');
  authService.onChange((event) => { if (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED" && !authenticatedContext) { authenticatedContext = null; renderLogin("Your session has expired. Please sign in again."); } });
  try { authenticatedContext = await authService.restore(state.activeOrganizationId); if (authenticatedContext) { state.activeOrganizationId = authenticatedContext.organization?.id || null; saveState(); return renderAuthenticatedWorkspace(); } } catch (error) { await authService.signOut(); return renderLogin(authMessage(error.message)); }
  renderLogin();
}
async function processRecoveryCallback(recovery) {
  renderShell('<section class="card recovery-card"><h2>Opening your secure recovery link…</h2><p>Please wait while SkillWard verifies the link.</p></section>');
  try {
    await authService.establishRecovery(recovery);
    globalThis.SkillWardRecovery.markRecoveryPending(sessionStorage);
    history.replaceState({}, "", location.pathname);
    renderPasswordUpdate();
  } catch {
    renderRecoveryInvalid();
  }
}
function renderRecoveryInvalid() {
  renderShell('<section class="card recovery-card"><h2>Recovery link unavailable</h2><p class="auth-status" role="alert">This recovery link is invalid, expired or has already been used.</p><button class="btn" id="requestRecovery">Request another recovery email</button></section>');
  document.getElementById("requestRecovery").addEventListener("click", () => { renderLogin(); document.getElementById("getStartedBtn").click(); document.getElementById("selectHospital").click(); document.getElementById("showSignIn").click(); document.getElementById("forgotPassword").click(); });
}
function renderPasswordUpdate() {
  renderShell(`<section class="card recovery-card"><h2>Create new password</h2><p>Use at least 12 characters with upper-case, lower-case and a number.</p><form id="updatePasswordForm"><label><span>New password</span><span class="password-control"><input id="newPassword" type="password" autocomplete="new-password" minlength="12" required><button class="link-button password-toggle" type="button" data-for="newPassword">Show</button></span></label><label><span>Confirm new password</span><span class="password-control"><input id="confirmPassword" type="password" autocomplete="new-password" minlength="12" required><button class="link-button password-toggle" type="button" data-for="confirmPassword">Show</button></span></label><p id="recoveryError" class="auth-status" role="alert"></p><button class="btn" type="submit">Save new password</button></form></section>`);
  document.querySelectorAll(".password-toggle").forEach(button => button.addEventListener("click", () => { const input=document.getElementById(button.dataset.for), showing=input.type==="text"; input.type=showing?"password":"text"; button.textContent=showing?"Show":"Hide"; }));
  document.getElementById("updatePasswordForm").addEventListener("submit", async event => { event.preventDefault(); const password=document.getElementById("newPassword").value, confirmation=document.getElementById("confirmPassword").value, error=document.getElementById("recoveryError"), button=event.currentTarget.querySelector("button[type=submit]"); if(password.length<12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || password!==confirmation){ error.textContent="Use at least 12 characters with upper-case, lower-case and a number, and make both entries match."; return; } button.disabled=true; try { await authService.updatePassword(password); globalThis.SkillWardRecovery.clearRecoveryPending(sessionStorage); await authService.signOut(); renderLogin("Password updated successfully. Sign in with your new password."); } catch { error.textContent=authMessage("RECOVERY_INVALID"); button.disabled=false; } });
}
bootstrap();
