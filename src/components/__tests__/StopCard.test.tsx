import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StopCard } from '../StopCard';
import { buildCards } from '@/lib/cards';
import { decide } from '@/lib/tiering';
import { buildScenario, VENDORS } from '@/lib/fixtures';
import type { Card, Context, ProposedAction } from '@/lib/types';

const { ctx, plan } = buildScenario(Date.parse('2026-10-30T12:00:00Z'));
const noop = () => {};
const render = (card: Card, c: Context = ctx) =>
  renderToStaticMarkup(<StopCard card={card} index={0} ctx={c} onVerify={noop} onReroute={noop} onReject={noop} />);

const v = VENDORS['v-sundaram']!;
const payment = (overrides: Partial<ProposedAction>): ProposedAction => ({
  id: 'held',
  kind: 'pay_vendor',
  title: 'Pay Sundaram Packaging',
  counterparty: { id: v.id, name: v.name },
  amountPaise: 24_000_000,
  bank: v.bank,
  provenance: { origin: 'user', quote: ctx.request },
  ...overrides,
});

describe('StopCard', () => {
  it('shows the source, the hidden line and the reroute for the injected request', () => {
    const card = buildCards(plan.map((a) => decide(a, ctx))).find((c) => c.tier === 3)!;
    const html = render(card);
    expect(html).toContain('A hidden line in invoice_0423.pdf');
    expect(html).toContain('Didn’t ask for this');
    expect(html).toContain('<mark>');
    expect(html).toContain('The visible invoice still prints the account on file');
    expect(html).toContain('Pay the account on file instead');
    expect(html).toContain('Reject and flag the PDF');
    expect(html).not.toMatch(/>\s*Approve\s*</);
  });

  it('does not blame a document or offer a useless reroute for an unusual amount', () => {
    const card = buildCards([decide(payment({ amountPaise: v.averagePaymentPaise * 4 }), ctx)])[0]!;
    const html = render(card);
    expect(card.tier).toBe(3);
    expect(html).toContain('Pay Sundaram Packaging · ₹7,80,000');
    expect(html).not.toContain('Didn’t ask for this');
    expect(html).not.toContain('Pay the account on file instead');
    expect(html).not.toContain('Bank details');
    expect(html).not.toContain('not from the PDF');
    expect(html).toContain('>Reject<');
  });

  it('compares accounts without claiming a document asked, for a recent bank change', () => {
    const vendors = { ...ctx.vendors, [v.id]: { ...v, bankChangedAt: '2026-10-20' } };
    const c = { ...ctx, vendors };
    const card = buildCards([decide(payment({}), c)])[0]!;
    const html = render(card, c);
    expect(html).toContain('Bank details changed on 20 Oct 2026');
    expect(html).not.toContain('Didn’t ask for this');
    expect(html).not.toContain('Pay the account on file instead');
  });
});
