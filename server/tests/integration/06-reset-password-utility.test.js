import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import {
  loginAsAdmin,
  createOrganization,
  getRoleIdByName,
  createUser,
  loginWithCredentials,
  apiRequest,
} from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

function runResetPasswordScript({ email, password, hotelCompanyId }) {
  return new Promise((resolve, reject) => {
    const args = ['scripts/updateUserPassword.js', '--email', email, '--password', password, '--hotelCompanyId', hotelCompanyId];
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`reset script failed (${code}): ${stderr || stdout}`));
      }
    });

    child.on('error', reject);
  });
}

test('password reset utility updates login credentials for target user', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);
  const roleId = await getRoleIdByName(token, 'viewer');

  const initialPassword = 'InitPass123!';
  const newPassword = 'ResetPass123!';

  const created = await createUser(token, {
    hotelCompanyId,
    roleId,
    firstName: 'Reset',
    lastName: 'Target',
    password: initialPassword,
  });

  const oldLogin = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email: created.email, password: initialPassword },
  });
  assert.equal(oldLogin.response.status, 200, 'Expected initial credentials to work');

  await runResetPasswordScript({
    email: created.email,
    password: newPassword,
    hotelCompanyId,
  });

  const oldLoginAfterReset = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email: created.email, password: initialPassword },
  });
  assert.equal(oldLoginAfterReset.response.status, 401, 'Expected old password to be invalid after reset');

  const newLogin = await loginWithCredentials(created.email, newPassword);
  assert.ok(newLogin.token, 'Expected new password to be valid after reset');
});
