-- Migration 003: Seed core roles and minimum permissions

INSERT IGNORE INTO roles (id, name, description, level, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Super Admin', 'Platform super administrator', 99, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000002', 'Company Admin', 'Hotel/company administrator', 50, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000003', 'Branch Manager', 'Branch manager', 20, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000004', 'Seller', 'Card seller', 10, NOW(), NOW());

INSERT IGNORE INTO permissions (id, name, module, description, created_at)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'manage_companies', 'company', 'Manage hotel companies', NOW()),
  ('10000000-0000-0000-0000-000000000002', 'manage_wallet', 'wallet', 'Manage wallet accounts and topups', NOW()),
  ('10000000-0000-0000-0000-000000000003', 'manage_branches', 'branch', 'Manage hotel branches', NOW()),
  ('10000000-0000-0000-0000-000000000004', 'manage_users', 'user', 'Manage users and roles', NOW()),
  ('10000000-0000-0000-0000-000000000005', 'manage_games', 'game', 'Create and configure games', NOW()),
  ('10000000-0000-0000-0000-000000000006', 'manage_cards', 'card', 'Generate and sell cards', NOW()),
  ('10000000-0000-0000-0000-000000000007', 'manage_draws', 'draw', 'Run draws and compute winners', NOW()),
  ('10000000-0000-0000-0000-000000000008', 'manage_claims', 'claim', 'Handle prize claims', NOW()),
  ('10000000-0000-0000-0000-000000000009', 'view_reports', 'report', 'View reports and dashboards', NOW());

-- Assign permissions to roles (example: Super Admin gets all)
INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, NOW()
FROM roles r, permissions p
WHERE r.name = 'Super Admin';

-- Company Admin gets most permissions except platform-level
INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, NOW()
FROM roles r, permissions p
WHERE r.name = 'Company Admin' AND p.name NOT IN ('manage_companies');

-- Branch Manager gets branch, user, game, card, draw, claim, report
INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, NOW()
FROM roles r, permissions p
WHERE r.name = 'Branch Manager' AND p.name IN ('manage_branches','manage_users','manage_games','manage_cards','manage_draws','manage_claims','view_reports');

-- Seller gets only card sales and claims
INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, NOW()
FROM roles r, permissions p
WHERE r.name = 'Seller' AND p.name IN ('manage_cards','manage_claims');
