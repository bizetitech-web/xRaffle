import pool from '../config/database.js';

async function run() {
  const [roles] = await pool.query('SELECT id, name, level FROM roles ORDER BY level ASC');
  console.log('ROLES', JSON.stringify(roles));

  const [rows] = await pool.query(
    "SELECT r.name AS roleName, p.name AS permissionName FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE r.name IN ('super_admin','org_admin','operator') ORDER BY r.level ASC, p.name ASC"
  );

  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.roleName]) grouped[row.roleName] = [];
    grouped[row.roleName].push(row.permissionName);
  }

  console.log('ROLE_PERMISSIONS', JSON.stringify(grouped));
}

run()
  .catch((error) => {
    console.error('VERIFY_ROLE_SEED_FAILED', error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
