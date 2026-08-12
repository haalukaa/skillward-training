/** RLS-protected, read-only database boundary for authenticated workspaces. */
export class SkillWardDatabaseService {
  constructor(client) { this.client = client; }

  async one(table, userId) {
    const { data, error } = await this.client.from(table).select("*").eq("user_id", userId).maybeSingle();
    if (error) throw new Error("CONTEXT_READ_FAILED");
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
      if (error) throw new Error("CONTEXT_READ_FAILED");
      return data || [];
    };
    const departments = await query("department_memberships", q => q.eq("user_id", user.id).eq("is_active", true));
    const departmentIds = departments.map(item => item.department_id);
    const departmentDetails = departmentIds.length
      ? await query("departments", q => q.in("id", departmentIds).eq("is_active", true)) : [];
    const trainerAssignments = membership.role.includes("Trainer")
      ? await query("trainer_assignments", q => q.eq("trainer_user_id", user.id).eq("is_active", true)) : [];
    const trainingAssignments = ["PCA", "Cleaner"].includes(membership.role)
      ? await query("training_assignments", q => q.eq("user_id", user.id).select("*, training_pathways(*)")) : [];
    return { user, profile, membership, departments, departmentDetails, trainerAssignments, trainingAssignments };
  }
}
