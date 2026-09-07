import pool from '../config/database.js';

(async () => {
  try {
    const [permRows] = await pool.query(`SELECT p.* FROM permissions p WHERE p.name = ?`, ['MANAGE_FEE_TEMPLATES']);
    console.log('Permission rows:', permRows);
    const [assignRows] = await pool.query(`
      SELECT p.*, r.id as role_id, r.name as role_name
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      JOIN roles r ON rp.role_id = r.id
      WHERE p.name = ?
    `, ['MANAGE_FEE_TEMPLATES']);
    console.log('Role assignments:', assignRows);
  } catch (err) {
    console.error('DB check error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
