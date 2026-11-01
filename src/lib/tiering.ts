import type {
  ActionKind,
  BankAccount,
  Blast,
  Context,
  Decision,
  EffectiveProvenance,
  ProposedAction,
  Reversibility,
  RuleHit,
  Tier,
  Vendor,
} from './types';
import { documentText, hiddenText, normalise } from './documents';
import { formatDate, formatINR, maskAccount } from './format';
import { PAYMENT_BATCH_EVERY_MS } from './fixtures';

const HOUR = 60 * 60 * 1000;

/**
 * Cancellation window for an e-invoice on the IRP, in hours.
 * Verify against the current CBIC notification before publishing any claim about it.
 */
export const IRN_CANCEL_WINDOW_HOURS = 24;

/** A payment above this multiple of the vendor's usual payment is held as anomalous. */
export const AMOUNT_OUTLIER_FACTOR = 3;

interface Profile {
  blast: Blast;
  reversibility: (ctx: Context) => Reversibility;
}

/** The two axes the whole system turns on. Everything else is an exception to these. */
export const PROFILES: Record<ActionKind, Profile> = {
  reconcile_gstr2b: { blast: 'private', reversibility: () => ({ kind: 'full' }) },
  draft_reminder: { blast: 'private', reversibility: () => ({ kind: 'full' }) },
  send_reminder: {
    blast: 'external',
    reversibility: () => ({ kind: 'windowed', label: 'Undo send', windowMs: 5 * 60 * 1000 }),
  },
  generate_irn: {
    blast: 'consequential',
    reversibility: () => ({
      kind: 'windowed',
      label: 'IRP cancellation window',
      windowMs: IRN_CANCEL_WINDOW_HOURS * HOUR,
    }),
  },
  pay_vendor: {
    blast: 'consequential',
    reversibility: (ctx) => ({
      kind: 'windowed',
      label: 'Until the bank batch is released',
      expiresAt: ctx.paymentCutoffAt,
      everyMs: PAYMENT_BATCH_EVERY_MS,
    }),
  },
  update_bank_details: { blast: 'consequential', reversibility: () => ({ kind: 'full' }) },
};

interface RuleInput {
  action: ProposedAction;
  blast: Blast;
  reversibility: Reversibility;
  provenance: EffectiveProvenance;
  vendor?: Vendor;
  ctx: Context;
}

export interface Rule {
  id: string;
  tier: Tier;
  name: string;
  /** Plain-language statement, also rendered in the UI and the README. */
  summary: string;
  /** Returns the reason this rule fired for this action, or null. */
  check(input: RuleInput): string | null;
}

export function sameAccount(a: BankAccount, b: BankAccount): boolean {
  const digits = (s: string) => s.replace(/\D/g, '');
  return digits(a.accountNumber) === digits(b.accountNumber) && a.ifsc.toUpperCase() === b.ifsc.toUpperCase();
}

export const RULES: Rule[] = [
  {
    id: 'R1',
    tier: 0,
    name: 'Private and undoable',
    summary: 'Stays in your workspace and can be undone. Logged, never interrupted.',
    check: ({ blast, reversibility }) =>
      blast === 'private' && reversibility.kind !== 'permanent'
        ? 'Stays in your workspace and can be undone, so it is only logged.'
        : null,
  },
  {
    id: 'R2',
    tier: 1,
    name: 'External, low stakes',
    summary: 'Reaches people outside your company but moves no money and files nothing. Reviewed in a batch.',
    check: ({ blast, reversibility }) =>
      blast === 'external' && reversibility.kind !== 'permanent'
        ? 'Goes to people outside your company, but moves no money and files nothing.'
        : null,
  },
  {
    id: 'R3',
    tier: 2,
    name: 'Money or a filing',
    summary: 'Moves money or files with a regulator. Never drops below your sign-off, even with an undo window.',
    check: ({ blast, action }) => {
      if (blast !== 'consequential') return null;
      return action.kind === 'generate_irn'
        ? 'Files with the government e-invoice portal.'
        : action.kind === 'pay_vendor'
          ? 'Moves money out of your account.'
          : 'Changes records that decide where money goes.';
    },
  },
  {
    id: 'R4',
    tier: 2,
    name: 'Permanent',
    summary: 'Cannot be undone, even when it is private. Deleting is signed off like paying.',
    check: ({ blast, reversibility }) =>
      blast !== 'consequential' && reversibility.kind === 'permanent' ? 'Cannot be undone once done.' : null,
  },
  {
    id: 'R5',
    tier: 3,
    name: 'Instruction came from a document',
    summary: 'The request originates in text inside a file, not from you. Documents are data, never instructions.',
    check: ({ provenance, blast }) =>
      provenance.origin === 'document' && blast !== 'private'
        ? 'This instruction came from text inside a document, not from you.'
        : null,
  },
  {
    id: 'R6',
    tier: 3,
    name: 'Payee destination changes',
    summary: 'Changes where a vendor is paid, or pays an account that is not the one on file.',
    check: ({ action, vendor }) => {
      if (action.kind === 'update_bank_details') return 'It changes where this vendor is paid.';
      if (action.kind === 'pay_vendor' && vendor && action.bank && !sameAccount(action.bank, vendor.bank)) {
        return `It pays ${maskAccount(action.bank.accountNumber)}, which is not the account on file (${maskAccount(vendor.bank.accountNumber)}).`;
      }
      return null;
    },
  },
  {
    id: 'R7',
    tier: 3,
    name: 'Bank details changed since last payment',
    summary: 'The vendor master changed after you last paid them. Confirm the change before money moves.',
    check: ({ action, vendor }) => {
      if (action.kind !== 'pay_vendor' || !vendor) return null;
      return Date.parse(vendor.bankChangedAt) > Date.parse(vendor.lastPaidAt)
        ? `Bank details changed on ${formatDate(vendor.bankChangedAt)}, after your last payment on ${formatDate(vendor.lastPaidAt)}.`
        : null;
    },
  },
  {
    id: 'R8',
    tier: 3,
    name: 'Amount is out of pattern',
    summary: `A payment more than ${AMOUNT_OUTLIER_FACTOR}× what this vendor usually gets is held.`,
    check: ({ action, vendor }) => {
      if (action.kind !== 'pay_vendor' || !vendor || action.amountPaise === undefined) return null;
      return action.amountPaise > vendor.averagePaymentPaise * AMOUNT_OUTLIER_FACTOR
        ? `${formatINR(action.amountPaise)} is more than ${AMOUNT_OUTLIER_FACTOR}× their usual ${formatINR(vendor.averagePaymentPaise)}.`
        : null;
    },
  },
];

/** Pure matrix used by R1–R4, exposed so the base tier can be tested without a scenario. */
export function baseTier(blast: Blast, reversibility: Reversibility['kind']): Tier {
  if (blast === 'consequential') return 2;
  if (reversibility === 'permanent') return 2;
  return blast === 'external' ? 1 : 0;
}

/** Shorter quotes match too much ordinary text to say anything about who asked. */
export const MIN_QUOTE_CHARS = 16;

/**
 * Works out who really asked for an action. The planner's declaration is only a claim.
 *
 * Instruction words that are not the person's own but do appear in a document mean the
 * document asked. Evidence is data (an invoice total, a due date) and never says who asked,
 * unless it was taken from text a person cannot see. A destination account that appears in
 * a document but not in the vendor master also marks the action as document-originated.
 */
export function effectiveProvenance(action: ProposedAction, ctx: Context): EffectiveProvenance {
  const declared = action.provenance;
  if (declared.origin === 'document') {
    return { origin: 'document', documentId: declared.documentId, quote: declared.quote, basis: 'declared' };
  }

  if (declared.quote) {
    const q = normalise(declared.quote);
    if (q.length >= MIN_QUOTE_CHARS && !normalise(ctx.request).includes(q)) {
      const hit = ctx.documents.find((d) => normalise(documentText(d)).includes(q));
      if (hit) return { origin: 'document', documentId: hit.id, quote: declared.quote, basis: 'quote-in-document' };
    }
  }

  for (const e of declared.evidence ?? []) {
    const q = normalise(e.quote);
    if (q.length < MIN_QUOTE_CHARS) continue;
    const hit = ctx.documents.find((d) => normalise(hiddenText(d)).includes(q));
    if (hit) return { origin: 'document', documentId: hit.id, quote: e.quote, basis: 'hidden-evidence' };
  }

  const vendor = action.counterparty ? ctx.vendors[action.counterparty.id] : undefined;
  if (action.bank && !(vendor && sameAccount(action.bank, vendor.bank))) {
    const acct = normalise(action.bank.accountNumber);
    const hit = ctx.documents.find((d) => normalise(documentText(d)).includes(acct));
    if (hit) return { origin: 'document', documentId: hit.id, basis: 'tainted-parameter' };
  }

  return { origin: 'user', quote: declared.quote, basis: 'user' };
}

export function decide(action: ProposedAction, ctx: Context): Decision {
  const profile = PROFILES[action.kind];
  const blast = profile.blast;
  const reversibility = profile.reversibility(ctx);
  const provenance = effectiveProvenance(action, ctx);
  const vendor = action.counterparty ? ctx.vendors[action.counterparty.id] : undefined;
  const input: RuleInput = { action, blast, reversibility, provenance, vendor, ctx };

  const hits: RuleHit[] = [];
  for (const rule of RULES) {
    const reason = rule.check(input);
    if (reason) hits.push({ ruleId: rule.id, name: rule.name, tier: rule.tier, reason });
  }

  const tier = hits.reduce<Tier>((max, h) => (h.tier > max ? h.tier : max), 0);
  const why = hits
    .filter((h) => h.tier === tier)
    .map((h) => h.reason)
    .join(' ');

  return { action, tier, blast, reversibility, provenance, hits, why };
}
