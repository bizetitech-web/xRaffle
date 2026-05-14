# Phase Docs Archive Plan

Date: 2026-05-08
Status: Executed (Option A)

## Goal

Reduce operator-facing noise in template documentation by separating historical phase execution artifacts from active starter guidance.

## Current Phase Documents

- PHASE1_SCOPE.md
- PHASE2_ACCEPTANCE_CHECKLIST.md
- PHASE3_INVENTORY.md
- PHASE3_CLEANUP_CHECKLIST.md
- PHASE4_SAFETY_CHECKPOINT.md

## Keep Visible (Operator-Facing)

Keep in docs/user-management-template:

- QUICKSTART.md
- PHASE3_CLEANUP_CHECKLIST.md (optional to keep visible if used as release gate record)

## Archive as Historical

Move to historical archive folder:

- PHASE1_SCOPE.md
- PHASE2_ACCEPTANCE_CHECKLIST.md
- PHASE3_INVENTORY.md
- PHASE4_SAFETY_CHECKPOINT.md

Optional archive candidate:

- PHASE3_CLEANUP_CHECKLIST.md (if you want only quickstart-facing docs in public template surface)

## Proposed Target Structure

Option A (recommended):

- docs/user-management-template/QUICKSTART.md
- docs/user-management-template/PHASE3_CLEANUP_CHECKLIST.md
- docs/user-management-template/archive/PHASE1_SCOPE.md
- docs/user-management-template/archive/PHASE2_ACCEPTANCE_CHECKLIST.md
- docs/user-management-template/archive/PHASE3_INVENTORY.md
- docs/user-management-template/archive/PHASE4_SAFETY_CHECKPOINT.md

Option B (strict public docs):

- docs/user-management-template/QUICKSTART.md
- docs/user-management-template/archive/all phase files, including PHASE3_CLEANUP_CHECKLIST.md

## Execution Steps

1. Create docs/user-management-template/archive.
2. Move selected phase files into archive.
3. Update README.md documentation links.
4. Add a short note in QUICKSTART.md that phase artifacts are historical and optional.
5. Run a final link check by opening referenced files from README and QUICKSTART.

## Acceptance Criteria

- Root README points to active docs only.
- Quickstart remains first-stop onboarding doc.
- Historical phase artifacts are still available but not mixed with operator instructions.
- No broken documentation links after moves.

## Rollback

If consumers still rely on phase files in original locations:

1. Move files back to docs/user-management-template.
2. Keep archive plan as documentation-only until a later release.

## Execution Record

- 2026-05-08: Option A executed.
- Moved to archive: PHASE1_SCOPE.md, PHASE2_ACCEPTANCE_CHECKLIST.md, PHASE3_INVENTORY.md, PHASE4_SAFETY_CHECKPOINT.md.
- Kept visible: QUICKSTART.md and PHASE3_CLEANUP_CHECKLIST.md.
