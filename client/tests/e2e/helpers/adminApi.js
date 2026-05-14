import { getApiBaseUrl } from './env';

export async function getUsers(request, token) {
  const res = await request.get(`${getApiBaseUrl()}/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`Failed to fetch users: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

export async function getRoles(request, token) {
  const res = await request.get(`${getApiBaseUrl()}/admin/roles`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`Failed to fetch roles: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

export async function getOrganizations(request, token) {
  const res = await request.get(`${getApiBaseUrl()}/admin/organizations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`Failed to fetch organizations: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

export async function createUser(request, token, payload) {
  const res = await request.post(`${getApiBaseUrl()}/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
    data: payload,
  });

  if (!res.ok()) {
    throw new Error(`Failed to create user: ${res.status()} ${await res.text()}`);
  }

  return res.json();
}

export async function updateUserStatus(request, token, userId, isActive) {
  const res = await request.put(`${getApiBaseUrl()}/admin/users/${userId}/status`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { isActive },
  });

  if (!res.ok()) {
    throw new Error(`Failed to update user status: ${res.status()} ${await res.text()}`);
  }

  return res.json();
}

export async function updateUserRole(request, token, userId, roleId) {
  const res = await request.put(`${getApiBaseUrl()}/admin/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { roleId },
  });

  if (!res.ok()) {
    throw new Error(`Failed to update user role: ${res.status()} ${await res.text()}`);
  }

  return res.json();
}
