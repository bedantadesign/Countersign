import type { Card, Decision, Reversibility } from './types';
import { buildCards } from './cards';

export type Resolution =
  | {
      kind: 'approved';
      at: number;
      /** Item ids actually approved (Tier 1 lets you pick). */
      approvedIds: string[];
      /** When the undo window closes, if there is one. */
      undoUntil?: number;
    }
  | { kind: 'verifying'; at: number }
  | { kind: 'rerouted'; at: number; newCardId: string }
  | { kind: 'rejected'; at: number };

export interface State {
  phase: 'idle' | 'planning' | 'ready' | 'failed';
  /** Why planning failed. Nothing was done when this is set. */
  error?: string;
  decisions: Decision[];
  cards: Card[];
  resolutions: Record<string, Resolution>;
}

export const initialState: State = { phase: 'idle', decisions: [], cards: [], resolutions: {} };

export type Event =
  | { type: 'planning' }
  | { type: 'ready'; decisions: Decision[] }
  | { type: 'failed'; message: string }
  | { type: 'approve'; cardId: string; at: number; approvedIds?: string[] }
  | { type: 'undo'; cardId: string }
  | { type: 'verify'; cardId: string; at: number }
  | { type: 'reroute'; cardId: string; at: number; newCard: Card }
  | { type: 'reject'; cardId: string; at: number }
  | { type: 'reset' };

/**
 * When the window closes for an action taken at `at`: a fixed time (bank batch), rolled to the
 * next one if that time has passed, or a span that starts when you approve (IRN).
 */
export function windowClose(rev: Reversibility | undefined, at: number): number | undefined {
  if (!rev || rev.kind !== 'windowed') return undefined;
  if (rev.expiresAt !== undefined) {
    if (at < rev.expiresAt || !rev.everyMs) return rev.expiresAt;
    return rev.expiresAt + (Math.floor((at - rev.expiresAt) / rev.everyMs) + 1) * rev.everyMs;
  }
  return rev.windowMs !== undefined ? at + rev.windowMs : undefined;
}

export function undoDeadline(card: Card, at: number): number | undefined {
  return windowClose(card.items[0]?.reversibility, at);
}

export function reducer(state: State, event: Event): State {
  switch (event.type) {
    case 'planning':
      return { ...initialState, phase: 'planning' };

    case 'ready':
      return { phase: 'ready', decisions: event.decisions, cards: buildCards(event.decisions), resolutions: {} };

    case 'failed':
      if (state.phase !== 'planning') return state;
      return { ...initialState, phase: 'failed', error: event.message };

    case 'approve': {
      const card = state.cards.find((c) => c.id === event.cardId);
      if (!card || card.tier === 3 || state.resolutions[card.id]) return state;
      const approvedIds = event.approvedIds ?? card.items.map((d) => d.action.id);
      if (approvedIds.length === 0) return state;
      return {
        ...state,
        resolutions: {
          ...state.resolutions,
          [card.id]: { kind: 'approved', at: event.at, approvedIds, undoUntil: undoDeadline(card, event.at) },
        },
      };
    }

    case 'undo': {
      const { [event.cardId]: _removed, ...rest } = state.resolutions;
      return { ...state, resolutions: rest };
    }

    case 'verify': {
      const card = state.cards.find((c) => c.id === event.cardId);
      if (!card || card.tier !== 3 || state.resolutions[card.id]) return state;
      return { ...state, resolutions: { ...state.resolutions, [card.id]: { kind: 'verifying', at: event.at } } };
    }

    case 'reroute': {
      const card = state.cards.find((c) => c.id === event.cardId);
      if (!card || card.tier !== 3 || event.newCard.tier === 3 || state.resolutions[card.id]) return state;
      const cards = [...state.cards];
      // Slot the safe payment in where a person will meet it: after the held cards, before the rest.
      const firstOpen = cards.findIndex((c) => c.tier < 3);
      cards.splice(firstOpen === -1 ? cards.length : firstOpen, 0, event.newCard);
      return {
        ...state,
        cards,
        decisions: [...state.decisions, ...event.newCard.items],
        resolutions: {
          ...state.resolutions,
          [card.id]: { kind: 'rerouted', at: event.at, newCardId: event.newCard.id },
        },
      };
    }

    case 'reject': {
      const card = state.cards.find((c) => c.id === event.cardId);
      if (!card || state.resolutions[card.id]) return state;
      return { ...state, resolutions: { ...state.resolutions, [card.id]: { kind: 'rejected', at: event.at } } };
    }

    case 'reset':
      return initialState;
  }
}

export function openCards(state: State): Card[] {
  return state.cards.filter((c) => !state.resolutions[c.id]);
}

export function handledCards(state: State): Card[] {
  return state.cards.filter((c) => state.resolutions[c.id]);
}
