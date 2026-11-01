import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { HOST_FILE } from '../e2e/mcp-host/build';

const OUT = path.resolve('case-study/screens');
const shot = (name: string) => path.join(OUT, `${name}.png`);

test.beforeEach(async ({ page }) => {
  // The recorded plan, labelled as such on screen. These shots never claim a live run.
  await page.route('**/api/plan', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { live: false } })
      : route.fulfill({ status: 503, json: { error: 'Live planning is not configured on this server.' } }),
  );
});

async function run(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Run month-end/ }).click();
  await expect(page.locator('.card[data-tier="3"]')).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(900); // let entrance motion settle
}

async function element(locator: Locator, name: string) {
  await locator.scrollIntoViewIfNeeded();
  await locator.screenshot({ path: shot(name), animations: 'disabled' });
}

test('desktop', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Run month-end/ })).toBeEnabled();
  await page.screenshot({ path: shot('01-start'), fullPage: true });

  await run(page);
  await page.screenshot({ path: shot('02-brief-full'), fullPage: true });
  await page.screenshot({ path: shot('03-brief-fold') });
  await element(page.locator('.feed'), '04-tier0-log');

  const stop = page.locator('.card[data-tier="3"]');
  await element(stop, '05-tier3-card');
  await element(stop.locator('.paper'), '06-hidden-line');
  await element(stop.locator('.compare'), '07-bank-compare');
  await stop.locator('details.details > summary').click();
  await element(stop.locator('details.details'), '08-tier3-why');

  const pay = page.locator('.card', { hasText: 'Pay 2 vendors' });
  await element(pay, '09-tier2-payments');
  const hold = pay.locator('.hold');
  await hold.scrollIntoViewIfNeeded();
  const box = (await hold.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await pay.screenshot({ path: shot('10-tier2-holding') });
  await page.mouse.up();

  await element(page.locator('.card', { hasText: 'e-invoice IRN' }), '11-tier2-irns');

  const batch = page.locator('.card[data-tier="1"]');
  await element(batch, '12-tier1-batch');
  await batch.getByRole('button', { name: 'Choose which to send' }).click();
  await batch.locator('input[type=checkbox]').nth(1).uncheck();
  await element(batch, '13-tier1-choose');

  const rules = page.locator('details.rules');
  await rules.locator('summary').click();
  await element(rules, '14-rules');
});

test('safe path and all clear', async ({ page }) => {
  await run(page);
  await page.locator('.card[data-tier="3"]').getByRole('button', { name: /Pay the account on file instead/ }).click();
  await page.waitForTimeout(900);
  await element(page.locator('.card', { hasText: 'Pay 1 vendor' }), '15-safe-path-card');

  for (const title of ['Pay 2 vendors', 'e-invoice IRN']) {
    const h = page.locator('.card', { hasText: title }).locator('.hold');
    await h.scrollIntoViewIfNeeded();
    const b = (await h.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1500);
    await page.mouse.up();
    await expect(page.locator('.card', { hasText: title })).toHaveCount(0);
  }
  await page.waitForTimeout(900);
  await element(page.locator('section.handled'), '16-handled-undo');

  await page.locator('.card[data-tier="1"]').getByRole('button', { name: /Send all/ }).click();
  const last = page.locator('.card', { hasText: 'Pay 1 vendor' }).locator('.hold');
  await last.scrollIntoViewIfNeeded();
  const b = (await last.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await expect(page.locator('#brief-title')).toHaveText('All clear');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(900);
  await page.screenshot({ path: shot('17-all-clear'), fullPage: true });
});

test('planning failure', async ({ page }) => {
  await page.route('**/api/plan', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { live: true } })
      : route.fulfill({ status: 502, json: { error: 'Claude declined to plan this.', reason: 'refused' } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: /Run month-end/ }).click();
  await expect(page.locator('section.failed')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot('18-planning-failed') });
});

test('phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await run(page);
  await page.screenshot({ path: shot('19-phone-fold') });
  await page.screenshot({ path: shot('20-phone-full'), fullPage: true });
  await element(page.locator('.card[data-tier="3"]'), '21-phone-tier3');
});

async function chat(page: Page, theme: 'light' | 'dark', width = 820) {
  await page.setViewportSize({ width, height: 640 });
  const html = readFileSync(HOST_FILE, 'utf-8');
  await page.route('**/__chat-host**', (route) => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(`/__chat-host?theme=${theme}`);
  const view = page.frameLocator('iframe[title="Countersign"]');
  await expect(view.locator('.card[data-tier="3"]')).toBeVisible();
  await page.waitForTimeout(900);
  return view;
}

test('inside a chat', async ({ page }) => {
  const view = await chat(page, 'light');
  await page.locator('iframe').screenshot({ path: shot('22-chat-light') });
  await view.locator('.shell').evaluate((el) => el.scrollTo(0, 560));
  await page.waitForTimeout(300);
  await page.locator('iframe').screenshot({ path: shot('23-chat-light-scrolled') });
});

test('inside a dark chat', async ({ page }) => {
  await chat(page, 'dark');
  await page.locator('iframe').screenshot({ path: shot('24-chat-dark') });
});
