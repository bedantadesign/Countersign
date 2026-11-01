import { describe, expect, it, vi } from 'vitest';
import type { App } from '@modelcontextprotocol/ext-apps';
import { mcpPlanner, toPlanResult } from '../view/planner';
import type { PlanResult } from '../protocol';

const plan = { actions: [], dropped: [], notes: [], model: 'claude-haiku-5-5' };

function fakeApp(result: unknown = { structuredContent: { source: 'live', plan } }) {
  const callServerTool = vi.fn().mockResolvedValue(result);
  return { app: { callServerTool } as unknown as App, callServerTool };
}
const signal = () => new AbortController().signal;

describe('mcpPlanner', () => {
  it('uses the chat’s own tool result for the first plan, then asks the server', async () => {
    const { app, callServerTool } = fakeApp();
    const planner = mcpPlanner(app, Promise.resolve<PlanResult>({ source: 'live', plan }));
    expect(await planner.available()).toBe(true);
    expect(await planner.plan(signal())).toBe(plan);
    expect(callServerTool).not.toHaveBeenCalled();
    expect(await planner.plan(signal())).toEqual(plan);
    expect(callServerTool).toHaveBeenCalledWith({ name: 'plan_month_end', arguments: {} }, expect.anything());
  });

  it('says live planning is off when the server sent the recorded plan', async () => {
    const planner = mcpPlanner(fakeApp().app, Promise.resolve<PlanResult>({ source: 'recorded' }));
    expect(await planner.available()).toBe(false);
  });

  it('turns a failed plan into an error carrying the server’s words', async () => {
    const planner = mcpPlanner(
      fakeApp().app,
      Promise.resolve<PlanResult>({ source: 'failed', error: 'Claude declined to plan this.', reason: 'refused' }),
    );
    expect(await planner.available()).toBe(true);
    await expect(planner.plan(signal())).rejects.toThrow('Claude declined to plan this.');
  });

  it('fails a replan the host reports as an error', async () => {
    const { app } = fakeApp({ isError: true, content: [] });
    const planner = mcpPlanner(app, Promise.resolve<PlanResult>({ source: 'live', plan }));
    await planner.plan(signal());
    await expect(planner.plan(signal())).rejects.toThrow('The planning server returned an error.');
  });

  it('reads anything unexpected as a failure, never as a plan', () => {
    expect(toPlanResult(undefined)).toMatchObject({ source: 'failed' });
    expect(toPlanResult({ source: 'live' })).toMatchObject({ source: 'failed' });
    expect(toPlanResult({ source: 'live', plan: { actions: 'all' } })).toMatchObject({ source: 'failed' });
  });
});
