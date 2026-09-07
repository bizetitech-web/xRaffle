import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const base = process.env.E2E_BASE_URL || 'http://localhost:3001';
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  console.log('Base URL', base);
  await page.goto(`${base}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button:has-text("Sign In")');
  await page.waitForTimeout(1500);
  console.log('Current URL:', page.url());
  // Check for alert
  const alert = await page.$('div[role="alert"]');
  if (alert) {
    const txt = await alert.innerText();
    console.log('Alert text:', txt);
  }
  // print some console logs
  const logs = [];
  page.on('console', (msg) => logs.push({ type: msg.type(), text: msg.text() }));
  await page.waitForTimeout(500);
  if (logs.length) console.log('Console logs sample:', logs.slice(0,10));
  await browser.close();
})();
