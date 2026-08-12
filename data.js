window.TRAINING_AREAS = [
  {
    id: "pra",
    code: "PRA",
    name: "PRA",
    fullName: "Patient Reception Area",
    summary: "Patient collection, arrival at reception and safe transport into the operating-theatre pathway.",
    modules: ["pra-workflow", "transport-safety"]
  },
  {
    id: "recovery",
    code: "REC",
    name: "Recovery Area",
    fullName: "PCA Recovery · PCA East and PCA West",
    summary: "Post-procedure support and safe assistance when patients return to their ward.",
    modules: ["recovery-workflow", "ward-return"]
  },
  {
    id: "prep",
    code: "PREP",
    name: "Prep Area",
    fullName: "East and West Prep",
    summary: "Patient transfers, theatre support, room turnover, cleaning and infection prevention.",
    modules: ["prep-support", "infection"]
  }
];

window.TRAINING_MODULES = [
  {
    id: "pra-workflow",
    area: "pra",
    number: 1,
    title: "Patient Pickup and PRA Workflow",
    summary: "Follow the patient journey from the ward pickup slip to arrival in the Patient Reception Area.",
    duration: "20 min",
    lesson: {
      objective: "Describe the PCA role when collecting a patient and bringing them safely to PRA.",
      why: "A clear pickup and handover process reduces delays, wrong destinations and avoidable transport risks.",
      steps: [
        "Receive the assigned patient pickup slip from the supervisor and review the pickup location.",
        "Locate the correct ward or department, which may include areas such as 4G, 5H, Dialysis or ED.",
        "Follow the hospital-approved patient identification and collection process before moving the patient.",
        "Prepare the bed and transport route according to the approved procedure.",
        "Transport the patient directly to PRA and position the bed in the designated reception location.",
        "Notify the appropriate PRA staff that the patient has arrived and complete the approved handover process.",
        "Allow nursing staff to complete their clinical identity, procedure and documentation checks. These checks are outside the PCA role unless local policy states otherwise."
      ],
      mistakes: [
        "Leaving without confirming the assigned pickup location and destination.",
        "Using an unapproved shortcut or leaving the patient unattended.",
        "Performing nursing or clinical checks that are outside the PCA role.",
        "Failing to report a delay, discrepancy or safety concern."
      ]
    },
    quiz: [
      { q: "Where is the patient taken after collection for the operating-theatre pathway?", options: ["PRA", "Any available theatre", "The staff room"], answer: 0 },
      { q: "Who completes the clinical identity and procedure checks in PRA?", options: ["The assigned nursing staff", "The PCA independently", "The patient's visitor"], answer: 0 },
      { q: "What should a PCA do if the pickup information does not match?", options: ["Guess the correct destination", "Follow the approved escalation process before transport", "Ignore the difference"], answer: 1 }
    ]
  },
  {
    id: "transport-safety",
    area: "pra",
    number: 2,
    title: "Patient Transport and Bed Safety",
    summary: "Inspect, steer and manoeuvre beds safely while transporting patients to PRA.",
    duration: "25 min",
    lesson: {
      objective: "Prepare and manoeuvre a patient bed safely using the hospital-approved transport process.",
      why: "Beds are large, routes can be busy and poor manoeuvring can injure patients, staff or other people.",
      steps: [
        "Inspect the bed, brakes, wheels, rails and attachments before transport.",
        "Confirm the patient and equipment are ready according to the approved local process.",
        "Plan the route and identify lifts, narrow turns, doors, slopes and busy areas.",
        "Use the approved number of staff and request assistance when the route, bed or patient requires it.",
        "Maintain control of the bed, communicate before turns and keep hands and feet clear of pinch points.",
        "Move at a safe pace and maintain awareness of the patient, staff, visitors and surrounding equipment.",
        "Apply brakes when stationary and report any incident, near miss, damage or equipment fault."
      ],
      mistakes: [
        "Moving before checking the bed and route.",
        "Trying to manage a difficult turn or heavy bed without assistance.",
        "Moving too quickly through doors, corners or lifts.",
        "Failing to apply brakes when the bed is stationary."
      ]
    },
    quiz: [
      { q: "What should be checked before transporting a patient bed?", options: ["Only the linen", "Brakes, wheels, rails, attachments and route", "Only the destination"], answer: 1 },
      { q: "What should you do when safe manoeuvring requires more help?", options: ["Continue alone", "Request the approved assistance", "Ask the patient to steer"], answer: 1 },
      { q: "What should happen after a transport near miss?", options: ["Follow the approved reporting process", "Ignore it because nobody was injured", "Wait until the next roster"], answer: 0 }
    ]
  },
  {
    id: "recovery-workflow",
    area: "recovery",
    number: 3,
    title: "Recovery Area Workflow",
    summary: "Understand PCA responsibilities in Recovery after a patient’s procedure.",
    duration: "20 min",
    lesson: {
      objective: "Describe the PCA role in Recovery and work safely within role boundaries.",
      why: "Clear responsibilities support the clinical team while protecting patients during post-anaesthetic care.",
      steps: [
        "Identify the PCA Recovery layout, including PCA East, PCA West, designated bed positions, access routes and local communication points.",
        "Follow directions from the responsible clinical staff and remain within the PCA scope of practice.",
        "Keep transport routes and required equipment ready without interrupting clinical care.",
        "Respond to requests for transport assistance using the approved communication process.",
        "Recognise that monitoring, assessment and decisions about readiness to leave Recovery are clinical responsibilities.",
        "Escalate hazards, patient concerns or uncertainty immediately to the appropriate nurse or supervisor."
      ],
      mistakes: [
        "Acting outside the PCA role.",
        "Moving a patient before clinical staff confirm readiness.",
        "Blocking access routes or emergency equipment.",
        "Failing to communicate a concern promptly."
      ]
    },
    quiz: [
      { q: "Who determines when a patient is clinically ready to leave Recovery?", options: ["The responsible clinical staff", "The PCA", "The transporter waiting outside"], answer: 0 },
      { q: "What is a PCA expected to do when unsure about a Recovery request?", options: ["Guess", "Clarify with the appropriate nurse or supervisor", "Leave the area"], answer: 1 },
      { q: "Why must access routes remain clear?", options: ["For appearance only", "For safe movement and emergency access", "Only during inspections"], answer: 1 }
    ]
  },
  {
    id: "ward-return",
    area: "recovery",
    number: 4,
    title: "Return-to-Ward Transport",
    summary: "Assist the ward nurse and safely transport the patient from Recovery back to the ward.",
    duration: "25 min",
    lesson: {
      objective: "Support safe return-to-ward transport after the clinical team authorises the patient to leave Recovery.",
      why: "Good communication and controlled bed movement reduce transport incidents during the return journey.",
      steps: [
        "Wait for the responsible Recovery staff to confirm that transport may proceed.",
        "Coordinate with the collecting ward nurse and clarify the destination and transport plan.",
        "Complete the approved bed, equipment and route safety checks.",
        "Assist the ward nurse while maintaining control of the bed and communicating at doors, corners and lifts.",
        "Use approved manual-handling techniques and request additional assistance when required.",
        "Deliver the patient to the correct ward location and complete the local handover process.",
        "Report incidents, near misses, delays or equipment problems according to hospital procedure."
      ],
      mistakes: [
        "Beginning transport without confirmation from Recovery staff.",
        "Assuming the destination without checking.",
        "Poor communication while manoeuvring the bed.",
        "Not requesting help when the transport cannot be completed safely."
      ]
    },
    quiz: [
      { q: "When should return-to-ward transport begin?", options: ["When the PCA is ready", "After the responsible Recovery staff authorise it", "Immediately after surgery"], answer: 1 },
      { q: "Who does the Recovery PCA assist during collection?", options: ["The collecting ward nurse", "A visitor", "Nobody"], answer: 0 },
      { q: "What should happen if the bed cannot be manoeuvred safely?", options: ["Force it through", "Stop and request appropriate assistance", "Leave the patient alone"], answer: 1 }
    ]
  },
  {
    id: "prep-support",
    area: "prep",
    number: 5,
    title: "Prep Area and Theatre Support",
    summary: "Work safely across East and West Prep while supporting patient transfers and theatre activity.",
    duration: "30 min",
    lesson: {
      objective: "Describe the PCA role in East and West Prep, including patient transfers and theatre support.",
      why: "Coordinated support helps clinical teams prepare patients, rooms and equipment safely and efficiently.",
      steps: [
        "Confirm the assigned East or West Prep area and theatre allocation at the start of the rotation.",
        "Learn the local operating-theatre layout: there are 16 theatres in the department and no Theatre 13.",
        "Follow direction from the responsible nurse or clinical team while remaining within PCA responsibilities.",
        "Prepare the space and required non-clinical equipment using the approved local checklist.",
        "Assist with patient movement from the bed to the operating table using the approved manual-handling plan and equipment.",
        "Use the required number of trained staff and pause the transfer if conditions are unsafe.",
        "Support room turnover and locate approved instruments, supplies or equipment when directed.",
        "Report missing items, equipment faults, hazards or uncertainty to the appropriate staff member."
      ],
      mistakes: [
        "Starting a patient transfer without the agreed plan and team.",
        "Using equipment without checking that it is approved and ready.",
        "Confusing East and West Prep allocations or theatre destinations.",
        "Performing tasks outside the PCA role."
      ]
    },
    quiz: [
      { q: "What should happen before a patient transfer to the operating table?", options: ["The approved plan, staff and equipment should be confirmed", "The PCA should move the patient alone", "The bed should be left unlocked"], answer: 0 },
      { q: "What should a PCA do when equipment is missing or faulty?", options: ["Improvise", "Report it through the local process", "Hide the equipment"], answer: 1 },
      { q: "What are the two Prep areas?", options: ["North and South", "East and West", "Ward and Clinic"], answer: 1 }
    ]
  },
  {
    id: "infection",
    area: "prep",
    number: 6,
    title: "Infection Prevention and PPE",
    summary: "Apply approved PPE, cleaning, waste and contamination controls during theatre turnover.",
    duration: "30 min",
    lesson: {
      objective: "Follow hospital-approved infection-prevention and theatre-cleaning processes during PCA duties.",
      why: "Consistent PPE and cleaning practice protects patients, staff and the theatre environment.",
      steps: [
        "Review the required cleaning level, precaution signage and approved local procedure before starting.",
        "Perform hand hygiene and select PPE according to the task and local risk assessment.",
        "Use only approved cleaning products, equipment, dilution and contact times.",
        "Work through the approved theatre-turnover sequence, including the operating table, patient surfaces and high-touch points.",
        "Keep clean and contaminated equipment separate and change PPE as required between tasks.",
        "Handle linen, waste and sharps only through the approved hospital processes.",
        "Mop using the approved direction and technique, then complete the final room inspection.",
        "Report spills, exposure incidents, damaged equipment, shortages or unusual contamination immediately."
      ],
      mistakes: [
        "Using gloves as a substitute for hand hygiene.",
        "Using the wrong product or not allowing the approved contact time.",
        "Moving contaminated items into a clean area.",
        "Missing high-touch surfaces or skipping the final inspection."
      ]
    },
    quiz: [
      { q: "Do gloves replace hand hygiene?", options: ["Yes", "No", "Only during busy periods"], answer: 1 },
      { q: "What must guide PPE and cleaning product selection?", options: ["Personal preference", "The approved procedure, task risk and signage", "What was used on another shift"], answer: 1 },
      { q: "What should happen after a possible exposure incident?", options: ["Follow the approved reporting and exposure process immediately", "Wait for symptoms", "Finish every other task first"], answer: 0 }
    ]
  }
];

window.COMPETENCY_ITEMS = [
  "Follows the approved pickup, identification and handover process",
  "Checks beds, equipment and routes before patient transport",
  "Manoeuvres beds safely and requests assistance when required",
  "Works within the PCA role and escalates concerns appropriately",
  "Uses the approved patient-transfer and manual-handling process",
  "Follows hand hygiene, PPE and theatre-cleaning requirements",
  "Completes final safety and quality checks"
];

// Preview reporting data for the read-only management dashboard. This is kept
// separate from approved training content so management users can see workforce
// status without being given access to lessons, quizzes or clinical procedures.
window.MANAGEMENT_DEPARTMENTS = [
  { name: "Operating Theatre & Recovery", staff: 42, complete: 79, signoffs: 4, compliance: "On track", tone: "success" },
  { name: "Day Surgery", staff: 18, complete: 68, signoffs: 3, compliance: "Attention", tone: "warning" },
  { name: "Acute Surgical Unit", staff: 31, complete: 84, signoffs: 2, compliance: "On track", tone: "success" },
  { name: "Dialysis", staff: 24, complete: 91, signoffs: 1, compliance: "On track", tone: "success" },
  { name: "Gastro", staff: 16, complete: 63, signoffs: 3, compliance: "Attention", tone: "warning" },
  { name: "Emergency Department", staff: 55, complete: 72, signoffs: 5, compliance: "At risk", tone: "danger" }
];

window.MANAGEMENT_SIGNOFFS = [
  { staff: "Maya Chen", role: "PCA", department: "Operating Theatre & Recovery", competency: "Patient transport", waiting: "2 days" },
  { staff: "Noah Williams", role: "Cleaner", department: "Emergency Department", competency: "Infection prevention", waiting: "3 days" },
  { staff: "Priya Nair", role: "PCA", department: "Day Surgery", competency: "Safe patient movement", waiting: "4 days" },
  { staff: "Liam Osei", role: "Cleaner", department: "Gastro", competency: "Room turnover", waiting: "5 days" }
];

window.MANAGEMENT_ALERTS = [
  { level: "High", title: "Mandatory refreshers overdue", detail: "6 Emergency Department staff require infection-prevention refreshers.", due: "Action now", tone: "danger" },
  { level: "Medium", title: "Completion below target", detail: "Gastro training completion is 63%, below the 75% monthly target.", due: "Due 16 Aug", tone: "warning" },
  { level: "Medium", title: "Sign-offs awaiting review", detail: "3 Day Surgery competencies have been awaiting trainer review for more than 48 hours.", due: "Due 14 Aug", tone: "warning" }
];

const MANAGEMENT_NAMES = ["Maya Chen", "Noah Williams", "Priya Nair", "Liam Osei", "Amelia Brooks", "Ethan Okafor", "Sofia Patel", "Jack Nguyen"];

window.MANAGEMENT_REPORTS = Object.fromEntries([
  ["operating-theatre", 24, 12, 3, 2, 29, 8, 2, 79],
  ["day-surgery", 10, 6, 2, 1, 11, 5, 1, 68],
  ["acute-surgical-unit", 18, 9, 2, 2, 24, 4, 1, 84],
  ["dialysis", 13, 8, 2, 1, 20, 3, 0, 91],
  ["gastro", 9, 5, 1, 1, 9, 4, 2, 63],
  ["emergency-department", 31, 18, 4, 2, 37, 12, 6, 72]
].map(([id, pca, cleaners, pcaTrainers, cleanerTrainers, completed, inProgress, overdue, progress], departmentIndex) => {
  const department = window.MANAGEMENT_DEPARTMENTS[departmentIndex];
  const staff = MANAGEMENT_NAMES.map((name, index) => {
    const isOverdue = index < Math.min(overdue, 2);
    const isComplete = !isOverdue && index % 3 === 0;
    return {
      name,
      id: `SW-${departmentIndex + 1}${String(index + 1).padStart(2, "0")}`,
      role: index % 3 === 1 ? "Cleaner" : index === 7 ? "PCA Trainer" : "PCA",
      progress: isOverdue ? 46 + index * 3 : isComplete ? 100 : 64 + index * 4,
      status: isOverdue ? "Overdue" : isComplete ? "Completed" : "In progress",
      tone: isOverdue ? "danger" : isComplete ? "success" : "warning",
      due: isOverdue ? "Overdue" : isComplete ? "Complete" : `${18 + index} Aug 2026`
    };
  });
  const signoffs = staff.slice(0, Math.min(department.signoffs, 4)).map((person, index) => ({
    staff: person.name,
    role: person.role,
    competency: index % 2 ? "Infection prevention" : "Safe patient movement",
    waiting: `${index + 2} days`
  }));
  const alerts = overdue ? [{
    level: overdue > 3 ? "High" : "Medium",
    title: "Mandatory training overdue",
    detail: `${overdue} ${department.name} staff require follow-up.`,
    due: "Action now",
    tone: "danger"
  }] : [];
  if (progress < 75) alerts.push({ level: "Medium", title: "Completion below target", detail: `Completion is ${progress}%, below the 75% target.`, due: "Due 16 Aug", tone: "warning" });
  return [id, { pca, cleaners, pcaTrainers, cleanerTrainers, completed, inProgress, overdue, progress, staff, signoffs, alerts }];
}));

// Preview identity and workflow records. This adapter-shaped data is deliberately
// separate from routing and UI so authentication/database services can replace it.
window.TRAINER_DIRECTORY = [
  { id: "trainer-pca-aisha", name: "Aisha Rahman", role: "pca-trainer", departments: ["operating-theatre", "day-surgery"] },
  { id: "trainer-pca-daniel", name: "Daniel Okoro", role: "pca-trainer", departments: ["acute-surgical-unit"] },
  { id: "trainer-cleaner-grace", name: "Grace Mensah", role: "cleaner-trainer", departments: ["operating-theatre", "gastro"] },
  { id: "trainer-cleaner-tom", name: "Tom Nguyen", role: "cleaner-trainer", departments: ["day-surgery", "emergency-department"] }
];

window.TRAINEE_RECORDS = [
  { id: "SW-OT-101", name: "Maya Chen", role: "PCA", department: "operating-theatre", progress: 100, overdue: false, reviewStatus: "Pending review", status: "Ready for Trainer Review", modules: { completed: ["Patient Pickup and PRA Workflow", "Patient Transport and Bed Safety", "Recovery Area Workflow", "Return-to-Ward Transport", "Prep Area and Theatre Support", "Infection Prevention and PPE"], remaining: [] }, knowledge: [{ module: "Patient transport", score: 93 }, { module: "Infection prevention", score: 87 }], observations: [{ date: "10 Aug 2026, 14:20", result: "Competent", note: "Safe bed checks and clear handover." }], feedback: "Ready for final observed transfer.", history: [{ actor: "Maya Chen", role: "PCA", action: "Completed required training", at: "9 Aug 2026, 16:10", detail: "All knowledge checks passed", previousStatus: "In Progress", newStatus: "Ready for Trainer Review" }] },
  { id: "SW-OT-102", name: "Ethan Okafor", role: "PCA", department: "operating-theatre", progress: 72, overdue: true, reviewStatus: "Not ready", status: "In Progress", modules: { completed: ["Patient Pickup and PRA Workflow", "Patient Transport and Bed Safety", "Recovery Area Workflow", "Return-to-Ward Transport"], remaining: ["Prep Area and Theatre Support", "Infection Prevention and PPE"] }, knowledge: [{ module: "Patient transport", score: 80 }, { module: "Recovery workflow", score: 73 }], observations: [], feedback: "Complete remaining modules before observation.", history: [{ actor: "System", role: "Platform", action: "Training became overdue", at: "8 Aug 2026, 09:00", detail: "Due date passed", previousStatus: "In Progress", newStatus: "In Progress" }] },
  { id: "SW-DS-201", name: "Priya Nair", role: "PCA", department: "day-surgery", progress: 100, overdue: false, reviewStatus: "Management review", status: "Sent to Management", modules: { completed: ["Day Surgery readiness", "Safe patient movement"], remaining: [] }, knowledge: [{ module: "Day Surgery readiness", score: 90 }], observations: [{ date: "11 Aug 2026, 11:15", result: "Competent", note: "Consistent safe transfer technique." }], feedback: "Recommended for approval.", history: [{ actor: "Aisha Rahman", role: "PCA Trainer", action: "Submitted sign-off recommendation", at: "11 Aug 2026, 11:30", detail: "Competency demonstrated", previousStatus: "Ready for Trainer Review", newStatus: "Sent to Management" }] },
  { id: "SW-OT-301", name: "Noah Williams", role: "Cleaner", department: "operating-theatre", progress: 100, overdue: false, reviewStatus: "Reassessment", status: "Reassessment Required", modules: { completed: ["Theatre room turnover", "PPE and waste handling"], remaining: [] }, knowledge: [{ module: "PPE and waste handling", score: 87 }], observations: [{ date: "7 Aug 2026, 15:05", result: "Needs reassessment", note: "Repeat spill-response sequence." }], feedback: "Management: Repeat spill-response observation with correct escalation steps.", history: [{ actor: "Sarah Collins", role: "Management", action: "Requested reassessment", at: "8 Aug 2026, 10:40", detail: "Repeat spill-response observation with correct escalation steps", previousStatus: "Sent to Management", newStatus: "Reassessment Required" }] },
  { id: "SW-GA-302", name: "Liam Osei", role: "Cleaner", department: "gastro", progress: 84, overdue: false, reviewStatus: "In progress", status: "In Progress", modules: { completed: ["Cleaning zones", "Chemical safety"], remaining: ["Procedure-room turnover"] }, knowledge: [{ module: "Chemical safety", score: 93 }], observations: [], feedback: "", history: [{ actor: "Liam Osei", role: "Cleaner", action: "Passed knowledge check", at: "10 Aug 2026, 13:20", detail: "Chemical safety: 93%", previousStatus: "In Progress", newStatus: "In Progress" }] }
];
