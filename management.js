(function (root) {
  const ACCOUNT_STATUSES = ["Invited", "Active", "Suspended", "Archived"];
  const EMPLOYMENT_STATUSES = ["New Starter", "Active", "On Leave", "Transferred", "Former Staff"];
  const STAFF_ROLES = ["PCA", "Cleaner", "PCA Trainer", "Cleaner Trainer"];
  const clone = value => JSON.parse(JSON.stringify(value));
  const now = () => new Date().toISOString();

  function createStore(seed) {
    const data = clone(seed);
    const actorCanAccess = (actor, department) => actor.level === "Hospital Administrator" || (actor.level === "Department Manager" && actor.departments.includes(department));
    const person = id => data.staff.find(item => item.id === id) || data.managers.find(item => item.id === id);
    const record = (actor, action, target, previousValue, newValue, department, reason = "") => {
      const entry = { id: `AUD-${data.audit.length + 1}`, actor: actor.name, actorRole: actor.level, action, staffId: target.id, staffName: target.name, previousValue, newValue, at: now(), department, reason };
      data.audit.unshift(entry); return entry;
    };
    const notify = (staffId, type, message) => data.notifications.unshift({ id: `NOT-${data.notifications.length + 1}`, staffId, type, message, at: now(), read: false });
    const requireAccess = (actor, target, destination) => {
      const departments = [...(target.departments || []), ...(destination ? [destination] : [])];
      if (!departments.every(id => actorCanAccess(actor, id))) throw new Error("You do not have access to this department.");
      if (actor.level === "Department Manager" && !STAFF_ROLES.includes(target.role)) throw new Error("Department Managers cannot manage hospital administrators.");
    };
    const activeAdmins = () => data.managers.filter(item => item.level === "Hospital Administrator" && item.accountStatus === "Active");
    const protectFinalAdmin = (target, nextStatus, nextLevel = target.level) => {
      if (target.level === "Hospital Administrator" && target.accountStatus === "Active" && (nextStatus !== "Active" || nextLevel !== "Hospital Administrator") && activeAdmins().length === 1) throw new Error("A hospital must retain at least one active Hospital Administrator.");
    };
    const trainerLoad = id => data.staff.filter(item => item.trainerId === id && item.accountStatus === "Active").length;
    const trainerCapacity = id => ({ active: trainerLoad(id), capacity: data.trainerCapacity, atCapacity: trainerLoad(id) >= data.trainerCapacity });
    function setAccountStatus(actor, id, status, reason = "") {
      if (!ACCOUNT_STATUSES.includes(status)) throw new Error("Invalid account status.");
      const target = person(id); if (!target) throw new Error("Staff member not found."); requireAccess(actor, target);
      if (target.level) protectFinalAdmin(target, status);
      if (target.accountStatus === "Archived" && status === "Active") throw new Error("Archived records cannot be reactivated through the normal interface.");
      const previous = target.accountStatus; target.accountStatus = status; record(actor, status === "Active" ? "Reactivated account" : `${status} account`, target, previous, status, target.departments?.[0], reason); notify(id, `Account ${status.toLowerCase()}`, `Your SkillWard account is ${status.toLowerCase()}.`); return target;
    }
    function assignTrainer(actor, staffId, trainerId, confirmCapacity = false) {
      const target = person(staffId), trainer = person(trainerId); if (!target || !trainer) throw new Error("Staff member or trainer not found."); requireAccess(actor, target);
      const required = target.role === "PCA" ? "PCA Trainer" : target.role === "Cleaner" ? "Cleaner Trainer" : null;
      if (!required || trainer.role !== required || !target.departments.some(id => trainer.departments.includes(id))) throw new Error("Choose a compatible trainer in the assigned department.");
      const capacity = trainerCapacity(trainerId); if (capacity.atCapacity && !confirmCapacity) return { requiresConfirmation: true, capacity };
      const previous = target.trainerId; target.trainerId = trainerId; record(actor, "Assigned trainer", target, previous, trainerId, target.departments[0]); notify(staffId, "Trainer assignment", `${trainer.name} is your assigned trainer.`); return { target, capacity: trainerCapacity(trainerId) };
    }
    function assignDepartments(actor, staffId, departments) {
      const target = person(staffId);
      if (!target || !STAFF_ROLES.includes(target.role)) throw new Error("Staff member not found.");
      const next = [...new Set(departments)].filter(Boolean);
      if (!next.length) throw new Error("Choose at least one department.");
      next.forEach(department => requireAccess(actor, target, department));
      if (!["PCA Trainer", "Cleaner Trainer"].includes(target.role) && next.length > 1) throw new Error("Staff members can have one assigned department.");
      const previous = [...target.departments];
      target.departments = next;
      if (["PCA", "Cleaner"].includes(target.role) && target.trainerId) {
        const trainer = person(target.trainerId);
        if (!trainer || !next.some(id => trainer.departments.includes(id))) target.trainerId = null;
      }
      record(actor, "Assigned department", target, previous, next, next[0]);
      notify(staffId, "Department assignment", `Your department assignment is ${next.join(", ")}.`);
      return target;
    }
    function transfer(actor, staffId, destination, trainerId, reason) {
      const target = person(staffId); if (!target) throw new Error("Staff member not found."); requireAccess(actor, target, destination);
      const previous = { department: target.departments[0], trainer: target.trainerId, manager: target.managerId };
      target.departments = [destination]; target.employmentStatus = "Transferred";
      if (["PCA", "Cleaner"].includes(target.role)) { const result = assignTrainer(actor, staffId, trainerId, true); if (result.requiresConfirmation) throw new Error("Trainer capacity confirmation required."); }
      const nextManager = data.managers.find(item => item.level === "Department Manager" && item.departments.includes(destination)); target.managerId = nextManager?.id || target.managerId;
      record(actor, "Transferred staff", target, previous, { department: destination, trainer: target.trainerId, manager: target.managerId }, destination, reason); notify(staffId, "Department transfer", `Transferred to ${destination}. Completed training records were preserved.`); return target;
    }
    function assignPathway(actor, staffId, pathway, dueDate, renewalDate = null) {
      const target = person(staffId); requireAccess(actor, target); const assignment = { id: `ASN-${data.assignments.length + 1}`, staffId, pathway, assignedDate: now().slice(0, 10), dueDate, assignedBy: actor.name, progress: 0, trainerReviewStatus: "Pending", managementApprovalStatus: "Pending", renewalDate };
      data.assignments.push(assignment); record(actor, "Assigned training pathway", target, null, assignment, target.departments[0]); notify(staffId, "New training pathway", `${pathway} is due ${dueDate}.`); return assignment;
    }
    function refreshReassessments(today = now().slice(0, 10)) { data.assignments.forEach(a => { if (a.renewalDate && a.renewalDate < today && a.managementApprovalStatus === "Approved") { const target = person(a.staffId); a.managementApprovalStatus = "Reassessment Required"; target.competencyStatus = "Reassessment Required"; record({ name: "SkillWard", level: "System" }, "Competency expired", target, "Approved", "Reassessment Required", target.departments[0]); notify(target.id, "Reassessment required", `${a.pathway} requires reassessment.`); } }); }
    function bulk(actor, ids, change, confirmed = false) { if (!confirmed) return { requiresConfirmation: true, count: ids.length, change }; return ids.map(id => { const target = person(id); requireAccess(actor, target, change.department); if (change.department) target.departments = [change.department]; if (change.trainerId) assignTrainer(actor, id, change.trainerId, true); if (change.pathway) assignPathway(actor, id, change.pathway, change.dueDate); if (change.accountStatus) setAccountStatus(actor, id, change.accountStatus); record(actor, "Bulk assignment", target, null, change, target.departments[0]); return target; }); }
    function invite(actor, profile) { if (actor.level === "Department Manager" && !STAFF_ROLES.includes(profile.role)) throw new Error("Department Managers may only invite staff and trainers."); const target = { ...profile, accountStatus: "Invited", progress: 0, competencyStatus: "Not Started", departments: profile.departments || [] }; requireAccess(actor, target); data.staff.push(target); record(actor, "Invited staff", target, null, "Invited", target.departments[0]); notify(target.id, "Account invitation", "Your SkillWard invitation is awaiting activation."); return target; }
    return { data, actorCanAccess, activeAdmins, protectFinalAdmin, trainerCapacity, setAccountStatus, assignDepartments, assignTrainer, transfer, assignPathway, refreshReassessments, bulk, invite, ACCOUNT_STATUSES, EMPLOYMENT_STATUSES };
  }
  root.SkillWardManagement = { createStore };
})(typeof window === "undefined" ? globalThis : window);
