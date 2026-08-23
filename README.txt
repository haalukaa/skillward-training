SkillWard — Healthcare Learning, Competency and Compliance Platform

HOW TO OPEN
1. Unzip the downloaded file.
2. Open the folder.
3. Double-click index.html.
4. Use a modern browser such as Chrome, Edge, Safari or Firefox.

WHAT IS INCLUDED
- Staff / Learner login
- Trainer login
- Six training modules
- Learner dashboard
- Lesson pages
- Knowledge checks
- 80% quiz pass mark
- Saved progress using browser localStorage
- Department-scoped PCA and Cleaner trainer dashboards
- Management trainer assignments and final competency approval
- Audited trainer recommendation and reassessment workflow
- Department-scoped management dashboards with staff, progress, competency and compliance reporting
- Four-item authenticated navigation with a desktop side menu and mobile bottom bar
- Management access boundary that excludes clinical lessons, assessments and content editing
- Practical competency sign-off
- Mobile-friendly layout
- SkillWard healthcare brand system
- Two-panel staff and trainer sign-in experience
- Redesigned learner progress dashboard
- Enhanced module cards and trainer workspace
- Department training directory
- Operating Theatre & Recovery active with Day Surgery, ASU, Dialysis, Gastro and ED roadmap
- Operating Theatre & Recovery pathway organised into PRA, Recovery and Prep areas
- Six area-based modules following the patient journey from ward pickup to theatre support
- Custom SkillWard SW medical-shield logo and browser icon
- Enterprise-style access screen with clearer brand and learning hierarchy
- Professional co-founder credit for Haleluya Yilma and Abdulkader
- Dedicated iPhone, Android and browser app icons using the SkillWard shield
- Custom healthcare icon system for all six department cards
- Responsive patient-journey visual from ward pickup through PRA, theatre, Recovery and return to ward

IMPORTANT LIMITATIONS
- Demo Mode is a front-end preview and saves sample progress only in the browser.
- Authenticated workspaces use Supabase Auth, PostgreSQL RLS and organisation-scoped records.
- The Phase 1 multi-organisation foundation is not yet approved for production hospital use.
- There are no hospital integrations.
- Preview procedures must not be treated as final clinical or workplace instructions.
- All content must be reviewed and approved by the hospital, infection-control team, education team and relevant managers.

NEXT DEVELOPMENT STAGE
1. Confirm the complete module list with the trainer.
2. Replace preview text with approved procedures.
3. Add approved photos and videos.
4. Review and stabilise the Phase 1 organisation/security migration.
5. Build the Phase 2 pathway authoring and clinical approval workflow.
6. Add certificates, refresher dates and reporting.
7. Pilot with a small number of staff.

DATABASE FOUNDATION
See docs/database.md and docs/multi-organization-foundation.md for the version-controlled Supabase schema, permission model, tests and setup. Demo Mode remains deliberately independent of Supabase.

SUPABASE AUTHENTICATION DEVELOPMENT INTEGRATION
See docs/authentication.md for the authentication architecture, Demo Mode separation, GitHub Pages configuration, exact redirect URLs, invitation limitation, troubleshooting, and production requirements. Public sign-up is not provided. Authenticated role and department access come only from RLS-protected database records.
