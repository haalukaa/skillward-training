(() => {
  "use strict";
  const allowedHosts = new Set(["control.skillwardtraining.com", "127.0.0.1", "localhost"]);
  const byId = id => document.getElementById(id);
  const access = byId("access-boundary"), plane = byId("control-plane"), accessMessage = byId("access-message"), controlMessage = byId("control-message");
  const state = { snapshot: null, authorization: null, factorId: null, email: "", action: null, support: null, idleTimer: null };
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const formatNumber = value => new Intl.NumberFormat("en-AU").format(Number(value || 0));
  const formatDate = value => value ? new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(new Date(value)) : "—";
  const message = (target, value, good = false) => { target.textContent = value || ""; target.style.color = good ? "var(--brand)" : "var(--danger)"; };
  const can = permission => state.authorization?.permissions?.includes(permission);
  const safeError = error => {
    const code = error?.context?.body?.error || error?.message || "SERVICE_UNAVAILABLE";
    const labels = { AUTHENTICATION_REQUIRED: "Sign in is required.", STRONG_MFA_REQUIRED: "Verified MFA is required.", ACCESS_DENIED: "Access is not authorised.", RATE_LIMITED: "Too many attempts. Wait one minute and try again.", CONTROL_RECENT_AUTH_REQUIRED: "Recent password and MFA verification is required.", CONTROL_REASON_REQUIRED: "Provide a written reason of at least 12 characters.", CONTROL_CONFIRMATION_REQUIRED: "The typed confirmation did not match.", INVALID_LIFECYCLE_TRANSITION: "That lifecycle transition is not permitted.", LAST_OWNER_PROTECTED: "The final active Owner cannot be changed or deactivated.", CLINICAL_REVIEW_REQUIRED: "Approved or published content requires a clinical reviewer." };
    return labels[code] || "The protected operation could not be completed.";
  };

  if (!allowedHosts.has(location.hostname)) {
    byId("sign-in-form").remove();
    message(accessMessage, "This resource is not available.");
    return;
  }

  async function prepareMfa() {
    const assurance = await window.SkillWardControl.assurance();
    if (assurance.error) throw assurance.error;
    if (assurance.data.currentLevel === "aal2") return openControlPlane();
    const factors = await window.SkillWardControl.factors();
    if (factors.error) throw factors.error;
    const verified = factors.data.totp.find(factor => factor.status === "verified");
    if (verified) state.factorId = verified.id;
    else {
      const enrollment = await window.SkillWardControl.enrollTotp();
      if (enrollment.error) throw enrollment.error;
      state.factorId = enrollment.data.id;
      byId("mfa-enrollment").classList.remove("hidden");
      byId("mfa-qr").src = enrollment.data.totp.qr_code;
      byId("mfa-secret").textContent = enrollment.data.totp.secret;
    }
    byId("sign-in-form").classList.add("hidden");
    byId("mfa-form").classList.remove("hidden");
    byId("mfa-code").focus();
    message(accessMessage, "Enter the six-digit code from your authenticator app.", true);
  }

  byId("sign-in-form").addEventListener("submit", async event => {
    event.preventDefault(); message(accessMessage, "Checking secure access…", true);
    state.email = byId("email").value.trim().toLowerCase();
    const result = await window.SkillWardControl.signIn(state.email, byId("password").value);
    byId("password").value = "";
    if (result.error) return message(accessMessage, "Access could not be verified.");
    try { await prepareMfa(); } catch (error) { message(accessMessage, safeError(error)); }
  });

  byId("mfa-form").addEventListener("submit", async event => {
    event.preventDefault(); message(accessMessage, "Verifying strong authentication…", true);
    const result = await window.SkillWardControl.verifyTotp(state.factorId, byId("mfa-code").value);
    byId("mfa-code").value = "";
    if (result.error) return message(accessMessage, "The code was not accepted.");
    await openControlPlane();
  });

  async function openControlPlane() {
    message(accessMessage, "Authorising internal role…", true);
    const result = await window.SkillWardControl.invoke({ operation: "snapshot" });
    if (result.error || result.data?.error) {
      await window.SkillWardControl.signOut();
      byId("mfa-form").classList.add("hidden"); byId("sign-in-form").classList.remove("hidden");
      return message(accessMessage, "Access is not authorised.");
    }
    state.authorization = result.data.authorization; state.snapshot = result.data.data;
    access.classList.add("hidden"); plane.classList.remove("hidden");
    byId("role-badge").textContent = state.authorization.role;
    render(); resetIdle();
  }

  async function refresh() {
    message(controlMessage, "Refreshing protected summaries…", true);
    const result = await window.SkillWardControl.invoke({ operation: "snapshot" });
    if (result.error || result.data?.error) return message(controlMessage, safeError(result.error || result.data));
    state.authorization = result.data.authorization; state.snapshot = result.data.data; render(); message(controlMessage, "Updated just now.", true);
  }

  function render() {
    const data = state.snapshot || {}, metrics = data.metrics || {};
    const metricLabels = { organizations: "Organisations", active_organizations: "Active organisations", suspended_organizations: "Suspended", expiring_pilots: "Pilots expiring", expiring_grace_periods: "Grace periods expiring", users: "User accounts", active_memberships: "Active memberships", facilities: "Facilities", departments: "Departments", assignments: "Assignments", competencies: "Competencies", overdue_renewals: "Overdue renewals", open_support: "Open support", failed_jobs: "Failed jobs", security_alerts: "Security alerts", overdue_invoices: "Overdue invoices", storage_bytes: "Storage bytes", revenue_indicators: "Paid revenue indicator" };
    byId("metric-grid").innerHTML = Object.entries(metricLabels).map(([key, label]) => `<article class="metric"><span>${esc(label)}</span><strong>${formatNumber(metrics[key])}</strong></article>`).join("");
    byId("analytics-grid").innerHTML = ["organizations", "active_memberships", "assignments", "competencies", "overdue_renewals", "open_support"].map(key => `<article class="metric"><span>${esc(metricLabels[key])}</span><strong>${formatNumber(metrics[key])}</strong></article>`).join("");
    const health = data.health || [];
    byId("attention-list").innerHTML = health.length ? health.slice(0, 5).map(item => listItem(item.component, item.summary, item.severity)).join("") : listItem("No active platform events", "Health records will appear when a verified monitor reports them.", "Clear");
    const risk = data.recent_high_risk || [];
    byId("risk-list").innerHTML = risk.length ? risk.map(item => listItem(item.action, `${item.actor_role || "Internal administrator"} · ${formatDate(item.occurred_at)}`, item.risk_level)).join("") : listItem("No high-risk activity", "No protected changes are recorded in this view.", "Clear");
    byId("health-list").innerHTML = health.length ? health.map(item => listItem(item.component, `${item.summary} · ${formatDate(item.observed_at)}`, item.status)).join("") : listItem("Monitoring boundary ready", "Connect an approved provider to populate verified availability, delivery, storage and job signals.", "Setup required");
    const administrators = data.administrators || [];
    byId("security-list").innerHTML = administrators.map(item => listItem(`Administrator ${String(item.user_id).slice(0, 8)}`, `${item.platform_role} · MFA mandatory`, item.is_active ? "Active" : "Inactive")).join("") + (risk.length ? risk.map(item => listItem(item.action, `${item.reason || "Reason protected"} · ${formatDate(item.occurred_at)}`, item.risk_level)).join("") : listItem("Immutable audit enabled", "High-risk operations require AAL2, recent authentication, reason and confirmation.", "Protected"));
    renderOrganisations(data.organizations || []); renderPlans(data.plans || []); renderOnboarding(data.onboarding || []);
    const releases = data.releases || [];
    byId("release-list").innerHTML = releases.length ? releases.map(item => listItem(item.release_marker, `${item.commit_sha.slice(0, 12)} · ${item.release_ring}`, item.validation_status)).join("") : listItem("No release record", "A validated release must be recorded before ring expansion.", "Pending");
    const flags = data.feature_flags || []; byId("feature-list").innerHTML = flags.length ? flags.map(item => listItem(item.flag_key, `${item.scope_kind}: ${item.scope_value} · ${item.reason}`, item.enabled ? "Enabled" : "Disabled")).join("") : listItem("No control-plane feature scopes", "Unfinished features remain unavailable until explicitly validated.", "Safe default");
    byId("release-marker").textContent = releases[0]?.release_marker || "Release not recorded";
    const recovery = data.recovery;
    byId("recovery-card").innerHTML = recovery ? `<h3>Latest recovery record</h3><p><strong>${esc(recovery.backup_status)}</strong> · ${esc(recovery.backup_method || "Method not recorded")}</p><p>Migration ${esc(recovery.migration_version || "—")} · RTO ${esc(recovery.rto_minutes || "—")} min · RPO ${esc(recovery.rpo_minutes || "—")} min</p>` : `<h3>External verification required</h3><p>Backup status has not yet been confirmed by an approved recovery owner.</p>`;
    byId("incident-list").innerHTML = (data.incidents || []).length ? data.incidents.map(item => listItem(item.title, item.summary, `${item.severity} · ${item.status}`)).join("") : listItem("No open incidents", "Verified incidents and timelines will appear here.", "Clear");
    const commercial = data.commercial || []; byId("commercial-list").innerHTML = commercial.length ? commercial.map(item => listItem(item.legal_name, `${item.plan_key || "No plan"} · renewal ${formatDate(item.renewal_on)} · invoice ${item.invoice_reference || "not recorded"}`, item.billing_status)).join("") : listItem("No commercial records", "Record approved terms without initiating an automatic financial action.", "Safe default");
    const templates = data.templates || []; byId("template-list").innerHTML = templates.length ? templates.map(item => listItem(`${item.template_key} v${item.version}`, `${item.sector} · ${item.change_summary}`, item.lifecycle_status)).join("") : listItem("No governed template versions", "Draft content is never represented as clinically approved training.", "Not published");
    const offboarding = data.offboarding || []; byId("offboarding-list").innerHTML = offboarding.length ? offboarding.map(item => listItem(`Case ${String(item.id).slice(0, 8)}`, `Export ${item.export_status} · deletion review ${formatDate(item.deletion_review_at)}`, item.status)).join("") : listItem("No controlled offboarding cases", "No customer deletion has been scheduled.", "Clear");
    applyPermissions();
  }

  function listItem(title, detail, badge) { return `<div class="list-item"><div><strong>${esc(title)}</strong><p>${esc(detail)}</p></div><span class="badge">${esc(badge)}</span></div>`; }
  function renderOrganisations(organisations) {
    byId("organisation-rows").innerHTML = organisations.length ? organisations.map(org => `<tr><td><strong>${esc(org.name)}</strong></td><td>${esc(org.sector || "Unassigned")}</td><td><span class="badge">${esc(org.status)}</span></td><td>${esc(org.plan)}</td><td>${formatDate(org.pilot_expires_at)}</td><td>${can("organizations.write") ? `<button data-org-action="${esc(org.id)}" data-org-name="${esc(org.name)}">Manage</button>` : "Read only"}</td></tr>`).join("") : `<tr><td colspan="6">No organisations are available.</td></tr>`;
    byId("support-organisation").innerHTML = `<option value="">Choose organisation</option>${organisations.map(org => `<option value="${esc(org.id)}">${esc(org.name)}</option>`).join("")}`;
    document.querySelectorAll("[data-org-action]").forEach(button => button.addEventListener("click", () => openDialog("transition_organization", { organization_id: button.dataset.orgAction, name: button.dataset.orgName })));
  }
  function renderPlans(plans) { byId("plan-grid").innerHTML = plans.map(plan => `<article><h3>${esc(plan.plan_key)}</h3><p>${esc(plan.support_level)} support</p><dl><dt>User limit</dt><dd>${plan.limits.users === -1 ? "Custom" : formatNumber(plan.limits.users)}</dd><dt>Storage</dt><dd>${plan.limits.storage_gb === -1 ? "Custom" : `${formatNumber(plan.limits.storage_gb)} GB`}</dd><dt>Integrations</dt><dd>${plan.entitlements.integrations ? "Included" : "Not included"}</dd></dl></article>`).join(""); }
  function renderOnboarding(rows) { byId("onboarding-grid").innerHTML = rows.length ? rows.map(row => { const percent = row.total ? Math.round(row.complete / row.total * 100) : 0; return `<article><h3>Organisation ${esc(String(row.organization_id).slice(0, 8))}</h3><p><strong>${percent}% complete</strong></p><progress value="${percent}" max="100">${percent}%</progress><p>${formatNumber(row.blocked)} blocked · ${formatNumber(row.total - row.complete)} remaining</p></article>`; }).join("") : `<div class="empty-state">No onboarding checklists are active.</div>`; }
  function applyPermissions() {
    const requirements = { organisations: "organizations.read", plans: "plans.read", commercial: "billing.read", onboarding: "onboarding.read", support: "support.read", health: "health.read", security: "security.read", templates: "content.read", releases: "release.read", recovery: "recovery.read", offboarding: "exports.read", incidents: "support.read", analytics: "analytics.read" };
    Object.entries(requirements).forEach(([section, permission]) => { const button = document.querySelector(`[data-section="${section}"]`); if (button) button.hidden = !can(permission); });
    const create = document.querySelector('[data-open-dialog="create-organisation"]'); if (create) create.hidden = !can("organizations.write");
    const actionPermissions = { save_commercial: "billing.write", create_admin: "administrators.write", govern_template: "content.write", set_feature_flag: "release.write", record_recovery: "recovery.write", start_offboarding: "exports.write", create_support_case: "support.write", create_incident: "security.write" };
    Object.entries(actionPermissions).forEach(([action, permission]) => { const button = document.querySelector(`[data-open-dialog="${action}"]`); if (button) button.hidden = !can(permission); });
  }

  const dialog = byId("action-dialog");
  function openDialog(action, context = {}) {
    state.action = { action, context };
    const orgOptions = (state.snapshot?.organizations || []).map(org => `<option value="${esc(org.id)}">${esc(org.name)}</option>`).join("");
    const definitions = {
      create_organization: { title: "Create organisation", impact: "Creates a protected organisation record and mandatory onboarding checklist. No customer data is imported.", fields: `<label>Organisation name<input name="name" required maxlength="160"></label><label>URL slug<input name="slug" required pattern="[a-z0-9-]+"></label><label>Legal name<input name="legal_name" maxlength="160"></label><label>Sector<select name="sector"><option>Hospital</option><option>Aged Care</option><option>Disability Support</option></select></label><label>Pilot days<input name="pilot_days" type="number" min="1" max="180" value="30"></label><label><input name="is_fictional" type="checkbox"> Clearly fictional QA organisation</label>` },
      transition_organization: { title: `Change ${context.name || "organisation"} status`, impact: "Suspension immediately blocks active memberships without deleting data. Archived and offboarding stages remain recoverable and audited.", fields: `<input type="hidden" name="organization_id" value="${esc(context.organization_id)}"><label>New lifecycle status<select name="status"><option>setup</option><option>pilot</option><option>active</option><option>grace_period</option><option>suspended</option><option>archived</option><option>offboarded</option></select></label>` },
      save_commercial: { title: "Record commercial terms", impact: "Records approved terms only. This does not charge a customer, issue an invoice or contact a payment provider.", fields: `<label>Organisation<select name="organization_id" required>${orgOptions}</select></label><label>Legal name<input name="legal_name" required></label><label>Trading name<input name="trading_name"></label><label>Business identifier<input name="business_identifier"></label><label>Plan<select name="plan"><option>Pilot</option><option>Small</option><option>Medium</option><option>Large</option><option>Enterprise</option></select></label><label>Billing state<select name="billing_status"><option>draft</option><option>invoiced</option><option>paid</option><option>overdue</option><option>grace_period</option><option>restricted</option></select></label><label>Approved price amount<input name="pricing_amount" type="number" min="0" step="0.01"></label>` },
      create_admin: { title: "Add internal administrator", impact: "The account must already exist. MFA is mandatory and permissions are limited to the selected internal role.", fields: `<label>User ID<input name="target_user_id" required pattern="[0-9a-fA-F-]{36}"></label><label>Platform role<select name="platform_role"><option>Security Administrator</option><option>Operations Administrator</option><option>Customer Support</option><option>Finance</option><option>Content Administrator</option><option>Auditor / Read-only</option><option>Owner</option></select></label>` },
      govern_template: { title: "Record governed template version", impact: "Approved or published states require a named clinical reviewer. Existing organisation assignments are never silently changed.", fields: `<label>Template key<input name="template_key" required></label><label>Sector<select name="sector"><option>Hospital</option><option>Aged Care</option><option>Disability Support</option></select></label><label>Version<input name="version" type="number" min="1" required></label><label>Status<select name="status"><option>draft</option><option>clinical_review</option><option>approved</option><option>published</option><option>superseded</option><option>withdrawn</option></select></label><label class="wide">Change summary<textarea name="change_summary" required></textarea></label><label>Clinical reviewer<input name="clinical_reviewer"></label><label>Effective at<input name="effective_at" type="datetime-local"></label>` },
      set_feature_flag: { title: "Change feature flag", impact: "Feature flags control release visibility only; they never bypass authentication, permissions or RLS.", fields: `<label>Feature key<input name="flag_key" required></label><label>Scope<select name="scope_kind"><option>organization</option><option>plan</option><option>sector</option><option>release_ring</option><option>global</option></select></label><label>Scope value<input name="scope_value" value="*" required></label><label><input name="enabled" type="checkbox"> Enable for this scope</label>` },
      record_recovery: { title: "Record verified recovery state", impact: "This records evidence and instructions only. It cannot trigger a database restore.", fields: `<label>Backup status<select name="backup_status"><option>requires_verification</option><option>successful</option><option>failed</option><option>unknown</option></select></label><label>Backup method<input name="backup_method"></label><label>Restore-point reference<input name="restore_point_reference"></label><label>Migration version<input name="migration_version"></label><label>Recovery owner<input name="recovery_owner"></label><label>RTO minutes<input name="rto_minutes" type="number" min="1"></label><label>RPO minutes<input name="rpo_minutes" type="number" min="0"></label><label class="wide">Frontend rollback instructions<textarea name="frontend_rollback"></textarea></label><label class="wide">Edge Function rollback instructions<textarea name="edge_function_rollback"></textarea></label><label class="wide">Database recovery instructions<textarea name="database_recovery"></textarea></label>` },
      start_offboarding: { title: "Start controlled offboarding", impact: "Creates a staged review case. It does not delete data or revoke access automatically.", fields: `<label>Organisation<select name="organization_id" required>${orgOptions}</select></label><label>Deletion review date<input name="deletion_review_at" type="datetime-local"></label><label><input name="legal_hold" type="checkbox"> Legal hold applies</label><label class="wide">Retention requirements<textarea name="retention_requirements" required></textarea></label>` },
      create_support_case: { title: "Create support case", impact: "Records a support request without entering customer data or Support Mode.", fields: `<label>Organisation<select name="organization_id"><option value="">Platform-wide</option>${orgOptions}</select></label><label>Category<input name="category" required></label><label>Severity<select name="severity"><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></label><label>Title<input name="title" required></label><label>Contact reference<input name="contact_reference"></label><label>Communication status<input name="customer_communication_status"></label>` },
      create_incident: { title: "Declare platform incident", impact: "Creates a high-visibility incident timeline. Do not include secrets, tokens or sensitive request bodies.", fields: `<label>Severity<select name="severity"><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></label><label>Title<input name="title" required></label><label class="wide">Safe summary<textarea name="summary" required></textarea></label>` }
    };
    const definition = definitions[action]; if (!definition) return;
    byId("dialog-title").textContent = definition.title; byId("dialog-impact").textContent = definition.impact; byId("dialog-fields").innerHTML = definition.fields;
    byId("action-reason").value = ""; byId("action-confirmation").value = ""; byId("action-password").value = ""; byId("action-mfa").value = ""; byId("confirmation-label").textContent = "CONFIRM";
    dialog.showModal();
  }
  document.querySelectorAll("[data-open-dialog]").forEach(button => button.addEventListener("click", () => openDialog(button.dataset.openDialog === "create-organisation" ? "create_organization" : button.dataset.openDialog)));
  const closeDialog = () => dialog.close(); byId("close-dialog").addEventListener("click", closeDialog); byId("cancel-dialog").addEventListener("click", closeDialog);
  byId("action-form").addEventListener("submit", async event => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    fields.is_fictional = event.currentTarget.elements.is_fictional?.checked || false;
    if (event.currentTarget.elements.enabled) fields.enabled = event.currentTarget.elements.enabled.checked;
    if (event.currentTarget.elements.legal_hold) fields.legal_hold = event.currentTarget.elements.legal_hold.checked;
    if (fields.pricing_amount !== undefined) { fields.pricing = { amount: Number(fields.pricing_amount || 0), currency: "AUD" }; delete fields.pricing_amount; }
    if (state.action.action === "create_incident") fields.affected_organizations = [];
    fields.reason = byId("action-reason").value; fields.confirmation = byId("action-confirmation").value;
    const credentials = { password: byId("action-password").value, code: byId("action-mfa").value };
    delete fields["action-password"]; delete fields["action-mfa"];
    await performAction(state.action.action, fields, true, credentials); dialog.close();
  });

  async function performAction(action, payload, requiresRecentAuth, credentials = {}) {
    if (requiresRecentAuth) {
      if (!credentials.password || !/^[0-9]{6}$/.test(credentials.code || "")) return message(controlMessage, "Password and current MFA code are required.");
      const verified = await window.SkillWardControl.reauthenticate(state.email, credentials.password, credentials.code);
      if (verified.error) return message(controlMessage, "Recent authentication could not be verified.");
    }
    message(controlMessage, "Applying protected action…", true);
    const result = await window.SkillWardControl.invoke({ operation: "action", action, payload });
    if (result.error || result.data?.error) return message(controlMessage, safeError(result.error || result.data));
    message(controlMessage, "Protected action recorded successfully.", true); await refresh();
    return result.data?.data;
  }

  byId("support-form").addEventListener("submit", async event => {
    event.preventDefault();
    const org = byId("support-organisation");
    const result = await performAction("start_support_mode", { organization_id: org.value, minutes: byId("support-duration").value, reason: byId("support-reason").value, confirmation: "CONFIRM" }, true, { password: byId("support-password").value, code: byId("support-mfa").value });
    byId("support-password").value = ""; byId("support-mfa").value = "";
    if (result?.id) { state.support = { id: result.id, organization: org.options[org.selectedIndex].text, expires: Date.now() + Number(byId("support-duration").value) * 60000 }; renderSupportBanner(); }
  });
  function renderSupportBanner() { const banner = byId("support-banner"); if (!state.support || state.support.expires <= Date.now()) { state.support = null; banner.classList.add("hidden"); return; } banner.classList.remove("hidden"); byId("support-banner-text").textContent = `Read-only access to ${state.support.organization} · automatically expires ${new Date(state.support.expires).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}`; }
  byId("exit-support").addEventListener("click", async () => { const support = state.support; if (!support) return; await performAction("end_support_mode", { support_session_id: support.id }, false); state.support = null; renderSupportBanner(); });

  document.querySelectorAll("[data-section]").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll("[data-section]").forEach(item => item.classList.toggle("active", item === button));
    document.querySelectorAll(".panel-section").forEach(section => section.classList.toggle("active", section.id === `section-${button.dataset.section}`));
    byId("section-title").textContent = button.textContent; byId("control-nav").classList.remove("open"); byId("menu-button").setAttribute("aria-expanded", "false"); byId("main").focus();
    if (state.support) window.SkillWardControl.invoke({ operation: "action", action: "record_support_page", payload: { support_session_id: state.support.id, path: button.dataset.section } });
  }));
  byId("menu-button").addEventListener("click", () => { const open = byId("control-nav").classList.toggle("open"); byId("menu-button").setAttribute("aria-expanded", String(open)); });
  byId("refresh").addEventListener("click", refresh);
  async function signOut(reason = "") { clearTimeout(state.idleTimer); await window.SkillWardControl.signOut(); plane.classList.add("hidden"); access.classList.remove("hidden"); byId("mfa-form").classList.add("hidden"); byId("sign-in-form").classList.remove("hidden"); message(accessMessage, reason); }
  byId("sign-out").addEventListener("click", () => signOut("Signed out securely."));
  function resetIdle() { clearTimeout(state.idleTimer); state.idleTimer = setTimeout(() => signOut("Your control-plane session expired after 20 minutes of inactivity."), 20 * 60 * 1000); }
  ["pointerdown", "keydown", "touchstart"].forEach(name => document.addEventListener(name, () => plane.classList.contains("hidden") || resetIdle(), { passive: true }));
  setInterval(renderSupportBanner, 30000);
  window.SkillWardControl.session().then(session => { if (session) { state.email = session.user.email || ""; prepareMfa().catch(() => signOut("Access could not be verified.")); } });
})();
