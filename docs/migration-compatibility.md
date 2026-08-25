# Migration compatibility and record preservation

Phase 9 adds one data-preserving migration that replaces six stored-function bodies to remove PL/pgSQL ambiguity and enum-inference errors. Function signatures, grants and authorization checks remain unchanged. The phase also proves that the complete ordered migration chain can upgrade a production-shaped database without losing or changing legacy records.

## Compatibility boundary

The automated test resets an isolated local database to `20260823180919_shared_domain_model.sql`, loads fictional legacy records, records before counts and stable checksums, applies every later migration in timestamp order, then records and verifies the after state. It never connects to a linked or hosted project.

The fixture covers organisations, facilities, departments, user profiles, memberships, role assignments, legacy pathways/modules/lessons/questions, assignments, progress, attempts, observations, recommendations, competency, renewal, notifications, invitations, transfers, audits, the shared versioned pathway model and the legacy-to-shared mapping register.

## Legacy-to-current map

| Legacy record | Current record | Preservation rule |
|---|---|---|
| `training_pathways` | `learning_pathways` + `learning_pathway_versions` | Legacy row remains intact; mapping identifies the current versioned pathway. |
| `training_modules` | `learning_modules` | Legacy module remains intact; mapping records its current module. |
| `lessons` | `learning_module_items` | Legacy lesson remains intact; mapping records its current item. |
| `training_assignments` and `module_progress` | Assignment, attempt and competency workflow tables | Existing status, due date and progress remain unchanged; later tables are additive. |
| Hospital membership roles | Organisation role profiles | Existing sector title remains; stable permission profile is backfilled. |

## Verification evidence

`scripts/verify-migration-compatibility.sh` is a protected CI step. It fails on any row-count difference, checksum difference, missing membership backfill, missing RLS or missing forced RLS. CI then performs a separate clean reset, database lint and every pgTAP assertion. This gives both supported paths: a clean installation and an in-place upgrade.

Future migrations must follow expand → migrate → verify → contract. Destructive contracts require a separate release, explicit retention review, backup confirmation and rollback rehearsal; they must not be combined with an unverified data move.
