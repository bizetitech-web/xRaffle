const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000/api';

export function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function apiRequest(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  return { response, json };
}

export async function loginWithCredentials(email, password) {
  const { response, json } = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  if (!response.ok || !json?.token) {
    throw new Error(`Login failed (${response.status}): ${JSON.stringify(json)}`);
  }

  return { token: json.token, user: json.user, payload: json };
}

export async function loginAsAdmin() {
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing TEST_ADMIN_EMAIL or TEST_ADMIN_PASSWORD for integration tests.');
  }

  return loginWithCredentials(email, password);
}

export async function createOrganization(token) {
  const suffix = uniqueSuffix();
  const name = `Integration Org ${suffix}`;

  const { response, json } = await apiRequest('/admin/hotel_companies', {
    method: 'POST',
    token,
    body: {
      name,
      email: `org-${suffix}@example.com`,
      status: 'active',
    },
  });

  if (!response.ok || !json?.hotelCompanyId) {
    throw new Error(`Organization create failed (${response.status}): ${JSON.stringify(json)}`);
  }

  return { hotelCompanyId: json.hotelCompanyId, name };
}

export async function getRoleIdByName(token, roleName) {
  const { response, json } = await apiRequest('/admin/roles', { token });

  if (!response.ok || !Array.isArray(json)) {
    throw new Error(`Role fetch failed (${response.status}): ${JSON.stringify(json)}`);
  }

  const role = json.find((item) => item.name === roleName);
  if (!role?.id) {
    throw new Error(`Role not found: ${roleName}`);
  }

  return role.id;
}

export async function createUser(token, {
  hotelCompanyId,
  roleId,
  firstName = 'Integration',
  lastName = 'User',
  password = 'ChangeMe123!',
}) {
  const suffix = uniqueSuffix();
  const email = `user-${suffix}@example.com`;

  const { response, json } = await apiRequest('/admin/users', {
    method: 'POST',
    token,
    body: {
      email,
      password,
      firstName,
      lastName,
      roleId,
      hotelCompanyId,
    },
  });

  if (!response.ok || !json?.userId) {
    throw new Error(`User create failed (${response.status}): ${JSON.stringify(json)}`);
  }

  return { userId: json.userId, email, password };
}

export async function updateUserStatus(token, userId, isActive) {
  const { response, json } = await apiRequest(`/admin/users/${userId}/status`, {
    method: 'PUT',
    token,
    body: { isActive },
  });

  if (!response.ok) {
    throw new Error(`User status update failed (${response.status}): ${JSON.stringify(json)}`);
  }

  return json;
}
