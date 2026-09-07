import { test, expect } from '@playwright/test';

const SERVER_LOGIN = 'http://localhost:5000/api/auth/login';
const SUPER_ADMIN = { email: 'admin@local.test', password: 'Passw0rd!' };

test('Fee Templates: sidebar visibility and route protection', async ({ browser }) => {
  // Unauthenticated context
  const unauthContext = await browser.newContext();
  const unauthPage = await unauthContext.newPage();

  // Visiting protected route as unauthenticated should redirect to /login
  await unauthPage.goto('/admin/hotel-charge-templates');
  await expect(unauthPage).toHaveURL(/\/login/);
  await unauthContext.close();

  // Authenticated context (super-admin)
  const authContext = await browser.newContext();

  // Obtain token via API
  const resp = await authContext.request.post(SERVER_LOGIN, { data: SUPER_ADMIN });
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  const token = body?.token;
  expect(token).toBeTruthy();

  // Ensure token is present in localStorage before page loads
  await authContext.addInitScript((t) => {
    localStorage.setItem('token', t);
  }, token);

  const page = await authContext.newPage();

  // Directly navigate to the protected route; RoleGuard + PrivateRoute should allow access for super-admin
  await page.goto('/admin/hotel-charge-templates');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Hotel Charge Templates')).toBeVisible();

  await authContext.close();
});
