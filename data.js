window.TRAINING_MODULES = [
  {
    id: "orientation",
    title: "Department Orientation",
    summary: "Understand the theatre environment, PCA responsibilities, team roles and daily workflow.",
    duration: "15 min",
    lesson: {
      objective: "Identify key theatre areas, understand the PCA role and know when to escalate concerns.",
      why: "Clear role understanding improves teamwork, reduces confusion and supports safe patient care.",
      steps: [
        "Review the department layout and identify restricted, semi-restricted and unrestricted areas.",
        "Learn the role of the PCA, nurses, technicians, orderlies and medical staff.",
        "Review the daily workflow from morning setup through end-of-day duties.",
        "Identify who to contact for operational, patient-safety and equipment concerns.",
        "Understand local communication expectations and escalation pathways."
      ],
      mistakes: [
        "Entering restricted areas without following local requirements.",
        "Not knowing who to escalate a concern to.",
        "Assuming every theatre follows the same local workflow."
      ]
    },
    quiz: [
      { q: "Why is department orientation important?", options: ["It replaces all practical training", "It helps staff understand roles, areas and escalation pathways", "It is only needed for managers"], answer: 1 },
      { q: "What should a new PCA do when unsure about a local procedure?", options: ["Guess", "Ask the trainer or relevant supervisor", "Wait until the end of the week"], answer: 1 },
      { q: "Who should approve the final content for this module?", options: ["The software creator alone", "Hospital-approved trainers and relevant departments", "Any learner"], answer: 1 }
    ]
  },
  {
    id: "infection",
    title: "Infection Prevention and PPE",
    summary: "Learn the structure for hand hygiene, PPE, contamination awareness and safe escalation.",
    duration: "20 min",
    lesson: {
      objective: "Apply hospital-approved infection prevention principles during PCA duties.",
      why: "Consistent infection-control practice helps protect patients, staff and the theatre environment.",
      steps: [
        "Follow the approved hand-hygiene moments and local procedure.",
        "Select PPE according to the task, signage and local risk assessment.",
        "Separate clean and contaminated items.",
        "Avoid touching clean surfaces with contaminated gloves or equipment.",
        "Report spills, exposure incidents or uncertainty immediately."
      ],
      mistakes: [
        "Using gloves as a substitute for hand hygiene.",
        "Moving between clean and contaminated tasks without changing PPE.",
        "Ignoring isolation or precaution signage."
      ]
    },
    quiz: [
      { q: "Do gloves replace hand hygiene?", options: ["Yes", "No", "Only during busy periods"], answer: 1 },
      { q: "What should guide PPE selection?", options: ["Personal preference", "Task risk, signage and approved procedure", "What another person wore yesterday"], answer: 1 },
      { q: "What should happen after a possible exposure incident?", options: ["Keep working and mention it later", "Follow the approved reporting and exposure process immediately", "Do nothing if no symptoms appear"], answer: 1 }
    ]
  },
  {
    id: "transport",
    title: "Patient Transport and Trolley Safety",
    summary: "Prepare, inspect and use a patient trolley safely before transport.",
    duration: "20 min",
    lesson: {
      objective: "Inspect and prepare a patient trolley according to the approved department procedure.",
      why: "Correct trolley preparation reduces delays and helps prevent injury, contamination and equipment failure.",
      steps: [
        "Perform hand hygiene according to the approved procedure.",
        "Confirm the trolley is the correct type for the patient and task.",
        "Inspect the trolley for damage, contamination or missing parts.",
        "Apply the brakes and check that the trolley is stable.",
        "Check wheels, rails, steering controls, mattress and attachments.",
        "Prepare approved linen and remove unnecessary items.",
        "Complete a final safety check before transport.",
        "Remove unsafe equipment from use and report the fault."
      ],
      mistakes: [
        "Not checking the brakes.",
        "Using damaged or contaminated equipment.",
        "Forgetting the final safety inspection.",
        "Not reporting a fault."
      ]
    },
    quiz: [
      { q: "What should be checked before transport?", options: ["Only the linen", "Brakes, rails, wheels and general condition", "Only the mattress"], answer: 1 },
      { q: "What should happen if the trolley is unsafe?", options: ["Use it carefully", "Remove it from use and report it", "Leave it for another shift"], answer: 1 },
      { q: "Why complete a final safety check?", options: ["To identify missed hazards", "To replace practical training", "Only for long-distance transport"], answer: 0 }
    ]
  },
  {
    id: "theatre-prep",
    title: "Theatre Preparation",
    summary: "Use an approved checklist to prepare the room, equipment and supplies.",
    duration: "20 min",
    lesson: {
      objective: "Support safe and consistent theatre preparation using the local checklist.",
      why: "A structured preparation process reduces missing items, delays and repeated work.",
      steps: [
        "Review the theatre list and local preparation checklist.",
        "Confirm required beds, trolleys and approved accessories are available.",
        "Check visible equipment condition and report faults.",
        "Restock only approved items to the correct location.",
        "Keep walkways and emergency access points clear.",
        "Complete the final room readiness check with the relevant staff member."
      ],
      mistakes: [
        "Restocking items in the wrong location.",
        "Blocking access routes.",
        "Not reporting missing or damaged equipment."
      ]
    },
    quiz: [
      { q: "What should guide theatre preparation?", options: ["Memory only", "The approved local checklist and theatre requirements", "A checklist from another hospital"], answer: 1 },
      { q: "What should happen when equipment is visibly damaged?", options: ["Ignore it", "Report it and follow the local process", "Hide it"], answer: 1 },
      { q: "Why keep access routes clear?", options: ["For appearance only", "For safe movement and emergency access", "Only during inspections"], answer: 1 }
    ]
  },
  {
    id: "cleaning",
    title: "Theatre Cleaning and Turnover",
    summary: "Follow the approved sequence for surfaces, beds, tables, floors, waste and linen.",
    duration: "30 min",
    lesson: {
      objective: "Follow a consistent, approved theatre turnover and cleaning sequence.",
      why: "A clear sequence reduces missed surfaces, cross-contamination and complaints about incomplete cleaning.",
      steps: [
        "Confirm the required cleaning level and any additional precautions.",
        "Use approved PPE, products, equipment and contact times.",
        "Work from cleaner areas toward more contaminated areas as directed locally.",
        "Clean the operating table, patient surfaces and approved high-touch points.",
        "Handle waste and linen using the correct streams.",
        "Mop according to the approved direction and method.",
        "Inspect the room after cleaning and correct missed areas.",
        "Report spills, damage, shortages or unusual contamination."
      ],
      mistakes: [
        "Missing high-touch surfaces.",
        "Using the wrong product or contact time.",
        "Moving contaminated equipment into a clean area.",
        "Skipping the final inspection."
      ]
    },
    quiz: [
      { q: "What must guide the cleaning sequence?", options: ["Personal preference", "Approved local procedure and required cleaning level", "The fastest method"], answer: 1 },
      { q: "Why is contact time important?", options: ["It supports correct product use", "It is optional", "It only matters for floors"], answer: 0 },
      { q: "What should happen after cleaning?", options: ["Leave immediately", "Complete a final inspection and correct missed areas", "Wait for a complaint"], answer: 1 }
    ]
  },
  {
    id: "safety",
    title: "Waste, Sharps and Safety",
    summary: "Recognise hazards and follow local reporting, disposal and emergency processes.",
    duration: "20 min",
    lesson: {
      objective: "Identify common theatre hazards and follow approved safety processes.",
      why: "Early hazard recognition and correct escalation help prevent injury and exposure.",
      steps: [
        "Use the correct waste and linen streams.",
        "Never handle sharps outside the approved process.",
        "Keep access routes clear and manage trip hazards promptly.",
        "Follow the local spill and exposure procedure.",
        "Report damaged equipment, near misses and incidents.",
        "Know how to call for assistance during an emergency."
      ],
      mistakes: [
        "Putting items into the wrong waste stream.",
        "Trying to manage a sharps incident without following procedure.",
        "Failing to report a near miss."
      ]
    },
    quiz: [
      { q: "What should happen after a sharps or exposure incident?", options: ["Follow the approved process immediately", "Finish the shift first", "Only report if symptoms occur"], answer: 0 },
      { q: "Should near misses be reported?", options: ["No", "Yes, according to local procedure", "Only if management asks"], answer: 1 },
      { q: "What should guide waste disposal?", options: ["Bin colour memory alone", "Approved local waste-stream procedure", "The nearest available bin"], answer: 1 }
    ]
  }
];

window.COMPETENCY_ITEMS = [
  "Follows hand hygiene and PPE requirements",
  "Checks equipment before use",
  "Uses the correct sequence for the task",
  "Maintains clean and contaminated separation",
  "Communicates and escalates concerns appropriately",
  "Completes the final safety or quality check"
];
