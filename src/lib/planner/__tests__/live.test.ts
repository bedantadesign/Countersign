import { describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { PlannerError, liveAvailable, requestPlan, serverFallback } from '../live';
import { planFailure } from '../errors';
import { PLANNER_SYSTEM, plannerInput } from '../prompt';
import { PlanSchema } from '../schema';
import { buildScenario, INJECTED_LINE, TASK, VENDORS } from '../../fixtures';
import { surfacedPlan } from '../../../test/plans';

const { ctx } = buildScenario(Date.parse('2026-10-30T12:00:00Z'));

function fakeClient(response: Record<string, unknown>) {
  const parse = vi.fn().mockResolvedValue({ model: 'claude-haiku-5-5', ...response });
  return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
}

describe('requestPlan', () => {
  it('makes one structured-output call on Haiku, with no fallback, no tools, and the fixed inputs', async () => {
    const plan = surfacedPlan();
    const { client, parse } = fakeClient({ stop_reason: 'end_turn', parsed_output: plan });
    const result = await requestPlan(client, TASK, ctx.documents);

    expect(result).toEqual({ plan, model: 'claude-haiku-5-5' });
    const params = parse.mock.calls[0]![0];
    expect(params).toMatchObject({
      model: 'claude-haiku-5-5',
      output_config: { effort: 'medium' },
      system: PLANNER_SYSTEM,
    });
    expect(params.output_config.format).toBeDefined();
    expect(params.fallbacks).toBeUndefined();
    expect(params.betas).toBeUndefined();
    expect(params.tools).toBeUndefined();
    expect(params.thinking).toBeUndefined();
    expect(params.messages).toEqual([{ role: 'user', content: plannerInput(TASK, ctx.documents) }]);
  });

  it.each([
    ['refusal', { stop_reason: 'refusal', parsed_output: null }, 'refused'],
    ['max_tokens', { stop_reason: 'max_tokens', parsed_output: null }, 'truncated'],
    ['no parsed output', { stop_reason: 'end_turn', parsed_output: null }, 'unparseable'],
  ])('fails closed on %s', async (_, response, reason) => {
    const { client } = fakeClient(response);
    await expect(requestPlan(client, TASK, ctx.documents)).rejects.toMatchObject({ reason });
  });

  it('asks for server-side fallback only on models that have one', () => {
    expect(serverFallback('claude-haiku-5-5')).toEqual({});
    expect(serverFallback('claude-opus-5-5')).toEqual({
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  });

  it('builds an output format from the schema', () => {
    expect(() => betaZodOutputFormat(PlanSchema)).not.toThrow();
  });
});

describe('plannerInput', () => {
  const input = plannerInput(TASK, ctx.documents);

  it('gives the planner the request, every vendor, and every document by id', () => {
    expect(input).toContain(`<request>${TASK}</request>`);
    for (const v of Object.values(VENDORS)) expect(input).toContain(v.bank.accountNumber);
    for (const d of ctx.documents) expect(input).toContain(`id="${d.id}"`);
  });

  it('includes hidden text, because extraction cannot see colour or size', () => {
    expect(input).toContain(INJECTED_LINE);
  });

  it('does not tell the planner which text was hidden', () => {
    expect(input.toLowerCase()).not.toContain('hidden');
  });
});

describe('liveAvailable', () => {
  it.each([
    [{}, false],
    [{ ANTHROPIC_API_KEY: 'k' }, true],
    [{ ANTHROPIC_AUTH_TOKEN: 't' }, true],
    [{ ANTHROPIC_API_KEY: 'k', COUNTERSIGN_LIVE: 'off' }, false],
    [{ COUNTERSIGN_LIVE: 'on' }, true],
  ])('%j -> %s', (env, expected) => {
    expect(liveAvailable(env as NodeJS.ProcessEnv)).toBe(expected);
  });
});

describe('planFailure', () => {
  it('names planner failures without leaking details', () => {
    expect(planFailure(new PlannerError('refused'))).toEqual({
      status: 502,
      body: { error: 'Claude declined to plan this.', reason: 'refused' },
    });
  });

  it('maps API errors by class, most specific first', () => {
    const headers = new Headers();
    expect(planFailure(new Anthropic.RateLimitError(429, undefined, 'slow down', headers)).status).toBe(429);
    expect(planFailure(new Anthropic.AuthenticationError(401, undefined, 'bad key', headers)).body.reason).toBe(
      'credentials',
    );
    expect(planFailure(new Anthropic.APIConnectionError({ message: 'down' })).status).toBe(504);
    expect(planFailure(new Anthropic.InternalServerError(500, undefined, 'oops sk-secret', headers))).toEqual({
      status: 502,
      body: { error: 'Claude returned an error (500).', reason: 'api_error' },
    });
    expect(planFailure(new Error('anything')).body.reason).toBe('unknown');
  });
});
