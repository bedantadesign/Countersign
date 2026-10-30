import { describe, expect, it } from 'vitest';
import { buildCards, cardTotalPaise, rerouteToAccountOnFile } from '../cards';
import { decide } from '../tiering';
import { buildScenario } from '../fixtures';
import { initialState, reducer, openCards, handledCards, type State } from '../reducer';
import { formatCountdown, formatINR, maskAccount } from '../format';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const { ctx, plan } = buildScenario(NOW);
const decisions = plan.map((a) => decide(a, ctx));
const cards = buildCards(decisions);

function ready(): State {
  return reducer(initialState, { type: 'ready', decisions });
}

describe('buildCards', () => {
  it('produces four cards in order of distrust: held, payments, IRNs, reminders', () => {
    expect(cards.map((c) => `${c.tier}:${c.kind}`)).toEqual([
      '3:update_bank_details',
      '2:pay_vendor',
      '2:generate_irn',
      '1:send_reminder',
    ]);
  });

  it('puts both injected actions on one held card, apart from the safe payments', () => {
    const held = cards[0]!;
    expect(held.items.map((d) => d.action.id).sort()).toEqual(['a-bank-anand', 'a-pay-anand']);
    const payments = cards.find((c) => c.id === '2:pay_vendor')!;
    expect(payments.items.map((d) => d.action.id)).toEqual(['a-pay-sundaram', 'a-pay-kaveri']);
  });

  it('bundles six IRNs and seven reminders', () => {
    expect(cards.find((c) => c.kind === 'generate_irn')!.items).toHaveLength(6);
    expect(cards.find((c) => c.kind === 'send_reminder')!.items).toHaveLength(7);
  });

  it('never makes a card out of Tier 0', () => {
    expect(cards.flatMap((c) => c.items).every((d) => d.tier > 0)).toBe(true);
  });

  it('totals a card in paise', () => {
    expect(cardTotalPaise(cards.find((c) => c.id === '2:pay_vendor')!)).toBe(30_850_000);
  });
});

describe('reducer', () => {
  it('opens with every card unresolved', () => {
    const s = ready();
    expect(openCards(s)).toHaveLength(4);
    expect(handledCards(s)).toHaveLength(0);
  });

  it('starts the 24 hour window on approval for IRNs', () => {
    const s = reducer(ready(), { type: 'approve', cardId: '2:generate_irn', at: NOW });
    const r = s.resolutions['2:generate_irn']!;
    expect(r.kind === 'approved' && r.undoUntil).toBe(NOW + 24 * 60 * 60 * 1000);
  });

  it('keeps the bank cutoff fixed for payments, whenever you approve', () => {
    const s = reducer(ready(), { type: 'approve', cardId: '2:pay_vendor', at: NOW + 600_000 });
    const r = s.resolutions['2:pay_vendor']!;
    expect(r.kind === 'approved' && r.undoUntil).toBe(ctx.paymentCutoffAt);
  });

  it('lets Tier 1 approve a subset and refuses an empty one', () => {
    const ids = cards.find((c) => c.kind === 'send_reminder')!.items.map((d) => d.action.id);
    const none = reducer(ready(), { type: 'approve', cardId: '1:send_reminder', at: NOW, approvedIds: [] });
    expect(none.resolutions['1:send_reminder']).toBeUndefined();
    const some = reducer(ready(), { type: 'approve', cardId: '1:send_reminder', at: NOW, approvedIds: ids.slice(0, 5) });
    const r = some.resolutions['1:send_reminder']!;
    expect(r.kind === 'approved' && r.approvedIds).toHaveLength(5);
  });

  it('has no way to approve a Tier 3 card', () => {
    const held = cards[0]!;
    const s = reducer(ready(), { type: 'approve', cardId: held.id, at: NOW });
    expect(s.resolutions[held.id]).toBeUndefined();
  });

  it('undo returns a card to the open list', () => {
    let s = reducer(ready(), { type: 'approve', cardId: '2:generate_irn', at: NOW });
    s = reducer(s, { type: 'undo', cardId: '2:generate_irn' });
    expect(openCards(s)).toHaveLength(4);
  });

  it('reroutes a held payment to the account on file as a normal countersign', () => {
    const held = cards[0]!;
    const newCard = rerouteToAccountOnFile(held, ctx)!;
    expect(newCard.tier).toBe(2);
    expect(newCard.items[0]!.action.bank).toEqual(ctx.vendors['v-anand']!.bank);
    expect(newCard.items[0]!.provenance.origin).toBe('user');

    const s = reducer(ready(), { type: 'reroute', cardId: held.id, at: NOW, newCard });
    expect(s.resolutions[held.id]).toMatchObject({ kind: 'rerouted', newCardId: newCard.id });
    expect(openCards(s).map((c) => c.id)).toContain(newCard.id);
    // placed ahead of the other open cards
    expect(openCards(s)[0]!.id).toBe(newCard.id);
  });

  it('offers no reroute for holds that paying the account on file cannot fix', () => {
    const v = ctx.vendors['v-sundaram']!;
    const base = {
      id: 'held',
      kind: 'pay_vendor' as const,
      title: 'Pay Sundaram',
      counterparty: { id: v.id, name: v.name },
      bank: v.bank,
      provenance: { origin: 'user' as const },
    };
    const outlier = decide({ ...base, amountPaise: v.averagePaymentPaise * 4 }, ctx);
    const vendors = { ...ctx.vendors, [v.id]: { ...v, bankChangedAt: '2026-10-20' } };
    const recentChange = decide({ ...base, amountPaise: 24_000_000 }, { ...ctx, vendors });

    expect(outlier.tier).toBe(3);
    expect(recentChange.tier).toBe(3);
    expect(rerouteToAccountOnFile(buildCards([outlier])[0]!, ctx)).toBeNull();
    expect(rerouteToAccountOnFile(buildCards([recentChange])[0]!, { ...ctx, vendors })).toBeNull();
  });

  it('refuses a reroute that would land on another Tier 3 card', () => {
    const held = cards[0]!;
    const stillHeld = { ...held, id: 'other' };
    const s = reducer(ready(), { type: 'reroute', cardId: held.id, at: NOW, newCard: stillHeld });
    expect(s.resolutions[held.id]).toBeUndefined();
  });
});

describe('format', () => {
  it('writes rupees the Indian way', () => {
    expect(formatINR(24_000_000)).toBe('₹2,40,000');
    expect(formatINR(105_020_000)).toBe('₹10,50,200');
    expect(formatINR(123_450)).toBe('₹1,234.50');
  });
  it('masks accounts to the last four digits', () => expect(maskAccount('447100281936')).toBe('•••• 1936'));
  it('counts down without negative time', () => {
    expect(formatCountdown(4_982_000)).toBe('1h 23m 02s');
    expect(formatCountdown(61_000)).toBe('1m 01s');
    expect(formatCountdown(-5)).toBe('0m 00s');
  });
});
