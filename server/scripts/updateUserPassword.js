import bcrypt from 'bcryptjs';
import pool from '../config/database.js';

const BCRYPT_ROUNDS = 12;

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];

    if (!next || next.startsWith('--')) {
      args[key] = 'true';
    } else {
      args[key] = next;
      i += 1;
    }
  }

  return args;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  const email = (args.email || process.env.RESET_USER_EMAIL || '').trim().toLowerCase();
  const password = args.password || process.env.RESET_USER_PASSWORD;
  const organizationId = args.organizationId || process.env.RESET_USER_ORG_ID || null;

  if (!email) {
    throw new Error('Missing email. Provide --email or RESET_USER_EMAIL.');
  }

  if (!password) {
    throw new Error('Missing password. Provide --password or RESET_USER_PASSWORD.');
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    let query = 'SELECT id, organization_id, email FROM users WHERE email = ?';
    const queryParams = [email];

    if (organizationId) {
      query += ' AND organization_id = ?';
      queryParams.push(organizationId);
    }

    query += ' LIMIT 2';

    const [users] = await connection.query(query, queryParams);

    if (users.length === 0) {
      throw new Error('No matching user found for the provided criteria.');
    }

    if (users.length > 1) {
      throw new Error('Multiple users matched. Pass --organizationId to target a single account.');
    }

    const targetUser = users[0];
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await connection.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [passwordHash, targetUser.id]
    );

    await connection.commit();

    console.log('Password updated successfully.');
    console.log(`- User ID: ${targetUser.id}`);
    console.log(`- Email: ${targetUser.email}`);
    console.log(`- Organization ID: ${targetUser.organization_id}`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to update password:', error.message);
    process.exit(1);
  });