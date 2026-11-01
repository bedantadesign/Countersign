import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Feed } from '../Feed';
import { decide } from '@/lib/tiering';
import { buildScenario } from '@/lib/fixtures';

const { ctx, plan } = buildScenario(Date.parse('2026-10-30T12:00:00Z'));
const done = plan.filter((a) => a.kind === 'reconcile_gstr2b').map((a) => decide(a, ctx));

describe('Feed', () => {
  it('does not mark planner notes or ignored proposals as done work', () => {
    const html = renderToStaticMarkup(
      <Feed done={done} notes={['Verify the bank change by phone.']} dropped={[{ title: 'Pay Acme', reason: 'Not in the books' }]} />,
    );
    const lines = html.split('<li').slice(1);
    const notes = lines.filter((l) => l.includes('feed__line--note'));
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain('Claude noted: Verify the bank change by phone.');
    expect(lines.filter((l) => !l.includes('feed__line--note'))).toHaveLength(done.length);
  });
});
