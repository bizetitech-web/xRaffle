INSERT IGNORE INTO roles (id, name, description, level) VALUES
('79a386a5-207b-11f1-89b6-a4e078b831cc', 'super_admin', 'System super administrator', 1),
('79a386a6-207b-11f1-89b6-a4e078b831cc', 'org_admin', 'Hotel administrator', 2),
('79a386a7-207b-11f1-89b6-a4e078b831cc', 'operator', 'Hotel branch game operator', 3);

-- Ensure legacy databases converge to canonical role names/levels for fixed role IDs.
UPDATE roles SET name = 'super_admin', description = 'System super administrator', level = 1
WHERE id = '79a386a5-207b-11f1-89b6-a4e078b831cc';
UPDATE roles SET name = 'org_admin', description = 'Hotel administrator', level = 2
WHERE id = '79a386a6-207b-11f1-89b6-a4e078b831cc';
UPDATE roles SET name = 'operator', description = 'Hotel branch game operator', level = 3
WHERE id = '79a386a7-207b-11f1-89b6-a4e078b831cc';

DELETE FROM roles WHERE id = '79a386a8-207b-11f1-89b6-a4e078b831cc';

INSERT IGNORE INTO permissions (id, name, module, description) VALUES
('89a386a1-207b-11f1-89b6-a4e078b831cc', 'MANAGE_USERS', 'admin', 'Create, update, and deactivate users'),
('89a386a2-207b-11f1-89b6-a4e078b831cc', 'MANAGE_ROLES', 'admin', 'Create and manage roles and role permissions'),
('89a386a3-207b-11f1-89b6-a4e078b831cc', 'MANAGE_HOTELS', 'admin', 'Create and update hotels'),
('89a386b0-207b-11f1-89b6-a4e078b831cc', 'MANAGE_HOTEL', 'admin', 'Manage own hotel scope resources'),
('89a386af-207b-11f1-89b6-a4e078b831cc', 'MANAGE_FEE_TEMPLATES', 'admin', 'Manage hotel fee templates'),
('89a386a4-207b-11f1-89b6-a4e078b831cc', 'VIEW_AUDIT_LOGS', 'admin', 'View audit log entries'),
('89a386a5-207b-11f1-89b6-a4e078b831cc', 'VIEW_WALLET', 'wallet', 'View wallet balances and transactions'),
('89a386a6-207b-11f1-89b6-a4e078b831cc', 'TOPUP_WALLET', 'wallet', 'Top up company wallet balances'),
('89a386a7-207b-11f1-89b6-a4e078b831cc', 'MANAGE_GAMES', 'games', 'Create and configure games'),
('89a386a8-207b-11f1-89b6-a4e078b831cc', 'VIEW_GAMES', 'games', 'View games and game details'),
('89a386a9-207b-11f1-89b6-a4e078b831cc', 'SELL_CARDS', 'games', 'Sell game cards during active games'),
('89a386aa-207b-11f1-89b6-a4e078b831cc', 'RUN_DRAWS', 'games', 'Start and execute game draws'),
('89a386ab-207b-11f1-89b6-a4e078b831cc', 'VIEW_WINNERS', 'games', 'View winners for game draws'),
('89a386ac-207b-11f1-89b6-a4e078b831cc', 'CLAIM_PRIZES', 'games', 'Claim winner prizes'),
('89a386ad-207b-11f1-89b6-a4e078b831cc', 'VIEW_REPORTS', 'reports', 'View branch and company operational reports'),
('89a386b1-207b-11f1-89b6-a4e078b831cc', 'VIEW_DAILY_REPORTS', 'reports', 'View daily branch and company reports by role scope'),
('89a386ae-207b-11f1-89b6-a4e078b831cc', 'VIEW_GLOBAL_REPORTS', 'reports', 'View global cross-company reports');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN ('MANAGE_USERS', 'MANAGE_ROLES', 'MANAGE_HOTELS', 'MANAGE_HOTEL', 'MANAGE_FEE_TEMPLATES', 'VIEW_AUDIT_LOGS', 'VIEW_WALLET', 'TOPUP_WALLET', 'MANAGE_GAMES', 'VIEW_GAMES', 'SELL_CARDS', 'RUN_DRAWS', 'VIEW_WINNERS', 'CLAIM_PRIZES', 'VIEW_REPORTS', 'VIEW_DAILY_REPORTS', 'VIEW_GLOBAL_REPORTS')
WHERE r.name = 'super_admin';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN ('MANAGE_USERS', 'MANAGE_HOTEL', 'MANAGE_FEE_TEMPLATES', 'VIEW_AUDIT_LOGS', 'VIEW_WALLET', 'TOPUP_WALLET', 'VIEW_DAILY_REPORTS')
WHERE r.name = 'org_admin';

-- Backfill required org_admin permissions by stable role ID for legacy rows.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT '79a386a6-207b-11f1-89b6-a4e078b831cc', p.id
FROM permissions p
WHERE p.name IN ('MANAGE_USERS', 'MANAGE_HOTEL', 'MANAGE_FEE_TEMPLATES', 'VIEW_AUDIT_LOGS', 'VIEW_WALLET', 'TOPUP_WALLET', 'VIEW_DAILY_REPORTS');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN ('MANAGE_GAMES', 'VIEW_GAMES', 'SELL_CARDS', 'RUN_DRAWS', 'VIEW_WINNERS', 'CLAIM_PRIZES', 'VIEW_DAILY_REPORTS')
WHERE r.name = 'operator';

DELETE rp
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
LEFT JOIN permissions p ON p.id = rp.permission_id
WHERE r.name = 'org_admin'
	AND p.name NOT IN ('MANAGE_USERS', 'MANAGE_HOTEL', 'MANAGE_FEE_TEMPLATES', 'VIEW_AUDIT_LOGS', 'VIEW_WALLET', 'TOPUP_WALLET', 'VIEW_DAILY_REPORTS');

DELETE rp
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
LEFT JOIN permissions p ON p.id = rp.permission_id
WHERE r.name = 'operator'
	AND p.name NOT IN ('MANAGE_GAMES', 'VIEW_GAMES', 'SELL_CARDS', 'RUN_DRAWS', 'VIEW_WINNERS', 'CLAIM_PRIZES', 'VIEW_DAILY_REPORTS');
