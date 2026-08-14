/** RLS-protected database boundary for authenticated workspaces. */
export class SkillWardDatabaseService {
  constructor(client) { this.client = client; }

  contextError(error) {
    const permissionDenied = error?.code === "42501" || /permission denied/i.test(error?.message || "");
    const development = ["localhost", "127.0.0.1"].includes(globalThis.location?.hostname);
    if (permissionDenied && development) {
      console.warn("SkillWard development diagnostic: authenticated table privilege missing.");
      return new Error("CONTEXT_TABLE_PERMISSION");
    }
    return new Error("CONTEXT_READ_FAILED");
  }

  async one(table, userId) {
    const { data, error } = await this.client.from(table).select("*").eq("user_id", userId).maybeSingle();
    if (error) throw this.contextError(error);
    return data;
  }

  async loadSessionContext(user) {
    const profile = await this.one("user_profiles", user.id);
    if (!profile) throw new Error("MISSING_PROFILE");
    const membership = await this.one("hospital_memberships", user.id);
    if (!membership) throw new Error("MISSING_MEMBERSHIP");
    const query = async (table, configure) => {
      let request = this.client.from(table).select("*");
      request = configure(request);
      const { data, error } = await request;
      if (error) throw this.contextError(error);
      return data || [];
    };
    const departments = await query("department_memberships", q => q.eq("user_id", user.id).eq("is_active", true));
    const departmentIds = departments.map(item => item.department_id);
    const departmentDetails = departmentIds.length
      ? await query("departments", q => q.in("id", departmentIds).eq("is_active", true)) : [];
    const trainerAssignments = membership.role.includes("Trainer")
      ? await query("trainer_assignments", q => q.eq("trainer_user_id", user.id).eq("is_active", true)) : [];
    const traineeIds = trainerAssignments.map(item => item.trainee_user_id);
    const traineeProfiles = traineeIds.length
      ? await query("user_profiles", q => q.in("user_id", traineeIds)) : [];
    const trainingAssignments = ["PCA", "Cleaner"].includes(membership.role)
      ? await query("training_assignments", q => q.eq("user_id", user.id).select("*, training_pathways(*)"))
      : traineeIds.length
        ? await query("training_assignments", q => q.in("user_id", traineeIds).select("*, training_pathways(*)")) : [];
    const assignmentIds = trainingAssignments.map(item => item.id);
    const moduleProgress = assignmentIds.length
      ? await query("module_progress", q => q.in("training_assignment_id", assignmentIds)) : [];
    const competencyRecords = ["PCA", "Cleaner"].includes(membership.role)
      ? await query("competency_records", q => q.eq("user_id", user.id)) : [];
    const practicalObservations = membership.role.includes("Trainer") && assignmentIds.length
      ? await query("practical_observations", q => q.in("training_assignment_id", assignmentIds).eq("trainer_id", user.id)) : [];
    const signoffRecommendations = membership.role.includes("Trainer") && assignmentIds.length
      ? await query("signoff_recommendations", q => q.in("training_assignment_id", assignmentIds).eq("trainer_id", user.id)) : [];
    const notifications = await query("notifications", q => q.eq("recipient_user_id", user.id).eq("status", "Unread"));
    return { user, profile, membership, departments, departmentDetails, trainerAssignments, traineeProfiles, trainingAssignments, moduleProgress, competencyRecords, practicalObservations, signoffRecommendations, notifications };
  }

  async recordPracticalObservation(context, input) {
    const relationship = context.trainerAssignments.find(item => item.trainee_user_id === input.traineeUserId && item.department_id === input.departmentId && item.is_active);
    const assignment = context.trainingAssignments.find(item => item.id === input.trainingAssignmentId && item.user_id === input.traineeUserId && item.department_id === input.departmentId);
    if (!relationship || !assignment || !["Competent", "Needs Development", "Not Observed"].includes(input.outcome) || !input.observationText?.trim()) throw new Error("TRAINER_ACTION_INVALID");
    const row = { hospital_id: context.membership.hospital_id, department_id: input.departmentId, training_assignment_id: input.trainingAssignmentId, trainer_id: context.user.id, observation_text: input.observationText.trim(), outcome: input.outcome, observed_at: new Date().toISOString() };
    const { data, error } = await this.client.from("practical_observations").insert(row).select("*").single();
    if (error) throw this.contextError(error);
    return data;
  }

  async submitSignoffRecommendation(context, input) {
    const assignment = context.trainingAssignments.find(item => item.id === input.trainingAssignmentId);
    const relationship = assignment && context.trainerAssignments.find(item => item.trainee_user_id === assignment.user_id && item.department_id === assignment.department_id && item.is_active);
    if (!relationship || !["Ready for Trainer Review", "Reassessment Required"].includes(assignment.status)) throw new Error("TRAINER_ACTION_INVALID");
    const row = { training_assignment_id: assignment.id, trainer_id: context.user.id, recommendation_status: input.recommendationStatus, recommendation_text: input.recommendationText?.trim() || null };
    if (!["Sent to Management", "Reassessment Required"].includes(row.recommendation_status)) throw new Error("TRAINER_ACTION_INVALID");
    const { data, error } = await this.client.from("signoff_recommendations").insert(row).select("*").single();
    if (error) throw this.contextError(error);
    return data;
  }
}
