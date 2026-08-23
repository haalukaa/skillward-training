window.SKILLWARD_DEMO_SECTORS = Object.freeze({
  hospital: {
    id: "hospital",
    name: "Hospital",
    shortName: "Hospital",
    organization: "Perth Metro Hospital Network",
    facility: "SkillWard Demonstration Hospital",
    description: "Clinical support workforce learning, practical assessment and department readiness.",
    departments: [
      { id: "operating-theatre", code: "OT", name: "Operating Theatre & Recovery" },
      { id: "day-surgery", code: "DSU", name: "Day Surgery Unit" }
    ],
    roles: [
      { value: "pca", label: "Patient Care Assistant", kind: "worker" },
      { value: "cleaner", label: "Cleaner", kind: "worker" },
      { value: "pca-trainer", label: "PCA Trainer", kind: "trainer" },
      { value: "cleaner-trainer", label: "Cleaner Trainer", kind: "trainer" },
      { value: "management", label: "Management", kind: "management" }
    ],
    pathway: {
      id: "hospital-ot-readiness",
      title: "Operating Theatre & Recovery Readiness",
      description: "A role-based pathway covering patient flow, transport, recovery support, theatre readiness and infection prevention.",
      modules: [
        { id: "hospital-patient-flow", title: "Patient Flow and PRA", type: "Lesson", duration: "20 min" },
        { id: "hospital-transport", title: "Patient Transport Safety", type: "Lesson", duration: "25 min" },
        { id: "hospital-recovery", title: "Recovery Support", type: "Lesson", duration: "20 min" },
        { id: "hospital-infection", title: "Infection Prevention and PPE", type: "Knowledge check", duration: "30 min" }
      ]
    },
    people: [
      { name: "Alex Morgan", id: "HSP-1001", role: "Patient Care Assistant", department: "Operating Theatre & Recovery", progress: 75, status: "In progress" },
      { name: "Maya Chen", id: "HSP-1002", role: "Cleaner", department: "Operating Theatre & Recovery", progress: 100, status: "Awaiting approval" },
      { name: "Aisha Rahman", id: "HSP-2001", role: "PCA Trainer", department: "Operating Theatre & Recovery", progress: 100, status: "Active" },
      { name: "Sarah Collins", id: "HSP-3001", role: "Department Manager", department: "Operating Theatre & Recovery", progress: 100, status: "Active" }
    ]
  },
  "aged-care": {
    id: "aged-care",
    name: "Aged Care",
    shortName: "Aged Care",
    organization: "Harbourview Aged Care",
    facility: "Harbourview Residential Care",
    description: "Residential-care onboarding, dignity, safe support and ongoing capability assurance.",
    departments: [
      { id: "residential-care", code: "RC", name: "Residential Care" },
      { id: "memory-support", code: "MS", name: "Memory Support" }
    ],
    roles: [
      { value: "care-worker", label: "Personal Care Worker", kind: "worker" },
      { value: "aged-care-cleaner", label: "Environmental Services Worker", kind: "worker" },
      { value: "aged-care-trainer", label: "Clinical Educator", kind: "trainer" },
      { value: "management", label: "Care Manager", kind: "management" }
    ],
    pathway: {
      id: "aged-care-foundations",
      title: "Safe and Respectful Residential Care",
      description: "A sample pathway for dignity, communication, safe mobility, infection prevention and incident escalation.",
      modules: [
        { id: "aged-dignity", title: "Dignity, Choice and Consent", type: "Lesson", duration: "20 min" },
        { id: "aged-communication", title: "Communication and Cognitive Support", type: "Scenario", duration: "25 min" },
        { id: "aged-mobility", title: "Mobility and Falls Prevention", type: "Lesson", duration: "30 min" },
        { id: "aged-infection", title: "Infection Prevention and Escalation", type: "Knowledge check", duration: "20 min" }
      ]
    },
    people: [
      { name: "Grace Miller", id: "AC-1001", role: "Personal Care Worker", department: "Residential Care", progress: 75, status: "In progress" },
      { name: "Daniel Okoro", id: "AC-1002", role: "Environmental Services Worker", department: "Memory Support", progress: 100, status: "Ready for observation" },
      { name: "Leah Thompson", id: "AC-2001", role: "Clinical Educator", department: "Residential Care", progress: 100, status: "Active" },
      { name: "Priya Nair", id: "AC-3001", role: "Care Manager", department: "Residential Care", progress: 100, status: "Active" }
    ]
  },
  disability: {
    id: "disability",
    name: "Disability Support",
    shortName: "Disability",
    organization: "Pathways Community Support",
    facility: "Perth Community Services",
    description: "Person-centred support, safe community practice and continuing worker capability.",
    departments: [
      { id: "supported-living", code: "SIL", name: "Supported Independent Living" },
      { id: "community-access", code: "CA", name: "Community Access" }
    ],
    roles: [
      { value: "support-worker", label: "Disability Support Worker", kind: "worker" },
      { value: "disability-trainer", label: "Practice Coach", kind: "trainer" },
      { value: "management", label: "Service Manager", kind: "management" }
    ],
    pathway: {
      id: "disability-person-centred-support",
      title: "Person-Centred Support Foundations",
      description: "A sample pathway for rights, communication, positive support, safe assistance and incident response.",
      modules: [
        { id: "disability-rights", title: "Rights, Choice and Dignity", type: "Lesson", duration: "20 min" },
        { id: "disability-communication", title: "Accessible Communication", type: "Scenario", duration: "25 min" },
        { id: "disability-support", title: "Positive and Safe Support", type: "Lesson", duration: "30 min" },
        { id: "disability-incidents", title: "Incident Recognition and Escalation", type: "Knowledge check", duration: "20 min" }
      ]
    },
    people: [
      { name: "Jordan Lee", id: "DS-1001", role: "Disability Support Worker", department: "Supported Independent Living", progress: 75, status: "In progress" },
      { name: "Sofia Patel", id: "DS-1002", role: "Disability Support Worker", department: "Community Access", progress: 100, status: "Ready for observation" },
      { name: "Marcus Green", id: "DS-2001", role: "Practice Coach", department: "Supported Independent Living", progress: 100, status: "Active" },
      { name: "Emily Walsh", id: "DS-3001", role: "Service Manager", department: "Supported Independent Living", progress: 100, status: "Active" }
    ]
  }
});
