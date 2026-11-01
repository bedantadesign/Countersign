import type { ProposedAction } from '../types';
import type { Dropped } from './map';

export interface LivePlan {
  actions: ProposedAction[];
  dropped: Dropped[];
  notes: string[];
  model: string;
}

/** Where a live plan comes from: the site's own API, or the MCP server when embedded in a chat. */
export interface Planner {
  /** Whether live planning is on. Resolves false rather than rejecting. */
  available(): Promise<boolean>;
  plan(signal: AbortSignal): Promise<LivePlan>;
}

/** False when the server has no credentials, there is no server at all (a static host), or it doesn't answer in 5s. */
export async function fetchLiveAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/plan', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const body = (await res.json()) as { live?: unknown };
    return body.live === true;
  } catch {
    return false;
  }
}

export async function fetchLivePlan(signal: AbortSignal): Promise<LivePlan> {
  let res: Response;
  try {
    res = await fetch('/api/plan', { method: 'POST', signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('Could not reach the planning server.');
  }
  const body = (await res.json().catch(() => null)) as (Partial<LivePlan> & { error?: string }) | null;
  if (!res.ok || !body || !Array.isArray(body.actions)) {
    throw new Error(body?.error ?? `The planning server returned ${res.status}.`);
  }
  return { actions: body.actions, dropped: body.dropped ?? [], notes: body.notes ?? [], model: body.model ?? '' };
}

export const httpPlanner: Planner = { available: fetchLiveAvailable, plan: fetchLivePlan };
