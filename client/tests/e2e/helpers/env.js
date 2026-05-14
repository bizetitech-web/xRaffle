export function getE2ECredentials() {
  const email = process.env.E2E_ADMIN_EMAIL || '';
  const password = process.env.E2E_ADMIN_PASSWORD || '';

  return {
    email,
    password,
    isConfigured: Boolean(email && password),
  };
}

export function getApiBaseUrl() {
  return process.env.E2E_API_BASE_URL || 'http://localhost:5000/api';
}

export function uniqueSuffix(prefix = 'e2e') {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
