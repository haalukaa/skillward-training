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

  async query(table, configure = request => request, columns = "*") {
    let request = this.client.from(table).select(columns);
    request = configure(request);
    const { data, error } = await request;
    if (error) throw this.contextError(error);
    return data || [];
  }

  async one(table, userId) {
    const { data, error } = await this.client.from(table).select("*").eq("user_id", userId).maybeSingle();
    if (error) throw this.contextError(error);
    return data;
  }

  async loadSessionContext(user, requestedOrganizationId = null) {
    const profile = await this.one("user_profiles", user.id);
    if (!profile) throw new Error("MISSING_PROFILE");
    const platformAdministrator = await this.one("skillward_administrators", user.id);
    let memberships = await this.query("organization_memberships", q => q.eq("user_id", user.id).eq("membership_status", "Active"), "*, organizations(*)");
    if (platformAdministrator?.is_active && requestedOrganizationId) {
      const authorizedSupport = await this.query("support_access_sessions", q => q.eq("support_user_id", user.id).eq("organization_id", requestedOrganizationId).eq("status", "Active").gt("expires_at", new Date().toISOString()));
      if (authorizedSupport.length) {
        const supportedOrganization = (await this.query("organizations", q => q.eq("id", requestedOrganizationId))).at(0);
        memberships = [{ organization_id: requestedOrganizationId, role: "SkillWard Super Administrator", membership_status: "Active", organizations: supportedOrganization }];
      }
    }

    if (!memberships.length && platformAdministrator?.is_active) {
      const organizations = await this.query("organizations", q => q.order("created_at", { ascending: false }));
      const supportSessions = await this.query("support_access_sessions", q => q.eq("support_user_id", user.id).in("status", ["Pending", "Active"]));
      const usageResult = this.client.rpc ? await this.client.rpc("skillward_organization_usage") : { data: [], error: null };
      if (usageResult.error) throw this.contextError(usageResult.error);
      return {
        user, profile, platformAdministrator, memberships, organizations, supportSessions, organizationUsage: usageResult.data || [],
        membership: { role: "SkillWard Super Administrator", membership_status: "Active", organization_id: null },
        organization: null, facilities: [], departments: [], departmentDetails: [],
        departmentAssignments: [], facilityAssignments: [], trainerAssignments: [], traineeProfiles: [],
        trainingAssignments: [], moduleProgress: [], competencyRecords: [], practicalObservations: [],
        signoffRecommendations: [], notifications: [], organizationStaff: []
      };
    }

    if (!memberships.length) throw new Error("MISSING_MEMBERSHIP");
    const membership = memberships.find(item => item.organization_id === requestedOrganizationId)
      || memberships.find(item => item.organization_id === profile.active_organization_id)
      || memberships[0];
    const organizationId = membership.organization_id;
    const organization = membership.organizations || (await this.query("organizations", q => q.eq("id", organizationId))).at(0);
    const administrative = ["SkillWard Super Administrator", "Organisation Administrator", "Content Administrator/Educator"].includes(membership.role);

    const facilityAssignments = await this.query("facility_assignments", q => q.eq("organization_id", organizationId).eq("user_id", user.id).eq("is_active", true));
    const departmentAssignments = await this.query("department_assignments", q => q.eq("organization_id", organizationId).eq("user_id", user.id).eq("is_active", true));
    const facilities = await this.query("facilities", q => q.eq("organization_id", organizationId).eq("is_active", true));
    const permittedFacilityIds = facilityAssignments.map(item => item.facility_id);
    const permittedDepartmentIds = departmentAssignments.map(item => item.department_id);
    const departmentDetails = administrative
      ? await this.query("departments", q => q.eq("organization_id", organizationId).eq("is_active", true))
      : membership.role === "Facility Administrator" && permittedFacilityIds.length
        ? await this.query("departments", q => q.eq("organization_id", organizationId).in("facility_id", permittedFacilityIds).eq("is_active", true))
        : permittedDepartmentIds.length
          ? await this.query("departments", q => q.eq("organization_id", organizationId).in("id", permittedDepartmentIds).eq("is_active", true))
          : [];

    const trainerAssignments = membership.role.includes("Trainer")
      ? await this.query("trainer_assignments", q => q.eq("organization_id", organizationId).eq("trainer_user_id", user.id).eq("is_active", true)) : [];
    const traineeIds = trainerAssignments.map(item => item.trainee_user_id);
    const traineeProfiles = traineeIds.length ? await this.query("user_profiles", q => q.in("user_id", traineeIds)) : [];
    const workerRoles = ["PCA", "Cleaner", "Support Worker"];
    const trainingAssignments = workerRoles.includes(membership.role)
      ? await this.query("training_assignments", q => q.eq("organization_id", organizationId).eq("user_id", user.id), "*, training_pathways(*)")
      : traineeIds.length
        ? await this.query("training_assignments", q => q.eq("organization_id", organizationId).in("user_id", traineeIds), "*, training_pathways(*)") : [];
    const assignmentIds = trainingAssignments.map(item => item.id);
    const moduleProgress = assignmentIds.length ? await this.query("module_progress", q => q.eq("organization_id", organizationId).in("training_assignment_id", assignmentIds)) : [];
    const competencyRecords = workerRoles.includes(membership.role) ? await this.query("competency_records", q => q.eq("organization_id", organizationId).eq("user_id", user.id)) : [];
    const practicalObservations = membership.role.includes("Trainer") && assignmentIds.length
      ? await this.query("practical_observations", q => q.eq("organization_id", organizationId).in("training_assignment_id", assignmentIds).eq("trainer_id", user.id)) : [];
    const signoffRecommendations = membership.role.includes("Trainer") && assignmentIds.length
      ? await this.query("signoff_recommendations", q => q.eq("organization_id", organizationId).in("training_assignment_id", assignmentIds).eq("trainer_id", user.id)) : [];
    const notifications = await this.query("notifications", q => q.eq("organization_id", organizationId).eq("recipient_user_id", user.id).eq("status", "Unread"));
    const organizationStaff = ["SkillWard Super Administrator", "Organisation Administrator"].includes(membership.role)
      ? await this.query("organization_staff_profiles", q => q.eq("organization_id", organizationId), "*, user_profiles!organization_staff_profiles_user_id_fkey(*)") : [];

    return {
      user, profile, platformAdministrator, memberships, membership, organization,
      facilities, facilityAssignments, departments: departmentAssignments,
      departmentAssignments, departmentDetails, trainerAssignments, traineeProfiles,
      trainingAssignments, moduleProgress, competencyRecords, practicalObservations,
      signoffRecommendations, notifications, organizationStaff
    };
  }

  async insert(table, row) {
    const { data, error } = await this.client.from(table).insert(row).select("*").single();
    if (error) throw this.contextError(error);
    return data;
  }

  async update(table, id, values) {
    const { data, error } = await this.client.from(table).update(values).eq("id", id).select("*").single();
    if (error) throw this.contextError(error);
    return data;
  }

  createOrganization(input) {
    return this.insert("organizations", { name: input.name.trim(), organization_type: input.organizationType, slug: input.slug.trim().toLowerCase(), subscription_plan: input.subscriptionPlan || "Pilot", subscription_status: "Trial" });
  }

  archiveOrganization(organizationId) {
    return this.update("organizations", organizationId, { status: "Archived", archived_at: new Date().toISOString() });
  }

  activateSupportSession(sessionId) {
    return this.update("support_access_sessions", sessionId, { status: "Active", starts_at: new Date().toISOString() });
  }

  authorizeSupportAccess(context, input) {
    const hours = Math.min(24, Math.max(1, Number(input.hours) || 1));
    return this.insert("support_access_sessions", { organization_id: context.organization.id, support_user_id: input.supportUserId, authorized_by: context.user.id, reason: input.reason.trim(), expires_at: new Date(Date.now() + hours * 3600000).toISOString() });
  }

  updateOrganizationBranding(context, input) {
    return this.update("organizations", context.organization.id, { logo_path: input.logoPath?.trim() || null, branding_settings: { primaryColor: input.primaryColor, accentColor: input.accentColor } });
  }

  createFacility(context, input) {
    return this.insert("facilities", { organization_id: context.organization.id, name: input.name.trim(), location: input.location?.trim() || null });
  }

  createDepartment(context, input) {
    return this.insert("departments", { organization_id: context.organization.id, facility_id: input.facilityId, hospital_id: input.facilityId, code: input.code.trim().toUpperCase(), name: input.name.trim(), description: input.description?.trim() || null });
  }

  async inviteOrganizationMember(context, input) {
    const invitation = await this.insert("organization_invitations", { organization_id: context.organization?.id || input.organizationId, email: input.email.trim().toLowerCase(), full_name: input.fullName.trim(), employee_id: input.employeeId.trim(), intended_role: input.role, facility_id: input.facilityId || null, department_id: input.departmentId || null, invited_by: context.user.id, expires_at: new Date(Date.now() + 7 * 86400000).toISOString() });
    if (!this.client.functions?.invoke) return invitation;
    const { error } = await this.client.functions.invoke("invite-organization-member", { body: { invitationId: invitation.id } });
    if (error) throw new Error("INVITATION_DELIVERY_FAILED");
    return invitation;
  }

  async recordPracticalObservation(context, input) {
    const relationship = context.trainerAssignments.find(item => item.trainee_user_id === input.traineeUserId && item.department_id === input.departmentId && item.is_active);
    const assignment = context.trainingAssignments.find(item => item.id === input.trainingAssignmentId && item.user_id === input.traineeUserId && item.department_id === input.departmentId);
    if (!relationship || !assignment || !["Competent", "Needs Development", "Not Observed"].includes(input.outcome) || !input.observationText?.trim()) throw new Error("TRAINER_ACTION_INVALID");
    return this.insert("practical_observations", { organization_id: context.organization.id, facility_id: assignment.facility_id, hospital_id: assignment.hospital_id, department_id: input.departmentId, training_assignment_id: input.trainingAssignmentId, trainer_id: context.user.id, observation_text: input.observationText.trim(), outcome: input.outcome, observed_at: new Date().toISOString() });
  }

  async submitSignoffRecommendation(context, input) {
    const assignment = context.trainingAssignments.find(item => item.id === input.trainingAssignmentId);
    const relationship = assignment && context.trainerAssignments.find(item => item.trainee_user_id === assignment.user_id && item.department_id === assignment.department_id && item.is_active);
    if (!relationship || !["Ready for Trainer Review", "Reassessment Required"].includes(assignment.status)) throw new Error("TRAINER_ACTION_INVALID");
    const row = { organization_id: context.organization.id, training_assignment_id: assignment.id, trainer_id: context.user.id, recommendation_status: input.recommendationStatus, recommendation_text: input.recommendationText?.trim() || null };
    if (!["Sent to Management", "Reassessment Required"].includes(row.recommendation_status)) throw new Error("TRAINER_ACTION_INVALID");
    return this.insert("signoff_recommendations", row);
  }
}
