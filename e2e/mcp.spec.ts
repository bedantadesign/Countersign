import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { HOST_FILE } from './mcp-host/build';

interface HostState {
  ready: boolean;
  reports: string[];
  displayMode: 'inline' | 'fullscreen';
  error?: string;
}

/** Serves the test chat host from this site's origin, so its MCP client reaches /mcp without CORS. */
async function openInChat(page: Page, theme: 'light' | 'dark' = 'light') {
  const html = readFileSync(HOST_FILE, 'utf-8');
  await page.route('**/__chat-host**', (route) => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(`/__chat-host?theme=${theme}`);
  await expect.poll(() => hostState(page).then((s) => s.error ?? s.ready)).toBe(true);
  const view = page.frameLocator('iframe[title="Countersign"]');
  await expect(view.locator('.card[data-tier="3"]')).toBeVisible();
  return view;
}

const hostState = (page: Page) => page.evaluate(() => (window as unknown as { host: HostState }).host);
const lastReport = (page: Page) => hostState(page).then((s) => s.reports.at(-1) ?? '');

test.describe('inside a chat (MCP App)', () => {
  test('runs straight away and stays 500px tall, scrolling inside', async ({ page }) => {
    const view = await openInChat(page);
    await expect(view.getByRole('button', { name: /Run month-end/ })).toHaveCount(0);
    await expect(view.getByRole('heading', { level: 1 })).toHaveText('4 things need you');
    await expect.poll(async () => (await page.locator('iframe').boundingBox())?.height).toBe(500);
    const scroll = await view.locator('.shell').evaluate((el) => ({ client: el.clientHeight, full: el.scrollHeight }));
    expect(scroll.client).toBe(500);
    expect(scroll.full).toBeGreaterThan(500);
  });

  test('takes its neutrals and type from the host on a light theme', async ({ page }) => {
    const view = await openInChat(page);
    const style = await view.locator('body').evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, font: s.fontFamily };
    });
    expect(style.bg).toBe('rgb(240, 238, 230)');
    expect(style.font).toContain('Host Sans');
  });

  test('keeps its own paper on a dark host, so the tier colours still read', async ({ page }) => {
    const view = await openInChat(page, 'dark');
    const bg = await view.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(246, 242, 233)');
  });

  test('tells the chat model what is waiting, then what the person did', async ({ page }) => {
    const view = await openInChat(page);
    await expect.poll(() => lastReport(page)).toContain('Waiting on the person');
    expect(await lastReport(page)).toContain('Tier 3');
    expect(await lastReport(page)).toContain('asked for by text inside a vendor invoice');

    await view.getByRole('button', { name: /Reject and flag/ }).click();
    await expect.poll(() => lastReport(page)).toContain('Handled by the person:\n- Rejected and flagged');
  });

  test('asks the host for full screen and back', async ({ page }) => {
    const view = await openInChat(page);
    await view.getByRole('button', { name: 'Full screen' }).click();
    await expect.poll(() => hostState(page).then((s) => s.displayMode)).toBe('fullscreen');
    await view.getByRole('button', { name: 'Exit full screen' }).click();
    await expect.poll(() => hostState(page).then((s) => s.displayMode)).toBe('inline');
  });

  test('leaves focus in the chat when the plan lands, and follows it after a replay', async ({ page }) => {
    const view = await openInChat(page);
    await expect(view.getByRole('heading', { level: 1 })).toHaveText('4 things need you');
    const focused = () => view.locator('body').evaluate(() => document.activeElement?.tagName ?? '');
    await page.waitForTimeout(300);
    expect(await focused()).toBe('BODY');
    await view.getByRole('button', { name: /Replay scenario/ }).click();
    await expect(view.getByRole('heading', { level: 1 })).toBeFocused();
  });

  test('replay plans again without a Run button', async ({ page }) => {
    const view = await openInChat(page);
    await view.getByRole('button', { name: /Reject and flag/ }).click();
    await expect(view.getByRole('heading', { level: 1 })).toHaveText('3 things need you');
    await view.getByRole('button', { name: /Replay scenario/ }).click();
    await expect(view.getByRole('heading', { level: 1 })).toHaveText('4 things need you');
  });
});
