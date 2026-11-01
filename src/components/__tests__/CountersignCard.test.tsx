import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CountersignCard } from '../CountersignCard';
import { buildCards } from '@/lib/cards';
import { decide } from '@/lib/tiering';
import { buildScenario } from '@/lib/fixtures';
import { formatClock } from '@/lib/format';

const { ctx, plan } = buildScenario(Date.parse('2026-10-30T12:00:00Z'));
const card = buildCards(plan.map((a) => decide(a, ctx))).find((c) => c.kind === 'pay_vendor')!;
const render = (now: number) =>
  renderToStaticMarkup(<CountersignCard card={card} index={0} ctx={ctx} now={now} onConfirm={() => {}} />);

describe('CountersignCard', () => {
  it('names the next bank batch when the tab stays open past the cutoff', () => {
    const next = ctx.paymentCutoffAt + 30 * 60 * 1000;
    const html = render(ctx.paymentCutoffAt + 60_000);
    expect(html).toContain(`next bank batch at ${formatClock(next)}`);
    expect(html).not.toContain(`at ${formatClock(ctx.paymentCutoffAt)}`);
    expect(html).not.toContain('Window closed');
  });

  it('names the original batch before the cutoff', () => {
    expect(render(ctx.now)).toContain(`next bank batch at ${formatClock(ctx.paymentCutoffAt)}`);
  });
});
