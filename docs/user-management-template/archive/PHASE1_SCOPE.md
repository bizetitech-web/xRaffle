# Phase 1 Scope Lock: xRaffle

Date: 2026-05-03
Status: Locked for implementation

## Objective
Transform this codebase into a reusable starter focused only on user management.

## Included in v1
- Authentication: login, register, logout, refresh
- User management: create, list, update, deactivate
- Role-based access control (RBAC)
- Profile management
- Password reset script/tool
- Audit logs

## Multi-Tenancy Decision
- Keep organization-based multi-tenant support.
- Users remain organization-scoped.

## Registration Model Decision
- Public/self-registration is disabled for starter behavior.
- Only super admin can create users and organizations from admin flows.

## Default Roles to Seed
- superAdmin
- org_admin
- Manager
- Viewer

## Out-of-Scope Modules (to remove)
- HR
- Inventory
- Sales
- Purchasing
- Reports
- Tasks

## API Compatibility Decision
- Keep current API paths for compatibility.
- Avoid route/path renaming in this cleanup phase.

## Non-Goals for Phase 1
- No route/controller deletion yet.
- No database schema pruning yet.
- No UI navigation cleanup yet.

## Exit Criteria for Phase 1
- Scope documented and agreed.
- This document committed before structural cleanup.

## Next Step
Proceed to Phase 2 acceptance criteria and Phase 3 inventory mapping before code removal.
