import type { Card, Context } from './types';
import type { Resolution } from './reducer';
import { cardTotalPaise } from './cards';
import { formatClock, formatINR, plural } from './format';

export interface Summary {
  title: string;
  detail?: string;
  /** Label for the undo affordance while its window is open. */
  undoLabel?: string;
}

export function summarise(card: Card, res: Resolution, ctx: Context): Summary {
  switch (res.kind) {
    case 'approved': {
      const total = formatINR(cardTotalPaise(card));
      if (card.kind === 'generate_irn') {
        return {
          title: `Requested ${plural(res.approvedIds.length, 'IRN')} from the IRP`,
          detail: `${total} of invoices`,
          undoLabel: 'Cancel IRNs',
        };
      }
      if (card.kind === 'pay_vendor') {
        return {
          title: `Queued ${plural(res.approvedIds.length, 'payment')}`,
          detail: res.undoUntil ? `${total} · released at ${formatClock(res.undoUntil)}` : total,
          undoLabel: 'Cancel payments',
        };
      }
      const all = res.approvedIds.length === card.items.length;
      return {
        title: all
          ? `Sent ${plural(res.approvedIds.length, 'reminder')}`
          : `Sent ${res.approvedIds.length} of ${card.items.length} reminders`,
        detail: all ? undefined : `${card.items.length - res.approvedIds.length} held back`,
        undoLabel: 'Undo send',
      };
    }
    case 'verifying': {
      const vendor = card.items[0]?.action.counterparty ? ctx.vendors[card.items[0].action.counterparty.id] : undefined;
      return {
        title: 'Held for verification',
        detail: vendor
          ? `Nothing was sent to the new account. Call ${vendor.contactName} on ${vendor.contactPhone}, the number on file.`
          : 'Nothing was sent to the new account.',
      };
    }
    case 'rerouted':
      return {
        title: 'Redirected to the account on file',
        detail: 'The new account was discarded. A normal countersign is waiting for the payment.',
      };
    case 'rejected':
      return { title: 'Rejected and flagged', detail: 'Nothing was changed. The source document is flagged for review.' };
  }
}
