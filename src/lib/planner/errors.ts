import Anthropic from '@anthropic-ai/sdk';
import { PlannerError } from './live';

export interface PlanFailureBody {
  error: string;
  reason: string;
}

/** What the person is told when planning fails. Never the raw error: it can carry request details. */
export function planFailure(error: unknown): { status: number; body: PlanFailureBody } {
  if (error instanceof PlannerError) {
    const message = {
      refused: 'Claude declined to plan this.',
      truncated: 'The plan was cut off before it finished.',
      unparseable: 'The plan came back in a shape Countersign could not read.',
    }[error.reason];
    return { status: 502, body: { error: message, reason: error.reason } };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { status: 429, body: { error: 'Claude is busy right now. Try again in a minute.', reason: 'rate_limited' } };
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return { status: 503, body: { error: 'This server’s Claude credentials were rejected.', reason: 'credentials' } };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { status: 504, body: { error: 'Could not reach Claude.', reason: 'unreachable' } };
  }
  if (error instanceof Anthropic.APIError) {
    return { status: 502, body: { error: `Claude returned an error (${error.status ?? 'no status'}).`, reason: 'api_error' } };
  }
  return { status: 500, body: { error: 'Something went wrong while planning.', reason: 'unknown' } };
}
