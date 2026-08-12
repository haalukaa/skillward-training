/** Contract for the future database-backed service; current demo data remains authoritative. */
class SkillWardDatabaseService {
  async loadSessionContext() { throw new Error("Database service is not configured"); }
  async listTrainingAssignments() { throw new Error("Database service is not configured"); }
  async saveModuleProgress() { throw new Error("Database service is not configured"); }
  async submitKnowledgeCheck() { throw new Error("Database service is not configured"); }
}

if (typeof module !== "undefined") module.exports = { SkillWardDatabaseService };
