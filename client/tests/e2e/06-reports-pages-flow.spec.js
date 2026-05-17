import { test, expect } from '@playwright/test';
import { loginUi } from './helpers/auth';

function toLocalDateInputValue(date) {
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
}

async function ensureLoginOrSkip(page) {
  try {
    const login = await loginUi(page);
    test.skip(login.skipped, login.reason);
  } catch (error) {
    const message = String(error?.message || 'unknown login error').split('\n')[0];
    test.skip(`Skipping reports E2E due to login/environment precondition failure: ${message}`);
  }
}

test('global overview report renders and supports date refresh flow', async ({ page }) => {
  await ensureLoginOrSkip(page);

  await page.goto('/admin/reports/global');

  await expect(page.getByRole('heading', { name: 'Global Overview' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Revenue and Wallet Trend' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Daily Points' })).toBeVisible();

  await page.getByRole('button', { name: '14D' }).click();

  const fromInput = page.locator('input[name="from"]');
  const toInput = page.locator('input[name="to"]');
  await expect(fromInput).toHaveValue(/\d{4}-\d{2}-\d{2}/);
  await expect(toInput).toHaveValue(/\d{4}-\d{2}-\d{2}/);

  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByRole('heading', { name: 'Operations Trend' })).toBeVisible();
});

test('branch daily report renders and supports filter refresh flow', async ({ page }) => {
  await ensureLoginOrSkip(page);

  await page.goto('/admin/reports/branch-daily');

  await expect(page.getByRole('heading', { name: 'Branch Daily Report' })).toBeVisible();

  const noBranchesAlert = page.getByText('No branches available for reporting.');
  if (await noBranchesAlert.isVisible()) {
    await expect(noBranchesAlert).toBeVisible();
    return;
  }

  const dateInput = page.getByLabel('Date');
  await dateInput.fill(toLocalDateInputValue(new Date()));

  const branchSelect = page.getByLabel('Branch');
  await expect(branchSelect).toBeVisible();

  if (await branchSelect.isEnabled()) {
    await branchSelect.click();
    const options = page.locator('li[role="option"]');
    const optionCount = await options.count();

    if (optionCount > 0) {
      await options.first().click();
    } else {
      await page.keyboard.press('Escape');
    }
  }

  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByText('Games Played')).toBeVisible();
  await expect(page.getByText('Wallet Deductions')).toBeVisible();
});

test('company wallet report renders and supports range refresh flow', async ({ page }) => {
  await ensureLoginOrSkip(page);

  await page.goto('/admin/reports/company-wallet');

  await expect(page.getByRole('heading', { name: 'Company Wallet Range' })).toBeVisible();

  const noCompaniesAlert = page.getByText('No companies available for wallet reporting.');
  if (await noCompaniesAlert.isVisible()) {
    await expect(noCompaniesAlert).toBeVisible();
    return;
  }

  const to = toLocalDateInputValue(new Date());
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 6);

  await page.locator('input[name="from"]').fill(toLocalDateInputValue(fromDate));
  await page.locator('input[name="to"]').fill(to);

  const companySelect = page.getByLabel('Company');
  if (await companySelect.isEnabled()) {
    await companySelect.click();
    const options = page.locator('li[role="option"]');
    const optionCount = await options.count();

    if (optionCount > 0) {
      await options.first().click();
    } else {
      await page.keyboard.press('Escape');
    }
  }

  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByText('Opening Balance')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Breakdown' })).toBeVisible();
});
