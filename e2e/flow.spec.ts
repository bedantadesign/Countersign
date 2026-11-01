import { expect, test, type Locator, type Page } from '@playwright/test';
import { buildScenario } from '../src/lib/fixtures';
import { toProposedActions } from '../src/lib/planner/map';
import { surfacedPlan } from '../src/test/plans';

/** Press and hold with a real pointer. Scrolls first: raw mouse events do not. */
async function hold(page: Page, target: Locator, ms: number) {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/** The focused element's text, or "<body>" when focus has fallen off to the page. */
const focusedText = (page: Page) =>
  page.evaluate(() =>
    !document.activeElement || document.activeElement === document.body
      ? '<body>'
      : (document.activeElement.textContent?.trim() ?? ''),
  );

async function runMonthEnd(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Run month-end/ }).click();
  await expect(page.locator('.card[data-tier="3"]')).toBeVisible();
}

const consoleErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  // Never reach Claude from tests. Live planning is off unless a test turns it on;
  // later routes win, so a test's own route overrides these.
  await page.route('**/api/plan', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { live: false } })
      : route.fulfill({ status: 503, json: { error: 'Live planning is not configured on this server.' } }),
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    // The browser logs every non-2xx response; tests that fake a planning failure expect that one.
    if (m.type() === 'error' && !m.location().url.endsWith('/api/plan')) errors.push(m.text());
  });
  consoleErrors.set(page, errors);
});

test.afterEach(({ page }) => {
  expect(consoleErrors.get(page)).toEqual([]);
});

test('orders cards by distrust and offers no Approve on Tier 3', async ({ page }) => {
  await runMonthEnd(page);
  await expect(page.locator('.card')).toHaveCount(4);
  expect(await page.$$eval('.card', (els) => els.map((e) => (e as HTMLElement).dataset.tier))).toEqual(['3', '2', '2', '1']);
  await expect(page.locator('.card[data-tier="3"]').getByRole('button', { name: /approve/i })).toHaveCount(0);
  await expect(page.locator('#brief-title')).toHaveText('4 things need you');
  await expect.poll(() => focusedText(page)).toBe('4 things need you');
});

test('a click or an early release never confirms; a full hold does, and undo restores', async ({ page }) => {
  await runMonthEnd(page);
  const irn = page.locator('.card', { hasText: 'e-invoice IRN' });
  const button = irn.locator('.hold');

  await button.click();
  await hold(page, button, 500);
  await page.waitForTimeout(400);
  await expect(page.locator('.card')).toHaveCount(4);

  await hold(page, button, 1500);
  const row = page.locator('.done').first();
  await expect(row).toContainText('Requested 6 IRNs');
  await expect(row.locator('.rev__time')).toHaveText(/23h 5\dm \d\ds/);
  await expect(page.locator('#brief-title')).toHaveText('3 things need you');
  await expect.poll(() => focusedText(page)).toMatch(/^A hidden line/);

  const before = await row.locator('.rev__time').innerText();
  await expect.poll(() => row.locator('.rev__time').innerText(), { timeout: 4000 }).not.toBe(before);

  await row.getByRole('button', { name: /Cancel IRNs/ }).click();
  await expect(page.locator('.card')).toHaveCount(4);
  await expect(page.locator('.done')).toHaveCount(0);
  // The undo button is gone, so focus must land on the restored card, not the page.
  await expect.poll(() => focusedText(page)).toBe('Generate 6 e-invoice IRNs');
});

test('holding Space confirms a payment', async ({ page }) => {
  await runMonthEnd(page);
  await page.locator('.card', { hasText: 'Pay 2 vendors' }).locator('.hold').focus();
  await page.keyboard.down('Space');
  await page.waitForTimeout(1500);
  await page.keyboard.up('Space');
  await expect(page.locator('.done', { hasText: 'Queued 2 payments' })).toBeVisible();
});

test('the safe path pays the account on file as a normal countersign, through to All clear', async ({ page }) => {
  await runMonthEnd(page);
  await page.locator('.card[data-tier="3"]').getByRole('button', { name: /Pay the account on file instead/ }).click();
  await expect(page.locator('.done', { hasText: 'Redirected to the account on file' })).toBeVisible();

  const rerouted = page.locator('.card[data-tier="2"]', { hasText: 'Pay 1 vendor' });
  await expect(rerouted).toContainText('Anand Textile Mills');
  await expect(rerouted).toContainText('Account on file');
  await expect(rerouted).toContainText('₹3,15,000');

  const batch = page.locator('.card[data-tier="1"]');
  await batch.getByRole('button', { name: 'Choose which to send' }).click();
  const boxes = batch.locator('input[type=checkbox]');
  await expect(boxes).toHaveCount(7);
  await boxes.nth(0).uncheck();
  await boxes.nth(1).uncheck();
  await batch.getByRole('button', { name: 'Send 5 of 7' }).click();
  await expect(page.locator('.done', { hasText: 'Sent 5 of 7 reminders' })).toBeVisible();

  for (const title of ['Pay 1 vendor', 'Pay 2 vendors', 'e-invoice IRN']) {
    await hold(page, page.locator('.card', { hasText: title }).locator('.hold'), 1500);
    await expect(page.locator('.card', { hasText: title })).toHaveCount(0);
  }
  await expect(page.locator('#brief-title')).toHaveText('All clear');
});

test('with reduced motion, the countdown never shows a bogus first frame and holds still work', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const seen = new Set<string>();
    (window as unknown as { __seen: Set<string> }).__seen = seen;
    new MutationObserver(() => document.querySelectorAll('.rev__time').forEach((e) => seen.add(e.textContent ?? ''))).observe(
      document,
      { subtree: true, childList: true, characterData: true },
    );
  });
  await runMonthEnd(page);
  await page.waitForTimeout(1200);
  const seen = await page.evaluate(() => [...(window as unknown as { __seen: Set<string> }).__seen]);
  const hours = seen.map((t) => /^(\d+)h/.exec(t)?.[1]).filter(Boolean).map(Number);
  expect(seen.length).toBeGreaterThan(0);
  // The bank cutoff is at most 75 minutes away and the IRN window is 24 hours.
  expect(Math.max(0, ...hours)).toBeLessThanOrEqual(24);

  await hold(page, page.locator('.card[data-tier="2"]').first().locator('.hold'), 1500);
  await expect(page.locator('.done')).toHaveCount(1);
});

async function enableLive(page: Page, post: (route: Parameters<Parameters<Page['route']>[1]>[0]) => Promise<void>) {
  await page.route('**/api/plan', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ json: { live: true } }) : post(route),
  );
}

test('plans live with Claude: the same rules hold the surfaced injection', async ({ page }) => {
  const plan = surfacedPlan();
  const { actions, dropped } = toProposedActions(plan, buildScenario(Date.now()).ctx.documents);
  await enableLive(page, (route) =>
    route.fulfill({ json: { actions, dropped, notes: plan.notes, model: 'claude-haiku-5-5' } }),
  );

  await page.goto('/');
  await expect(page.getByRole('radio', { name: /Live with Claude/ })).toBeChecked();
  await page.getByRole('button', { name: /Run month-end/ }).click();

  await expect(page.locator('.brief .eyebrow')).toContainText('Planned live by Claude');
  await expect(page.locator('.card')).toHaveCount(4);
  await expect(page.locator('.card[data-tier="3"]')).toContainText('A hidden line in invoice_0423.pdf');
  await expect(page.locator('.feed')).toContainText('Claude noted: invoice_0423.pdf contains text');
});

test('a click before the live check returns still plans live', async ({ page }) => {
  const plan = surfacedPlan();
  const { actions, dropped } = toProposedActions(plan, buildScenario(Date.now()).ctx.documents);
  await page.route('**/api/plan', async (route) => {
    if (route.request().method() === 'GET') {
      await new Promise((r) => setTimeout(r, 1500));
      return route.fulfill({ json: { live: true } });
    }
    return route.fulfill({ json: { actions, dropped, notes: plan.notes, model: 'claude-haiku-5-5' } });
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Run month-end/ }).click();

  await expect(page.locator('.brief .eyebrow')).toContainText('Planned live by Claude');
});

test('a planning failure does nothing, says so, and offers the recorded plan', async ({ page }) => {
  await enableLive(page, (route) =>
    route.fulfill({ status: 502, json: { error: 'Claude declined to plan this.', reason: 'refused' } }),
  );

  await page.goto('/');
  await page.getByRole('button', { name: /Run month-end/ }).click();

  const failed = page.locator('section.failed[role="alert"]');
  await expect(failed).toContainText('Claude couldn’t plan this. Nothing was done.');
  await expect(failed).toContainText('Claude declined to plan this.');
  await expect(page.locator('.card')).toHaveCount(0);
  await expect.poll(() => focusedText(page)).toBe('Claude couldn’t plan this. Nothing was done.');

  await page.getByRole('button', { name: 'Use the recorded plan' }).click();
  await expect(page.locator('.brief .eyebrow')).toContainText('Recorded plan');
  await expect(page.locator('.card')).toHaveCount(4);
});

test('without live planning, there is no mode switch and the page says the plan is recorded', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.locator('.ask')).toContainText('Live planning is off on this server.');
});
