/* Demonstration records only. Replace this adapter with authenticated API data in production. */
window.SKILLWARD_MANAGEMENT_SAMPLE = {
  hospital: { id: "st-catherines", name: "St Catherine's Hospital" },
  trainerCapacity: 3,
  managers: [
    { id: "MGR-001", name: "Dr Maya Chen", level: "Hospital Administrator", departments: ["operating-theatre", "day-surgery", "acute-surgical-unit", "dialysis", "gastro", "emergency-department"], accountStatus: "Active" },
    { id: "MGR-002", name: "Jordan Blake", level: "Hospital Administrator", departments: ["operating-theatre", "day-surgery", "acute-surgical-unit", "dialysis", "gastro", "emergency-department"], accountStatus: "Active" },
    { id: "MGR-003", name: "Priya Nair", level: "Department Manager", departments: ["operating-theatre", "day-surgery"], accountStatus: "Active" }
  ],
  staff: [
    { id: "EMP-1001", name: "Alex Morgan", email: "alex.morgan@example.test", role: "PCA", departments: ["operating-theatre"], trainerId: "TR-PCA-01", managerId: "MGR-003", startDate: "2026-07-01", employmentStatus: "New Starter", accountStatus: "Active", progress: 72, competencyStatus: "In Progress" },
    { id: "EMP-1002", name: "Samira Ali", email: "samira.ali@example.test", role: "PCA", departments: ["operating-theatre"], trainerId: "TR-PCA-01", managerId: "MGR-003", startDate: "2026-06-10", employmentStatus: "Active", accountStatus: "Active", progress: 100, competencyStatus: "Approved" },
    { id: "EMP-1003", name: "Noah Williams", email: "noah.williams@example.test", role: "Cleaner", departments: ["day-surgery"], trainerId: "TR-CLN-01", managerId: "MGR-003", startDate: "2026-08-20", employmentStatus: "New Starter", accountStatus: "Invited", progress: 0, competencyStatus: "Not Started" },
    { id: "TR-PCA-01", name: "Jordan Lee", email: "jordan.lee@example.test", role: "PCA Trainer", departments: ["operating-theatre", "day-surgery"], trainerId: null, managerId: "MGR-003", startDate: "2024-02-12", employmentStatus: "Active", accountStatus: "Active", progress: 100, competencyStatus: "Approved" },
    { id: "TR-CLN-01", name: "Morgan Reed", email: "morgan.reed@example.test", role: "Cleaner Trainer", departments: ["day-surgery", "gastro"], trainerId: null, managerId: "MGR-003", startDate: "2023-11-01", employmentStatus: "Active", accountStatus: "Active", progress: 100, competencyStatus: "Approved" }
  ],
  assignments: [
    { id: "ASN-1", staffId: "EMP-1001", pathway: "Operating Theatre PCA", assignedDate: "2026-07-01", dueDate: "2026-08-20", assignedBy: "Dr Maya Chen", progress: 72, trainerReviewStatus: "Pending", managementApprovalStatus: "Pending", renewalDate: null },
    { id: "ASN-2", staffId: "EMP-1002", pathway: "Operating Theatre PCA", assignedDate: "2026-06-10", dueDate: "2026-07-30", assignedBy: "Priya Nair", progress: 100, trainerReviewStatus: "Recommended", managementApprovalStatus: "Approved", renewalDate: "2026-08-01" }
  ],
  audit: [], notifications: []
};
