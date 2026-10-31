import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { PlanSchema, type Plan } from './schema';
import { PLANNER_SYSTEM, plannerInput } from './prompt';
import type { SourceDocument } from '../types';

export const PLANNER_MODEL = process.env.COUNTERSIGN_MODEL || 'claude-opus-5-5';

export type PlannerFailure = 'refused' | 'truncated' | 'unparseable';

export class PlannerError extends Error {
  constructor(readonly reason: PlannerFailure) {
    super(`Planner ${reason}`);
  }
}

/** Live planning is on with an API key or token, unless switched off. COUNTERSIGN_LIVE=on forces it on. */
export function liveAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.COUNTERSIGN_LIVE === 'off') return false;
  if (env.COUNTERSIGN_LIVE === 'on') return true;
  return Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
}

/**
 * One structured-output call. No tools and no loop: the planner only proposes.
 * A refusal falls back server-side; anything still unusable is an error, never a guess.
 */
export async function requestPlan(
  client: Anthropic,
  request: string,
  documents: SourceDocument[],
): Promise<{ plan: Plan; model: string }> {
  const response = await client.beta.messages.parse({
    model: PLANNER_MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(PlanSchema) },
    system: PLANNER_SYSTEM,
    messages: [{ role: 'user', content: plannerInput(request, documents) }],
  });

  if (response.stop_reason === 'refusal') throw new PlannerError('refused');
  if (response.stop_reason === 'max_tokens') throw new PlannerError('truncated');
  if (!response.parsed_output) throw new PlannerError('unparseable');
  return { plan: response.parsed_output, model: response.model };
}
