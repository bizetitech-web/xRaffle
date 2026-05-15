INSERT IGNORE INTO roles (id, name, description, level) VALUES
('79a386a5-207b-11f1-89b6-a4e078b831cc', 'super_admin', 'System super administrator', 1),
('79a386a6-207b-11f1-89b6-a4e078b831cc', 'org_admin', 'Hotel administrator', 2),
('79a386a7-207b-11f1-89b6-a4e078b831cc', 'manager', 'Hotel manager', 3),
('79a386a8-207b-11f1-89b6-a4e078b831cc', 'viewer', 'Read-only user', 8);

INSERT IGNORE INTO permissions (id, name, module, description) VALUES
('89a386a1-207b-11f1-89b6-a4e078b831cc', 'MANAGE_USERS', 'admin', 'Create, update, and deactivate users'),
('89a386a2-207b-11f1-89b6-a4e078b831cc', 'MANAGE_ROLES', 'admin', 'Create and manage roles and role permissions'),
('89a386a3-207b-11f1-89b6-a4e078b831cc', 'MANAGE_HOTELS', 'admin', 'Create and update hotels'),
('89a386a4-207b-11f1-89b6-a4e078b831cc', 'VIEW_AUDIT_LOGS', 'admin', 'View audit log entries');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN ('MANAGE_USERS', 'MANAGE_ROLES', 'MANAGE_HOTELS', 'VIEW_AUDIT_LOGS')
WHERE r.name = 'super_admin';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN ('MANAGE_USERS', 'MANAGE_HOTELS', 'VIEW_AUDIT_LOGS')
WHERE r.name = 'org_admin';
