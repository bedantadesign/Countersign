import { describe, expect, it } from 'vitest';
import { buildScenario } from '../fixtures';
import { initialState, reducer } from '../reducer';
import { progressReport } from '../report';
import { decide } from '../tiering';

const NOW = Date.parse('2026-11-01T15:00:00Z');
const { ctx, plan } = buildScenario(NOW);
const ready = reducer(initialState, { type: 'ready', decisions: plan.map((a) => decide(a, ctx)) });

describe('progressReport', () => {
  it('says nothing until there is a plan', () => {
    expect(progressReport(initialState, ctx)).toBeNull();
  });

  it('lists what waits on the person, and marks what a document asked for', () => {
    const report = progressReport(ready, ctx)!;
    expect(report).toContain('fictional company');
    expect(report).toContain(
      '- Tier 3: change where a vendor is paid (asked for by text inside a vendor invoice, not by the person)',
    );
    expect(report).toContain('- Tier 2: pay 2 vendor invoices, ₹3,08,500');
    expect(report).toContain('- Tier 1: send 7 payment reminders');
    expect(report).not.toContain('Handled by the person');
  });

  it('reports what the person did', () => {
    const rejected = reducer(ready, { type: 'reject', cardId: ready.cards[0]!.id, at: NOW });
    const report = progressReport(rejected, ctx)!;
    expect(report).toContain('Handled by the person:\n- Rejected and flagged');
    expect(report).not.toContain('Tier 3');
  });
});
