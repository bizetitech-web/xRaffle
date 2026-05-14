# Phase 4 Safety Checkpoint

Date: 2026-05-03
Status: Prepared

Purpose:
Create a safe rollback point before structural cleanup begins in Phase 5.

Note:
This document defines the checkpoint procedure and exact commands. It does not replace explicit approval for branch/tag creation or commits.

## Objectives
- Preserve the current full-featured project state.
- Create a dedicated workspace branch for template cleanup.
- Make rollback fast if Phase 5+ cleanup breaks auth, RBAC, or startup.
- Freeze the cleanup order so scope does not drift.

## Pre-Checkpoint Verification
Run these checks before creating the checkpoint:

1. Confirm you are in the project root.
2. Confirm the working tree status:
   git status --short
3. Review changed files:
   git diff --stat
4. Make sure the Phase 1, 2, and 3 docs exist:
   - docs/user-management-template/PHASE1_SCOPE.md
   - docs/user-management-template/PHASE2_ACCEPTANCE_CHECKLIST.md
   - docs/user-management-template/PHASE3_INVENTORY.md

## Recommended Branch Strategy
Use one cleanup branch dedicated to the starter conversion.

Recommended branch name:
- template/user-management-starter

Create branch:
- git checkout -b template/user-management-starter

## Recommended Backup Tag Strategy
Create a restore tag on the pre-cleanup state.

Recommended tag name:
- pre-template-cleanup-2026-05-03

Create tag:
- git tag pre-template-cleanup-2026-05-03

Push branch and tag if needed:
- git push -u origin template/user-management-starter
- git push origin pre-template-cleanup-2026-05-03

## Recommended Snapshot Commit
If there are uncommitted local changes that belong in the checkpoint, create a snapshot commit before cleanup.

Suggested commit message:
- chore: checkpoint before user-management template cleanup

Commands:
- git add .
- git commit -m "chore: checkpoint before user-management template cleanup"

## Rollback Procedure
If cleanup fails or scope drifts:

1. Return to the checkpoint tag in a throwaway branch:
   git checkout -b restore/pre-template-cleanup pre-template-cleanup-2026-05-03
2. Compare broken branch against checkpoint:
   git diff pre-template-cleanup-2026-05-03..template/user-management-starter --stat
3. Reapply only validated slices from the cleanup branch.

## Protected Execution Rules For Phase 5+
- Remove mounted routes before deleting dependent controllers.
- Refactor active frontend routing before deleting pages.
- Extract starter-safe database schema before removing domain SQL.
- Validate after each slice using the Phase 2 checklist.
- Do not remove auth, admin, RBAC, or database connection foundations in the first cleanup pass.

## First Cleanup Slice After Checkpoint
Start with the lowest-risk control points:

1. Refactor server/server.js to unmount removed modules.
2. Refactor client/src/App.jsx to remove out-of-scope routes.
3. Refactor client/src/components/layout/Sidebar.jsx to remove out-of-scope navigation.

## Sign-Off
- Checkpoint branch created: [ ] Yes [ ] No
- Checkpoint tag created: [ ] Yes [ ] No
- Snapshot commit created if needed: [ ] Yes [ ] No
- Ready for Phase 5: [ ] Yes [ ] No
