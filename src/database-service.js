/** RLS-protected database boundary for authenticated workspaces. */
export class SkillWardDatabaseService {
  constructor(client) { this.client = client; }

  contextError(error, table = "unknown") {
    const permissionDenied = error?.code === "42501" || /permission denied/i.test(error?.message || "");
    const development = ["localhost", "127.0.0.1"].includes(globalThis.location?.hostname);
    if (development) {
      const code = String(error?.code || "unknown").replace(/[^A-Za-z0-9_-]/g, "");
      const safeTable = String(table).replace(/[^A-Za-z0-9_]/g, "");
      console.warn(`SkillWard development diagnostic: ${safeTable}:${code}`);
      return new Error(`${permissionDenied ? "CONTEXT_TABLE_PERMISSION" : "CONTEXT_READ_FAILED"}:${safeTable}:${code}`);
    }
    return new Error("CONTEXT_READ_FAILED");
  }

  async query(table, configure = request => request, columns = "*") {
    let request = this.client.from(table).select(columns);
    request = configure(request);
    const { data, error } = await request;
    if (error) throw this.contextError(error, table);
    return data || [];
  }

  async one(table, userId) {
    const { data, error } = await this.client.from(table).select("*").eq("user_id", userId).maybeSingle();
    if (error) throw this.contextError(error, table);
    return data;
  }

  async optionalQuery(table, configure = request => request, columns = "*") {
    let request = this.client.from(table).select(columns); request = configure(request);
    const { data, error } = await request;
    if (error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "42501") return [];
    if (error) throw this.contextError(error, table);
    return data || [];
  }

  async loadEntryContext(user) {
    const profile = await this.one("user_profiles", user.id);
    if (!profile) throw new Error("MISSING_PROFILE");
    const platformAdministrator = await this.one("skillward_administrators", user.id);
    const memberships = await this.query(
      "organization_memberships",
      request => request.eq("user_id", user.id),
      "*, organizations(*)"
    );
    const invitations = user.email ? await this.optionalQuery(
      "organization_invitations",
      request => request.eq("email", user.email.toLowerCase()).in("invitation_state", ["Pending", "Delivered", "Accepted"]),
      "*, organizations(*), facilities(name), departments(name)"
    ) : [];
    return { user, profile, platformAdministrator, memberships, invitations };
  }

  async loadSessionContext(user, requestedOrganizationId = null, entryContext = null) {
    const entry = entryContext || await this.loadEntryContext(user);
    const { profile, platformAdministrator } = entry;
    const now = Date.now();
    let memberships = entry.memberships.filter(membership =>
      membership.membership_status === "Active"
      && (!membership.membership_expires_at || new Date(membership.membership_expires_at).getTime() > now)
      && membership.organizations?.status !== "Archived"
    );
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
      const demoRequests = await this.optionalQuery("demo_requests", q => q.order("submitted_at", { ascending: false }).limit(100));
      const usageResult = this.client.rpc ? await this.client.rpc("skillward_organization_usage") : { data: [], error: null };
      if (usageResult.error) throw this.contextError(usageResult.error);
      return {
        user, profile, platformAdministrator, memberships, organizations, supportSessions, demoRequests, organizationUsage: usageResult.data || [],
        membership: { role: "SkillWard Super Administrator", membership_status: "Active", organization_id: null },
        organization: null, facilities: [], departments: [], departmentDetails: [],
        departmentAssignments: [], facilityAssignments: [], trainerAssignments: [], traineeProfiles: [],
        trainingAssignments: [], moduleProgress: [], competencyRecords: [], practicalObservations: [],
        signoffRecommendations: [], notifications: [], organizationStaff: [], assignmentBatches: [],
        assignmentBatchMembers: [], workTasks: [], calendarEvents: [], notificationPreferences: [],
        userNotifications: [], announcements: [], announcementReceipts: [], operationalAuditEvents: [],
        reportExportEvents: []
      };
    }

    if (!memberships.length) throw new Error("MISSING_MEMBERSHIP");
    const membership = memberships.find(item => item.organization_id === requestedOrganizationId)
      || memberships.find(item => item.organization_id === profile.active_organization_id)
      || memberships[0];
    if (requestedOrganizationId && membership.organization_id !== requestedOrganizationId) throw new Error("ACCESS_DENIED");
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
      ? await this.query("training_assignments", q => q.eq("organization_id", organizationId).eq("user_id", user.id), "*, training_pathways!assignments_pathway_org_fk(*)")
      : traineeIds.length
        ? await this.query("training_assignments", q => q.eq("organization_id", organizationId).in("user_id", traineeIds), "*, training_pathways!assignments_pathway_org_fk(*)") : [];
    const assignmentIds = trainingAssignments.map(item => item.id);
    const moduleProgress = assignmentIds.length ? await this.query("module_progress", q => q.eq("organization_id", organizationId).in("training_assignment_id", assignmentIds)) : [];
    const competencyRecords = workerRoles.includes(membership.role) ? await this.query("competency_records", q => q.eq("organization_id", organizationId).eq("user_id", user.id)) : [];
    const practicalObservations = membership.role.includes("Trainer") && assignmentIds.length
      ? await this.query("practical_observations", q => q.eq("organization_id", organizationId).in("training_assignment_id", assignmentIds).eq("trainer_id", user.id)) : [];
    const signoffRecommendations = membership.role.includes("Trainer") && assignmentIds.length
      ? await this.query("signoff_recommendations", q => q.eq("organization_id", organizationId).in("training_assignment_id", assignmentIds).eq("trainer_id", user.id)) : [];
    const notifications = await this.query("notifications", q => q.eq("organization_id", organizationId).eq("recipient_user_id", user.id).eq("status", "Unread"));
    const authSettings = (await this.optionalQuery("organization_auth_settings", q => q.eq("organization_id", organizationId))).at(0) || null;
    const featureFlags = await this.optionalQuery("skillward_feature_flags", q => q.order("feature_key", { ascending: true }));
    const organizationStaff = ["SkillWard Super Administrator", "Organisation Administrator"].includes(membership.role)
      ? await this.query("organization_staff_profiles", q => q.eq("organization_id", organizationId), "*, user_profiles!organization_staff_profiles_user_id_fkey(*)") : [];
    const organizationMemberships = ["SkillWard Super Administrator", "Organisation Administrator", "Facility Administrator", "Department Manager"].includes(membership.role)
      ? await this.optionalQuery("organization_memberships", q => q.eq("organization_id", organizationId).eq("membership_status", "Active")) : [];
    const organizationInvitations = membership.role === "Organisation Administrator"
      ? await this.optionalQuery("organization_invitations", q => q.eq("organization_id", organizationId).order("created_at", { ascending: false })) : [];
    let learningPathways = administrative || ["Facility Administrator", "Department Manager"].includes(membership.role)
      ? await this.optionalQuery("learning_pathways", q => q.eq("organization_id", organizationId).order("updated_at", { ascending: false })) : [];
    let learningPathwayIds = learningPathways.map(item => item.id);
    let learningPathwayVersions = learningPathwayIds.length
      ? await this.optionalQuery("learning_pathway_versions", q => q.in("pathway_id", learningPathwayIds).order("version_number", { ascending: false })) : [];
    let learningVersionIds = learningPathwayVersions.map(item => item.id);
    let learningModules = learningVersionIds.length
      ? await this.optionalQuery("learning_modules", q => q.in("pathway_version_id", learningVersionIds).order("position", { ascending: true })) : [];
    let learningModuleItems = learningVersionIds.length
      ? await this.optionalQuery("learning_module_items", q => q.in("pathway_version_id", learningVersionIds).order("position", { ascending: true })) : [];
    const learningAssignments = administrative || ["Facility Administrator", "Department Manager"].includes(membership.role)
      ? await this.optionalQuery("learning_assignments", q => q.eq("organization_id", organizationId).order("updated_at", { ascending: false }))
      : membership.role.includes("Trainer")
        ? await this.optionalQuery("learning_assignments", q => q.eq("organization_id", organizationId).eq("trainer_user_id", user.id).order("updated_at", { ascending: false }))
        : await this.optionalQuery("learning_assignments", q => q.eq("organization_id", organizationId).eq("worker_user_id", user.id).order("updated_at", { ascending: false }));
    const phase3AssignmentIds = learningAssignments.map(item => item.id);
    if (!administrative && learningAssignments.length) {
      learningPathwayIds = [...new Set(learningAssignments.map(item => item.pathway_id))];
      learningVersionIds = [...new Set(learningAssignments.map(item => item.pathway_version_id))];
      learningPathways = await this.optionalQuery("learning_pathways", q => q.in("id", learningPathwayIds));
      learningPathwayVersions = await this.optionalQuery("learning_pathway_versions", q => q.in("id", learningVersionIds));
      learningModules = await this.optionalQuery("learning_modules", q => q.in("pathway_version_id", learningVersionIds).order("position", { ascending:true }));
      learningModuleItems = await this.optionalQuery("learning_module_items", q => q.in("pathway_version_id", learningVersionIds).order("position", { ascending:true }));
    }
    const learningItemProgress = phase3AssignmentIds.length ? await this.optionalQuery("learning_item_progress", q => q.in("assignment_id", phase3AssignmentIds).order("updated_at", { ascending: true })) : [];
    const competencyObservations = phase3AssignmentIds.length ? await this.optionalQuery("competency_observations", q => q.in("assignment_id", phase3AssignmentIds).order("observed_at", { ascending: false })) : [];
    const competencyRecommendations = phase3AssignmentIds.length ? await this.optionalQuery("competency_recommendations", q => q.in("assignment_id", phase3AssignmentIds).order("submitted_at", { ascending: false })) : [];
    const competencyAwards = phase3AssignmentIds.length ? await this.optionalQuery("competency_awards", q => q.in("assignment_id", phase3AssignmentIds).order("decided_at", { ascending: false })) : [];
    const competencyWorkflowEvents = phase3AssignmentIds.length ? await this.optionalQuery("competency_workflow_events", q => q.in("assignment_id", phase3AssignmentIds).order("created_at", { ascending: false })) : [];
    const competencyRubrics = learningVersionIds.length ? await this.optionalQuery("competency_rubrics", q => q.in("pathway_version_id", learningVersionIds).order("version_number", { ascending: false })) : [];
    const rubricIds = competencyRubrics.map(item => item.id);
    const competencyRubricSections = rubricIds.length ? await this.optionalQuery("competency_rubric_sections", q => q.in("rubric_id", rubricIds).order("position", { ascending: true })) : [];
    const competencyRubricCriteria = rubricIds.length ? await this.optionalQuery("competency_rubric_criteria", q => q.in("rubric_id", rubricIds).order("position", { ascending: true })) : [];
    const competencyAssessments = phase3AssignmentIds.length ? await this.optionalQuery("competency_assessments", q => q.in("assignment_id", phase3AssignmentIds).order("created_at", { ascending: false })) : [];
    const assessmentIds = competencyAssessments.map(item => item.id);
    const competencyCriterionResults = assessmentIds.length ? await this.optionalQuery("competency_criterion_results", q => q.in("assessment_id", assessmentIds)) : [];
    const competencyEvidenceFiles = assessmentIds.length ? await this.optionalQuery("competency_evidence_files", q => q.in("assessment_id", assessmentIds)) : [];
    const competencyWorkerAcknowledgements = assessmentIds.length ? await this.optionalQuery("competency_worker_acknowledgements", q => q.in("assessment_id", assessmentIds)) : [];
    const competencyManagementReviews = assessmentIds.length ? await this.optionalQuery("competency_management_reviews", q => q.in("assessment_id", assessmentIds).order("reviewed_at", { ascending: false })) : [];
    const assignmentBatches = await this.optionalQuery("assignment_batches", q => q.eq("organization_id", organizationId).order("created_at", { ascending:false }));
    const assignmentBatchIds = assignmentBatches.map(item => item.id);
    const assignmentBatchMembers = assignmentBatchIds.length ? await this.optionalQuery("assignment_batch_members", q => q.in("assignment_batch_id", assignmentBatchIds)) : [];
    const workTasks = await this.optionalQuery("work_tasks", q => q.eq("organization_id", organizationId).order("due_at", { ascending:true, nullsFirst:false }));
    const calendarEvents = await this.optionalQuery("calendar_events", q => q.eq("organization_id", organizationId).order("starts_at", { ascending:true }));
    const notificationPreferences = await this.optionalQuery("notification_preferences", q => q.eq("organization_id", organizationId).eq("user_id", user.id));
    const userNotifications = await this.optionalQuery("user_notifications", q => q.eq("organization_id", organizationId).eq("recipient_user_id", user.id).order("created_at", { ascending:false }));
    const announcements = await this.optionalQuery("announcements", q => q.eq("organization_id", organizationId).order("published_at", { ascending:false }));
    const announcementIds = announcements.map(item => item.id);
    const announcementReceipts = announcementIds.length ? await this.optionalQuery("announcement_receipts", q => q.in("announcement_id", announcementIds).eq("user_id", user.id)) : [];
    const operationalAuditEvents = await this.optionalQuery("operational_audit_events", q => q.eq("organization_id", organizationId).order("created_at", { ascending:false }));
    const reportExportEvents = ["SkillWard Super Administrator","Organisation Administrator","Facility Administrator","Department Manager"].includes(membership.role)
      ? await this.optionalQuery("report_export_events", q => q.eq("organization_id", organizationId).order("generated_at", { ascending:false })) : [];

    return {
      user, profile, platformAdministrator, memberships, membership, organization,
      facilities, facilityAssignments, departments: departmentAssignments,
      departmentAssignments, departmentDetails, trainerAssignments, traineeProfiles,
      trainingAssignments, moduleProgress, competencyRecords, practicalObservations,
      signoffRecommendations, notifications, organizationStaff, organizationMemberships, organizationInvitations,
      learningPathways, learningPathwayVersions, learningModules, learningModuleItems,
      learningAssignments, learningItemProgress, competencyObservations,
      competencyRecommendations, competencyAwards, competencyWorkflowEvents,
      competencyRubrics, competencyRubricSections, competencyRubricCriteria,
      competencyAssessments, competencyCriterionResults, competencyEvidenceFiles,
      competencyWorkerAcknowledgements, competencyManagementReviews,
      assignmentBatches, assignmentBatchMembers, workTasks, calendarEvents,
      notificationPreferences, userNotifications, announcements, announcementReceipts,
      operationalAuditEvents, reportExportEvents,
      authSettings, featureFlags
    };
  }

  async completeInvitation(invitationId, fullName) {
    const { data, error } = await this.client.rpc("complete_organization_invitation", {
      invitation_id: invitationId,
      confirmed_full_name: fullName.trim()
    });
    if (error) throw new Error(error.code === "23505" ? "INVITATION_USED" : "INVITATION_INVALID");
    return data;
  }

  async recordAuthenticationEvent(eventName, organizationId = null, metadata = {}) {
    if (!this.client.rpc) return null;
    const { data, error } = await this.client.rpc("record_authentication_event", {
      requested_event: eventName,
      target_organization: organizationId,
      event_metadata: metadata
    });
    if (error) return null;
    return data;
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

  async rpc(name, args) {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw this.contextError(error, name);
    return data;
  }

  createLearningPathway(context, input) {
    return this.rpc("create_learning_pathway_draft", {
      target_organization: context.organization.id,
      pathway_code: input.code.trim().toUpperCase(), pathway_title: input.title.trim(),
      pathway_summary: input.summary?.trim() || null, version_description: input.description?.trim() || null,
      objectives: input.objectives || [], renewal_days: input.renewalDays || null
    });
  }

  addLearningModule(input) {
    return this.rpc("add_learning_module", {
      target_version: input.versionId, module_title: input.title.trim(),
      module_description: input.description?.trim() || null,
      required: input.required !== false, sequential_completion: Boolean(input.sequential)
    });
  }

  addLearningModuleItem(input) {
    return this.rpc("add_learning_module_item", {
      target_module: input.moduleId, content_type: input.type, item_title: input.title.trim(),
      completion: input.completion, item_content: input.content || {},
      item_configuration: input.configuration || {}, required: input.required !== false
    });
  }

  createLearningPathwayVersion(pathwayId) {
    return this.rpc("create_learning_pathway_version", { target_pathway: pathwayId });
  }

  transitionLearningPathwayVersion(versionId, action) {
    return this.rpc("transition_learning_pathway_version", { target_version: versionId, requested_action: action });
  }

  assignPublishedPathway(input) {
    return this.rpc("assign_published_pathway", { target_version:input.versionId, target_worker:input.workerUserId, target_trainer:input.trainerUserId || null, target_due_at:input.dueAt || null });
  }

  completeLearningItem(assignmentId, itemId, answer = {}) {
    return this.rpc("complete_learning_item", { target_assignment:assignmentId, target_item:itemId, answer });
  }

  recordCompetencyObservation(assignmentId, outcome, observation) {
    return this.rpc("record_competency_observation", { target_assignment:assignmentId, outcome, observation });
  }

  submitCompetencyRecommendation(assignmentId, recommendation, rationale = null) {
    return this.rpc("submit_competency_recommendation", { target_assignment:assignmentId, recommendation, rationale });
  }

  decideCompetency(assignmentId, decision, notes = null) {
    return this.rpc("decide_competency", { target_assignment:assignmentId, decision, notes });
  }

  createCompetencyRubric(input) { return this.rpc("create_competency_rubric", { target_version:input.versionId, rubric_title:input.title, assessor_guidance:input.assessorGuidance || null, worker_guidance:input.workerGuidance || null, worker_ack_required:Boolean(input.workerAcknowledgementRequired) }); }
  addCompetencyRubricSection(rubricId, title, guidance = null) { return this.rpc("add_competency_rubric_section", { target_rubric:rubricId, section_title:title, section_guidance:guidance }); }
  addCompetencyRubricCriterion(input) { return this.rpc("add_competency_rubric_criterion", { target_section:input.sectionId, criterion_text:input.criterion, safety_critical:Boolean(input.safetyCritical), comments_required:Boolean(input.commentsRequired), evidence_required:Boolean(input.evidenceRequired), assessor_guidance:input.assessorGuidance || null, worker_guidance:input.workerGuidance || null }); }
  publishCompetencyRubric(rubricId) { return this.rpc("publish_competency_rubric", { target_rubric:rubricId }); }
  startCompetencyAssessment(assignmentId) { return this.rpc("start_competency_assessment", { target_assignment:assignmentId }); }
  saveCompetencyCriterion(assessmentId, criterionId, rating, comments = null) { return this.rpc("save_competency_criterion", { target_assessment:assessmentId, target_criterion:criterionId, result_rating:rating, result_comments:comments }); }
  submitCompetencyAssessment(input) { return this.rpc("submit_competency_assessment", { target_assessment:input.assessmentId, assessment_location:input.location || null, assessment_context:input.context || null, personally_observed:Boolean(input.personallyObserved), development_plan:input.developmentPlan || null }); }
  acknowledgeCompetencyAssessment(assessmentId, acknowledged, comment = null) { return this.rpc("acknowledge_competency_assessment", { target_assessment:assessmentId, acknowledged:Boolean(acknowledged), worker_comment:comment }); }
  reviewCompetencyAssessment(input) { return this.rpc("review_competency_assessment", { target_assessment:input.assessmentId, review_decision:input.decision, review_reason:input.reason, validity_days:input.validityDays || null }); }

  createAssignmentBatch(input) { return this.rpc("create_assignment_batch", { target_version:input.versionId, assignment_title:input.title, target_scope:input.scope, selected_users:input.selectedUsers || [], target_facility:input.facilityId || null, target_department:input.departmentId || null, target_role:input.roleGroup || null, target_trainer:input.trainerUserId || null, target_manager:input.managerUserId || null, assignment_priority:input.priority || "Normal", assignment_starts_at:input.startsAt, assignment_due_at:input.dueAt || null, renewal_rule:input.renewalRule || {} }); }
  saveNotificationPreferences(organizationId, input) { return this.rpc("save_notification_preferences", { target_organization:organizationId, target_digest:input.digest, email_delivery:Boolean(input.emailEnabled), assignment_alerts:Boolean(input.assignmentNotifications), deadline_alerts:Boolean(input.deadlineNotifications), competency_alerts:Boolean(input.competencyNotifications), announcement_alerts:Boolean(input.announcementNotifications) }); }
  markUserNotificationRead(notificationId) { return this.rpc("mark_user_notification_read", { target_notification:notificationId }); }
  publishAnnouncement(organizationId, input) { return this.rpc("publish_announcement", { target_organization:organizationId, announcement_title:input.title, announcement_message:input.message, target_scope:input.scope || "Organisation", target_facility:input.facilityId || null, target_department:input.departmentId || null, target_role:input.roleGroup || null, announcement_priority:input.priority || "Normal", announcement_expires_at:input.expiresAt || null }); }
  markAnnouncementRead(announcementId) { return this.rpc("mark_announcement_read", { target_announcement:announcementId }); }
  refreshOperationalDeadlines(organizationId) { return this.rpc("refresh_operational_deadlines", { target_organization:organizationId }); }
  getReportingSnapshot(organizationId, filters = {}) { return this.rpc("get_reporting_snapshot", { target_organization:organizationId, report_filters:filters }); }
  recordReportExport(organizationId, input) { return this.rpc("record_report_export", { target_organization:organizationId, target_report:input.reportKind, target_format:input.format, report_filters:input.filters || {}, export_row_count:input.rowCount || 0, export_file_name:input.fileName, export_sha256:input.sha256 || null }); }
  getSecurityOperationsSnapshot(organizationId = null) { return this.rpc("get_security_operations_snapshot", { target_organization:organizationId }); }
  createSecurityIncident(organizationId, input) { return this.rpc("create_security_incident", { target_organization:organizationId, incident_severity:input.severity, incident_title:input.title, incident_summary:input.summary }); }
  transitionSecurityIncident(incidentId, status, resolution = null) { return this.rpc("transition_security_incident", { target_incident:incidentId, requested_status:status, resolution_notes:resolution }); }
  startAccessReview(organizationId, input) { return this.rpc("start_access_review", { target_organization:organizationId, review_title:input.title, review_due_at:input.dueAt }); }
  recordAccessReviewDecision(itemId, decision, notes = null) { return this.rpc("record_access_review_decision", { target_item:itemId, requested_decision:decision, decision_notes:notes }); }
  submitDataLifecycleRequest(organizationId, input) { return this.rpc("submit_data_lifecycle_request", { target_organization:organizationId, target_subject:input.subjectUserId, requested_kind:input.kind, request_reason:input.reason }); }
  decideDataLifecycleRequest(requestId, status, notes, legalHold = false) { return this.rpc("decide_data_lifecycle_request", { target_request:requestId, requested_status:status, decision_notes:notes, apply_legal_hold:Boolean(legalHold) }); }
  saveRetentionPolicy(organizationId, input) { return this.rpc("save_organization_retention_policy", { target_organization:organizationId, audit_days:Number(input.auditDays), authentication_days:Number(input.authenticationDays), evidence_days:Number(input.evidenceDays), export_days:Number(input.exportDays), legal_hold_enabled:Boolean(input.legalHoldEnabled) }); }

  createOrganization(input) {
    return this.insert("organizations", { name: input.name.trim(), organization_type: input.organizationType, slug: input.slug.trim().toLowerCase(), subscription_plan: input.subscriptionPlan || "Pilot", subscription_status: "Trial" });
  }

  archiveOrganization(organizationId) {
    return this.update("organizations", organizationId, { status: "Archived", archived_at: new Date().toISOString() });
  }

  activateSupportSession(sessionId) {
    return this.rpc("activate_support_session_v2", { target_session:sessionId });
  }

  authorizeSupportAccess(context, input) {
    return this.rpc("authorize_support_access_v2", { target_organization:context.organization.id, target_support_user:input.supportUserId, support_reason:input.reason.trim(), duration_hours:Number(input.hours) || 1 });
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

  async manageOrganizationInvitation(invitationId, action) {
    if (!this.client.functions?.invoke || !["resend", "revoke"].includes(action)) throw new Error("INVITATION_ACTION_INVALID");
    const { data, error } = await this.client.functions.invoke("invite-organization-member", {
      body: { invitationId, action }
    });
    if (error) throw new Error("INVITATION_ACTION_FAILED");
    return data;
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
