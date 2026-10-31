import { describe, expect, it } from 'vitest';
import { toProposedActions } from '../map';
import { buildCards, rerouteToAccountOnFile } from '../../cards';
import { decide } from '../../tiering';
import { buildScenario, INJECTED_BANK, VENDORS } from '../../fixtures';
import { fooledPlan, resistingPlan, surfacedPlan } from '../../../test/plans';
import type { Plan } from '../schema';

const { ctx } = buildScenario(Date.parse('2026-10-30T12:00:00Z'));

function cardsFor(plan: Plan) {
  const { actions, dropped } = toProposedActions(plan, ctx.documents);
  const decisions = actions.map((a) => decide(a, ctx));
  return { actions, dropped, decisions, cards: buildCards(decisions) };
}

describe('toProposedActions', () => {
  it('turns a surfaced injection into one Tier 3 card, with the routine work tiered as usual', () => {
    const { cards, dropped } = cardsFor(surfacedPlan());
    expect(dropped).toEqual([]);
    expect(cards.map((c) => `${c.tier}:${c.kind}`)).toEqual([
      '3:update_bank_details',
      '2:pay_vendor',
      '2:generate_irn',
      '1:send_reminder',
    ]);
    expect(cards[0]!.items).toHaveLength(2);
  });

  it('normalises the account number and IFSC the planner copied', () => {
    const { actions } = cardsFor(surfacedPlan());
    expect(actions.find((a) => a.kind === 'update_bank_details')!.bank).toEqual(INJECTED_BANK);
  });

  it('still holds a fooled planner that says the person asked', () => {
    const { decisions } = cardsFor(fooledPlan());
    const anand = decisions.find((d) => d.action.counterparty?.id === 'v-anand')!;
    expect(anand.action.provenance.origin).toBe('user');
    expect(anand.tier).toBe(3);
    expect(anand.provenance.origin).toBe('document');
    expect(anand.hits.map((h) => h.ruleId)).toEqual(expect.arrayContaining(['R5', 'R6']));
  });

  it('shows no Tier 3 card when the planner resisted and paid the account on file', () => {
    const { cards } = cardsFor(resistingPlan());
    expect(cards.some((c) => c.tier === 3)).toBe(false);
    expect(cards.find((c) => c.kind === 'pay_vendor')!.items).toHaveLength(3);
  });

  it('takes record fields from the books, not the planner', () => {
    const plan = surfacedPlan();
    const irn = plan.actions.find((a) => a.kind === 'generate_irn')!;
    irn.amountPaise = 1;
    irn.title = 'Something else';
    const { actions } = cardsFor(plan);
    const mapped = actions.find((a) => a.kind === 'generate_irn')!;
    expect(mapped.amountPaise).toBe(11_800_000);
    expect(mapped.counterparty?.gstin).toBe('29AAHFL5521D1ZV');
    expect(actions.find((a) => a.kind === 'send_reminder')!.email?.to).toBe('accounts@sagarbakers.example');
  });

  it('drops proposals that name records the books do not have, and says why', () => {
    const plan = surfacedPlan();
    plan.actions.push(
      { ...plan.actions.find((a) => a.kind === 'generate_irn')!, ref: 'MHG/26-27/9999' },
      { ...plan.actions.find((a) => a.kind === 'pay_vendor')!, vendorId: 'v-nobody' },
      { ...plan.actions.find((a) => a.kind === 'pay_vendor')!, bankAccountNumber: null },
      { ...plan.actions.find((a) => a.kind === 'pay_vendor')!, amountPaise: 0 },
    );
    const { dropped } = cardsFor(plan);
    expect(dropped.map((d) => d.reason)).toEqual([
      'No sales invoice MHG/26-27/9999 awaiting an IRN',
      'No vendor v-nobody in the vendor master',
      'No destination account given',
      'No amount given',
    ]);
  });

  it('ignores evidence and instruction documents that do not exist', () => {
    const plan = surfacedPlan();
    const pay = plan.actions.find((a) => a.kind === 'pay_vendor' && a.instructedBy === 'document')!;
    pay.instructionDocumentId = 'doc-made-up';
    pay.evidence = [{ documentId: 'doc-made-up', quote: 'anything' }];
    const { actions } = cardsFor(plan);
    const mapped = actions.find((a) => a.kind === 'pay_vendor' && a.provenance.origin === 'document')!;
    expect(mapped.provenance.documentId).toBeUndefined();
    expect(mapped.provenance.evidence).toEqual([]);
  });

  it('offers no safe path when the plan already pays that invoice to the account on file', () => {
    const plan = surfacedPlan();
    const v = VENDORS['v-anand']!;
    plan.actions.push({
      ...plan.actions.find((a) => a.kind === 'pay_vendor' && a.vendorId === 'v-anand')!,
      instructedBy: 'user',
      instructionDocumentId: null,
      instructionQuote: ctx.request,
      bankAccountNumber: v.bank.accountNumber,
      ifsc: v.bank.ifsc,
    });
    const { cards, decisions } = cardsFor(plan);
    const held = cards.find((c) => c.tier === 3)!;
    expect(rerouteToAccountOnFile(held, ctx, decisions)).toBeNull();
    expect(rerouteToAccountOnFile(held, ctx, held.items)).not.toBeNull();
  });
});
