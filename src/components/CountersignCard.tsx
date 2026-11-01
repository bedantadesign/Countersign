'use client';

import type { Card, Context } from '@/lib/types';
import { cardTotalPaise } from '@/lib/cards';
import { COMPANY } from '@/lib/fixtures';
import { formatClock, formatINR, maskAccount, plural } from '@/lib/format';
import { sameAccount } from '@/lib/tiering';
import { CardShell } from './CardShell';
import { HoldButton } from './HoldButton';
import { Icon } from './Icon';
import { ReversibilityMeter } from './ReversibilityMeter';
import { WhyDetails } from './WhyDetails';
import { windowClose } from '@/lib/reducer';

interface Props {
  card: Card;
  index: number;
  ctx: Context;
  now: number;
  onConfirm: () => void;
}

/** Tier 2: the exact action, the amount, the undo window, and a deliberate press-and-hold. */
export function CountersignCard({ card, index, ctx, now, onConfirm }: Props) {
  const isIrn = card.kind === 'generate_irn';
  const n = card.items.length;
  const first = card.items[0]!;
  const rev = first.reversibility;
  // The batch that is actually next: if the tab stayed open past a cutoff, this rolls forward.
  const cutoff = rev.kind === 'windowed' && rev.expiresAt !== undefined ? windowClose(rev, now) : undefined;
  const batchOpenedAt =
    cutoff !== undefined && rev.kind === 'windowed' && rev.everyMs ? Math.max(ctx.now, cutoff - rev.everyMs) : ctx.now;

  const title = isIrn ? `Generate ${plural(n, 'e-invoice IRN')}` : `Pay ${plural(n, 'vendor')}`;
  const holdLabel = isIrn ? `Hold to generate ${n} IRNs` : `Hold to pay ${formatINR(cardTotalPaise(card))}`;

  const row = ({ action }: Card['items'][number]) => {
    const vendor = action.counterparty ? ctx.vendors[action.counterparty.id] : undefined;
    const onFile = vendor && action.bank ? sameAccount(action.bank, vendor.bank) : false;
    return (
      <li className="line" key={action.id}>
        <span className="line__name">{action.counterparty?.name}</span>
        <span className="line__amount">{formatINR(action.amountPaise ?? 0)}</span>
        <span className="line__sub">
          {isIrn
            ? `${action.refId} · ${action.counterparty?.gstin}`
            : `Invoice ${action.refId} · to ${action.bank ? maskAccount(action.bank.accountNumber) : ''}`}
        </span>
        {!isIrn && onFile ? (
          <span className="line__flag on-file">
            <Icon name="check" size={12} /> Account on file
          </span>
        ) : null}
      </li>
    );
  };
  // Every item stays one click away; long lists show the first few so the card stays proportionate.
  const shown = card.items.length > 4 ? card.items.slice(0, 3) : card.items;
  const rest = card.items.slice(shown.length);

  return (
    <CardShell
      id={card.id}
      tier={2}
      index={index}
      title={title}
      total={formatINR(cardTotalPaise(card))}
      why={first.why}
    >
      <ul className="lines">{shown.map(row)}</ul>
      {rest.length ? (
        <details className="details">
          <summary>
            Show {rest.length} more {isIrn ? 'invoices' : 'payments'} <Icon name="chevron" size={12} />
          </summary>
          <ul className="lines">{rest.map(row)}</ul>
        </details>
      ) : null}

      <div className="note">
        <span className="note__label">When you confirm</span>
        <p>
          {isIrn
            ? 'Each invoice is registered on the IRP now and gets an IRN and a signed QR code. After the window closes, an IRN is permanent.'
            : `Payments are queued from ${COMPANY.paysFrom} for the next bank batch${cutoff ? ` at ${formatClock(cutoff)}` : ''}. Once the batch is released, a transfer can’t be recalled.`}
        </p>
      </div>

      <ReversibilityMeter
        reversibility={first.reversibility}
        now={now}
        startedAt={isIrn ? undefined : batchOpenedAt}
        until={isIrn ? undefined : cutoff}
      />

      <HoldButton label={holdLabel} onConfirm={onConfirm} />
      <WhyDetails decisions={card.items} />
    </CardShell>
  );
}
