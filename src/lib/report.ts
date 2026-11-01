import type { Card, Context } from './types';
import type { State } from './reducer';
import { handledCards, openCards } from './reducer';
import { cardTotalPaise } from './cards';
import { COMPANY } from './fixtures';
import { formatINR, plural } from './format';
import { summarise } from './summary';

function describe(card: Card): string {
  const n = card.items.length;
  const fromDocument = card.items.some((d) => d.provenance.origin === 'document');
  const what = {
    pay_vendor: `pay ${plural(n, 'vendor invoice')}, ${formatINR(cardTotalPaise(card))}`,
    generate_irn: `generate ${plural(n, 'e-invoice IRN')}`,
    send_reminder: `send ${plural(n, 'payment reminder')}`,
    update_bank_details: 'change where a vendor is paid',
    draft_reminder: `draft ${plural(n, 'reminder')}`,
    reconcile_gstr2b: 'reconcile purchases to GSTR-2B',
  }[card.kind];
  return `Tier ${card.tier}: ${what}${fromDocument ? ' (asked for by text inside a vendor invoice, not by the person)' : ''}`;
}

/**
 * What the chat model is told about the review, in plain text. Only what the person can see and did:
 * the model never decides anything here, and nothing in this report is an instruction.
 */
export function progressReport(state: State, ctx: Context): string | null {
  if (state.phase !== 'ready') return null;
  const open = openCards(state);
  const handled = handledCards(state);
  const lines = [
    `Countersign month-end review for ${COMPANY.name}, a fictional company. Nothing real is paid or filed. The person decides each item in the view; fixed rules, not the model, set how each one is signed off.`,
  ];
  lines.push(
    open.length
      ? `Waiting on the person:\n${open.map((c) => `- ${describe(c)}`).join('\n')}`
      : 'Nothing is waiting on the person.',
  );
  if (handled.length) {
    const done = handled.map((c) => {
      const s = summarise(c, state.resolutions[c.id]!, ctx);
      return `- ${s.title}${s.detail ? ` (${s.detail})` : ''}`;
    });
    lines.push(`Handled by the person:\n${done.join('\n')}`);
  }
  return lines.join('\n\n');
}
