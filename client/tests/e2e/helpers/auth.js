import { expect } from '@playwright/test';
import { getApiBaseUrl, getE2ECredentials } from './env';

export async function loginUi(page) {
  const creds = getE2ECredentials();
  if (!creds.isConfigured) {
    return { skipped: true, reason: 'E2E credentials are not configured' };
  }

  await page.goto('/login');
  await page.getByLabel('Email Address').fill(creds.email);
  await page.getByLabel('Password').fill(creds.password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/(dashboard|admin(\/|$))/);
  return { skipped: false };
}

export async function apiLogin(request) {
  const creds = getE2ECredentials();
  if (!creds.isConfigured) {
    return { skipped: true, reason: 'E2E credentials are not configured' };
  }

  const response = await request.post(`${getApiBaseUrl()}/auth/login`, {
    data: {
      email: creds.email,
      password: creds.password,
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to authenticate e2e admin (${response.status()}): ${body}`);
  }

  const data = await response.json();
  const token = data?.token;
  if (!token) {
    throw new Error('Login response did not include token');
  }

  return { skipped: false, token, user: data?.user };
}
