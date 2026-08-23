(() => {
  const header = document.querySelector("[data-public-header]");
  const toggle = header?.querySelector(".menu-toggle");
  const navigation = header?.querySelector(".public-navigation");
  const closeMenu = () => { navigation?.classList.remove("is-open"); toggle?.setAttribute("aria-expanded", "false"); document.body.style.overflow = ""; };
  toggle?.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    navigation.classList.toggle("is-open", open);
    document.body.style.overflow = open ? "hidden" : "";
    if (open) navigation.querySelector("a")?.focus();
  });
  navigation?.addEventListener("click", event => { if (event.target.closest("a")) closeMenu(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") { closeMenu(); toggle?.focus(); } });
  matchMedia("(min-width: 801px)").addEventListener?.("change", event => { if (event.matches) closeMenu(); });

  const roleContent = {
    workers: ["Workers", "Know exactly what is assigned, what is complete and what must be demonstrated next.", ["Assigned learning", "Clear progress", "Knowledge checks", "Personal competency status"]],
    trainers: ["Trainers", "Focus on assigned trainees and practical evidence without changing approved clinical content.", ["Assigned trainees", "Assessment requests", "Competency checklists", "Recommendations and reassessment"]],
    managers: ["Managers", "See deadlines, evidence and decisions across authorised departments.", ["Training deadlines", "Pending approvals", "Overdue requirements", "Department performance", "Competency visibility"]],
    educators: ["Educators & Content Administrators", "Guide local content from a controlled draft through clinical review and publication.", ["SkillWard templates · In development", "Pathway authoring · In development", "Clinical review · In development", "Approval and publishing · In development", "Version history · In development"]],
    administrators: ["Organisation Administrators", "Configure a private organisation workspace and control who can access each facility and department.", ["Organisations and facilities", "Departments", "Roles and invitations", "Access controls", "Audit history", "Reporting"]]
  };
  const panel = document.querySelector("#role-panel");
  const renderRole = key => {
    if (!panel || !roleContent[key]) return;
    const [title, description, features] = roleContent[key];
    panel.innerHTML = `<div><p class="public-eyebrow">ROLE WORKSPACE</p><h3>${title}</h3><p>${description}</p></div><ul>${features.map(feature => `<li class="${feature.includes("In development") ? "development" : ""}">${feature.replace(" · In development", "")}</li>`).join("")}</ul>`;
  };
  const tabs = [...document.querySelectorAll("[data-role-tab]")];
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => { tabs.forEach(item => item.setAttribute("aria-selected", String(item === tab))); renderRole(tab.dataset.roleTab); });
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const next = (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus(); tabs[next].click();
    });
  });
  renderRole("workers");

  const form = document.querySelector("#demo-request-form");
  const formStatus = document.querySelector("#demo-form-status");
  const config = window.SKILLWARD_CONFIG || {};
  if (form) form.dataset.startedAt = String(Date.now());
  const setStatus = (message, error = false) => { if (formStatus) { formStatus.textContent = message; formStatus.setAttribute("role", error ? "alert" : "status"); } };
  form?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const submit = form.querySelector("button[type=submit]");
    if (!config.supabaseUrl || !config.supabaseAnonKey) { setStatus("Demo requests are not available in this preview. Please use the Contact & Support page.", true); return; }
    submit.disabled = true; setStatus("Sending your request securely…");
    const values = { ...Object.fromEntries(new FormData(form)), formStartedAt:form.dataset.startedAt };
    try {
      const response = await fetch(`${config.supabaseUrl}/functions/v1/request-demo`, { method:"POST", headers:{ "Content-Type":"application/json", apikey:config.supabaseAnonKey, Authorization:`Bearer ${config.supabaseAnonKey}` }, body:JSON.stringify(values) });
      if (!response.ok) throw new Error("REQUEST_FAILED");
      form.reset(); setStatus("Thank you. Your request has been received securely and the SkillWard team will follow up.");
    } catch { setStatus("We could not send your request. Please try again later or use Contact & Support.", true); }
    finally { submit.disabled = false; }
  });

  const requestedInterest = new URLSearchParams(location.search).get("interest");
  if (requestedInterest === "pilot") document.querySelector("#primary-interest")?.querySelector('option[value="Pilot partnership"]')?.setAttribute("selected", "selected");
})();
