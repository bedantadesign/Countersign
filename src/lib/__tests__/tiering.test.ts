import { describe, expect, it } from 'vitest';
import { RULES, baseTier, decide, effectiveProvenance } from '../tiering';
import {
  INJECTED_BANK,
  INJECTED_QUOTE,
  POISONED_DOC_ID,
  VENDORS,
  buildScenario,
  invoiceTotalPaise,
} from '../fixtures';
import type { ProposedAction } from '../types';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const { ctx, plan } = buildScenario(NOW);
const byId = (id: string) => plan.find((a) => a.id === id)!;
const user = { origin: 'user' as const, quote: "Clear this month's pending vendor stuff" };

function pay(overrides: Partial<ProposedAction> = {}): ProposedAction {
  const v = VENDORS['v-sundaram']!;
  return {
    id: 'pay-test',
    kind: 'pay_vendor',
    title: 'Pay',
    counterparty: { id: v.id, name: v.name },
    amountPaise: 24_000_000,
    bank: v.bank,
    provenance: user,
    ...overrides,
  };
}

describe('base tier matrix', () => {
  it('logs private undoable work', () => expect(baseTier('private', 'full')).toBe(0));
  it('batches external low-stakes work', () => expect(baseTier('external', 'windowed')).toBe(1));
  it('never drops money or filings below a sign-off, even with an undo window', () => {
    expect(baseTier('consequential', 'full')).toBe(2);
    expect(baseTier('consequential', 'windowed')).toBe(2);
  });
  it('treats permanent private work like paying', () => expect(baseTier('private', 'permanent')).toBe(2));
});

describe('tiering the recorded plan', () => {
  it('logs reconciliations and drafts', () => {
    expect(decide(byId('a-recon-gstr2b'), ctx).tier).toBe(0);
    expect(decide(byId('a-draft-sagarbakers'), ctx).tier).toBe(0);
  });

  it('batches reminders as Tier 1', () => {
    expect(decide(byId('a-send-sagarbakers'), ctx).tier).toBe(1);
  });

  it('requires a countersign for IRNs, with a 24 hour window that starts on approval', () => {
    const d = decide(byId('a-irn-1181'), ctx);
    expect(d.tier).toBe(2);
    expect(d.reversibility).toMatchObject({ kind: 'windowed', windowMs: 24 * 60 * 60 * 1000 });
  });

  it('requires a countersign for a normal payment, closing at the bank cutoff', () => {
    const d = decide(byId('a-pay-sundaram'), ctx);
    expect(d.tier).toBe(2);
    expect(d.reversibility).toMatchObject({ kind: 'windowed', expiresAt: ctx.paymentCutoffAt });
    expect(d.hits.map((h) => h.ruleId)).toEqual(['R3']);
  });

  it('stops both halves of the injected request', () => {
    const bank = decide(byId('a-bank-anand'), ctx);
    const payment = decide(byId('a-pay-anand'), ctx);
    expect(bank.tier).toBe(3);
    expect(payment.tier).toBe(3);
    expect(bank.hits.map((h) => h.ruleId)).toEqual(expect.arrayContaining(['R3', 'R5', 'R6']));
    expect(payment.hits.map((h) => h.ruleId)).toEqual(expect.arrayContaining(['R3', 'R5', 'R6']));
  });

  it('explains the hold in plain language, naming the source', () => {
    const d = decide(byId('a-pay-anand'), ctx);
    expect(d.why).toContain('came from text inside a document, not from you');
    expect(d.why).toContain('not the account on file');
  });
});

describe('provenance is re-checked, not trusted', () => {
  it('upgrades a payment the planner called user-originated when its account only exists in a document', () => {
    const lied = pay({
      counterparty: { id: 'v-anand', name: 'Anand' },
      bank: INJECTED_BANK,
      provenance: user,
    });
    const p = effectiveProvenance(lied, ctx);
    expect(p).toMatchObject({ origin: 'document', documentId: POISONED_DOC_ID, basis: 'tainted-parameter' });
    expect(decide(lied, ctx).tier).toBe(3);
  });

  it('catches a quote that is really document text, even when declared as the user', () => {
    const lied = pay({ provenance: { origin: 'user', quote: INJECTED_QUOTE } });
    expect(effectiveProvenance(lied, ctx).basis).toBe('quote-in-document');
  });

  it('does not taint a payment to the account on file just because the invoice prints it', () => {
    const d = decide(byId('a-pay-anand'), ctx);
    const ok = decide(pay({ counterparty: { id: 'v-anand', name: 'Anand' }, bank: VENDORS['v-anand']!.bank }), ctx);
    expect(d.tier).toBe(3);
    expect(ok.provenance.origin).toBe('user');
    expect(ok.tier).toBe(2);
  });

  it('keeps document-derived reading private-only: reconcile stays Tier 0 even if it cites a document', () => {
    const read: ProposedAction = {
      ...byId('a-recon-gstr2b'),
      provenance: { origin: 'document', documentId: POISONED_DOC_ID },
    };
    expect(decide(read, ctx).tier).toBe(0);
  });
});

describe('other Tier 3 triggers', () => {
  it('holds a payment when the vendor master changed after the last payment', () => {
    const vendors = { ...VENDORS, 'v-sundaram': { ...VENDORS['v-sundaram']!, bankChangedAt: '2026-10-20' } };
    const d = decide(pay(), { ...ctx, vendors });
    expect(d.tier).toBe(3);
    expect(d.hits.map((h) => h.ruleId)).toContain('R7');
  });

  it('holds a payment far out of pattern for the vendor', () => {
    const d = decide(pay({ amountPaise: 24_000_000 * 3 }), ctx);
    expect(d.tier).toBe(3);
    expect(d.hits.map((h) => h.ruleId)).toContain('R8');
  });

  it('does not hold a payment at exactly the outlier threshold', () => {
    const edge = VENDORS['v-sundaram']!.averagePaymentPaise * 3;
    expect(decide(pay({ amountPaise: edge }), ctx).tier).toBe(2);
  });
});

describe('rules table', () => {
  it('has unique ids and every tier represented', () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(RULES.map((r) => r.tier))).toEqual(new Set([0, 1, 2, 3]));
  });
});

describe('fixtures', () => {
  it('keeps money in integer paise', () => {
    for (const a of plan) if (a.amountPaise !== undefined) expect(Number.isInteger(a.amountPaise)).toBe(true);
  });

  it('totals the six IRN invoices', () => {
    const total = plan.filter((a) => a.kind === 'generate_irn').reduce((s, a) => s + (a.amountPaise ?? 0), 0);
    expect(plan.filter((a) => a.kind === 'generate_irn')).toHaveLength(6);
    expect(total).toBe(105_020_000);
    expect(invoiceTotalPaise({ customer: '', gstin: '', invoiceNo: '', taxablePaise: 10_000_000, gstRatePct: 18 })).toBe(
      11_800_000,
    );
  });
});
