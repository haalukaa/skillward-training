export const LOCAL_PASSWORD = "LocalOnly-SkillWard-2026";
export const UPDATED_PASSWORD = "Updated-SkillWard-2026";

function projectFixtures(project) {
  const label = project === "mobile" ? "Mobile" : "Desktop";
  return {
    management: {
      email: `management.${project}@skillward.example.test`,
      fullName: `${label} Morgan Manager`,
      employeeId: `CI-${project.toUpperCase()}-MGT`,
      role: "Organisation Administrator"
    },
    worker: {
      email: `worker.${project}@skillward.example.test`,
      fullName: `${label} Casey Worker`,
      employeeId: `CI-${project.toUpperCase()}-WRK`,
      role: "PCA"
    },
    trainer: {
      email: `trainer.${project}@skillward.example.test`,
      fullName: `${label} Riley Trainer`,
      employeeId: `CI-${project.toUpperCase()}-TRN`,
      role: "PCA Trainer"
    },
    multiple: {
      email: `multiple.${project}@skillward.example.test`,
      fullName: `${label} Mika Multiple`,
      employeeId: `CI-${project.toUpperCase()}-MLT`,
      role: "PCA"
    },
    recovery: {
      email: `recovery.${project}@skillward.example.test`,
      fullName: `${label} Rowan Recovery`,
      employeeId: `CI-${project.toUpperCase()}-RCV`,
      role: "PCA"
    },
    session: {
      email: `session.${project}@skillward.example.test`,
      fullName: `${label} Sidney Session`,
      employeeId: `CI-${project.toUpperCase()}-SES`,
      role: "Department Manager"
    },
    suspended: {
      email: `suspended.${project}@skillward.example.test`,
      fullName: `${label} Sawyer Suspended`,
      employeeId: `CI-${project.toUpperCase()}-SUS`,
      role: "PCA"
    },
    unauthorized: {
      email: `unauthorized.${project}@skillward.example.test`,
      fullName: `${label} Quinn Unauthorized`
    },
    invitation: {
      email: `invited.${project}@skillward.example.test`,
      fullName: `${label} Taylor Invitee`,
      employeeId: `CI-${project.toUpperCase()}-INV`,
      role: "PCA"
    }
  };
}

export const FIXTURES = Object.freeze({
  desktop: projectFixtures("desktop"),
  mobile: projectFixtures("mobile")
});

export const LOCAL_IDS = Object.freeze({
  alphaOrganization: "a0000000-0000-0000-0000-000000000001",
  alphaFacility: "a0000000-0000-0000-0000-000000000001",
  alphaDepartment: "a1000000-0000-0000-0000-000000000001",
  betaOrganization: "b0000000-0000-0000-0000-000000000001",
  betaFacility: "b0000000-0000-0000-0000-000000000001",
  betaDepartment: "b1000000-0000-0000-0000-000000000001",
  alphaPathway: "ad000000-0000-0000-0000-000000000001",
  alphaModule: "ae000000-0000-0000-0000-000000000001"
});
