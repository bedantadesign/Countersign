import type { ActionKind, Card, Context, Decision, ProposedAction } from './types';
import { decide, sameAccount } from './tiering';

/** Needs-you cards read in the order of how little they should be trusted. */
const KIND_ORDER: ActionKind[] = ['update_bank_details', 'pay_vendor', 'generate_irn', 'send_reminder'];

/**
 * Turns decisions into the cards a person sees.
 *
 * Tier 0 is never a card. Tier 1 and 2 bundle by kind so six IRNs are one sign-off.
 * Tier 3 never bundles with anything safe: related held actions share a card only
 * when they came from the same document about the same counterparty.
 */
export function buildCards(decisions: Decision[]): Card[] {
  const cards = new Map<string, Card>();
  for (const d of decisions) {
    if (d.tier === 0) continue;
    const tier = d.tier;
    const key =
      tier === 3
        ? `3:${d.provenance.documentId ?? d.action.id}:${d.action.counterparty?.id ?? d.action.id}`
        : `${tier}:${d.action.kind}`;
    const existing = cards.get(key);
    if (existing) existing.items.push(d);
    else cards.set(key, { id: key, tier, kind: d.action.kind, items: [d] });
  }

  return [...cards.values()].sort((a, b) => {
    if (a.tier !== b.tier) return b.tier - a.tier;
    return KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
  });
}

export function cardTotalPaise(card: Card): number {
  return card.items.reduce((sum, d) => sum + (d.action.amountPaise ?? 0), 0);
}

export function loggedDecisions(decisions: Decision[]): Decision[] {
  return decisions.filter((d) => d.tier === 0);
}

/**
 * The safe path from a held payment: pay the account on file, as a normal sign-off.
 * The new action comes from the person's own choice, not from the document.
 * Returns null when paying the account on file would still be held, so the path is never offered
 * for holds it cannot fix (a recent bank change, an unusual amount), and when the plan already
 * pays that invoice to the account on file, so the person can't pay it twice.
 */
export function rerouteToAccountOnFile(card: Card, ctx: Context, decisions: Decision[] = []): Card | null {
  const pay = card.items.find((d) => d.action.kind === 'pay_vendor');
  const vendor = pay?.action.counterparty ? ctx.vendors[pay.action.counterparty.id] : undefined;
  if (!pay || !vendor) return null;

  const alreadyPaid = decisions.some(
    (d) =>
      d.action.kind === 'pay_vendor' &&
      d.action.id !== pay.action.id &&
      d.action.counterparty?.id === vendor.id &&
      d.action.refId === pay.action.refId &&
      d.action.bank !== undefined &&
      sameAccount(d.action.bank, vendor.bank),
  );
  if (alreadyPaid) return null;

  const action: ProposedAction = {
    ...pay.action,
    id: `${pay.action.id}-on-file`,
    title: `Pay ${vendor.name} (account on file)`,
    bank: vendor.bank,
    provenance: { origin: 'user', quote: 'You chose to pay the account on file' },
  };
  const decision = decide(action, ctx);
  if (decision.tier === 0 || decision.tier === 3) return null;
  return { id: `${decision.tier}:${action.kind}:on-file:${vendor.id}`, tier: decision.tier, kind: action.kind, items: [decision] };
}
