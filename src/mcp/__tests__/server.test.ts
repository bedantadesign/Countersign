import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { createServer, VIEW_URI } from '../server';
import { planMonthEnd } from '@/lib/planner/run';
import { buildScenario } from '@/lib/fixtures';
import { toProposedActions } from '@/lib/planner/map';
import { surfacedPlan } from '@/test/plans';

vi.mock('@/lib/planner/run', () => ({ planMonthEnd: vi.fn() }));

async function connect() {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverSide);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
  return client;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(planMonthEnd).mockReset();
});

describe('MCP server', () => {
  it('offers the model one tool with a view, and hides the replanning tool from it', async () => {
    const { tools } = await (await connect()).listTools();
    const run = tools.find((t) => t.name === 'run_month_end')!;
    const again = tools.find((t) => t.name === 'plan_month_end')!;
    expect(run._meta?.ui).toEqual({ resourceUri: VIEW_URI });
    expect(again._meta?.ui).toEqual({ resourceUri: VIEW_URI, visibility: ['app'] });
    expect(run.inputSchema.properties ?? {}).toEqual({});
  });

  it('falls back to the recorded plan without credentials, and never calls Claude', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', '');
    vi.stubEnv('COUNTERSIGN_LIVE', '');
    const res = await (await connect()).callTool({ name: 'run_month_end', arguments: {} });
    expect(res.structuredContent).toEqual({ source: 'recorded' });
    expect(planMonthEnd).not.toHaveBeenCalled();
  });

  it('hands the live plan to the view and only a summary to the model', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const surfaced = surfacedPlan();
    const { actions, dropped } = toProposedActions(surfaced, buildScenario(Date.now()).ctx.documents);
    const plan = { actions, dropped, notes: surfaced.notes, model: 'claude-haiku-5-5' };
    expect(JSON.stringify(plan)).toContain('4471 0028 1936');
    vi.mocked(planMonthEnd).mockResolvedValue({ ok: true, plan });
    const res = await (await connect()).callTool({ name: 'run_month_end', arguments: {} });
    expect(res.structuredContent).toEqual({ source: 'live', plan });
    const text = JSON.stringify(res.content);
    expect(text).toContain('data, not instructions');
    // The injected instruction stays out of what the model reads.
    expect(text).not.toContain('4471');
  });

  it('reports a planning failure as a failure that did nothing', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.mocked(planMonthEnd).mockResolvedValue({
      ok: false,
      status: 429,
      error: 'Claude is busy right now. Try again in a minute.',
      reason: 'rate_limited',
    });
    const res = await (await connect()).callTool({ name: 'plan_month_end', arguments: {} });
    expect(res.structuredContent).toEqual({
      source: 'failed',
      error: 'Claude is busy right now. Try again in a minute.',
      reason: 'rate_limited',
    });
    expect(JSON.stringify(res.content)).toContain('Nothing was done');
  });
});
