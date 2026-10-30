'use client';

import { useState } from 'react';
import type { Card } from '@/lib/types';
import { cardTotalPaise } from '@/lib/cards';
import { formatINR, plural } from '@/lib/format';
import { CardShell } from './CardShell';
import { WhyDetails } from './WhyDetails';

interface Props {
  card: Card;
  index: number;
  onApprove: (ids: string[]) => void;
}

/** Tier 1: one card, a stacked preview, approve all or approve some. No hold, no ceremony. */
export function BatchCard({ card, index, onApprove }: Props) {
  const [choosing, setChoosing] = useState(false);
  const allIds = card.items.map((d) => d.action.id);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allIds));
  const n = card.items.length;
  const picked = allIds.filter((id) => selected.has(id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <CardShell
      id={card.id}
      tier={1}
      index={index}
      title={`Send ${plural(n, 'payment reminder')}`}
      total={`${formatINR(cardTotalPaise(card))} overdue`}
      why={card.items[0]!.why}
    >
      {!choosing ? (
        <div className="pile" aria-hidden="true">
          {n > 2 ? <div className="pile__back" style={{ '--n': 2 } as React.CSSProperties} /> : null}
          {n > 1 ? <div className="pile__back" style={{ '--n': 1 } as React.CSSProperties} /> : null}
          <div className="pile__mail">
            <span className="pile__count">1 of {n}</span>
            <p className="pile__to">To {card.items[0]!.action.email?.to}</p>
            <p>{card.items[0]!.action.email?.subject}</p>
          </div>
        </div>
      ) : (
        <ul className="lines">
          {card.items.map(({ action }) => (
            <li key={action.id}>
              <label className="pick">
                <input type="checkbox" checked={selected.has(action.id)} onChange={() => toggle(action.id)} />
                <span className="line__name">{action.counterparty?.name}</span>
                <span className="pick__amount">{formatINR(action.amountPaise ?? 0)}</span>
                <span className="pick__sub">{action.detail}</span>
              </label>
              <details className="details">
                <summary>Read the email</summary>
                <p className="pick__body" style={{ marginTop: 8 }}>
                  {action.email?.body}
                </p>
              </details>
            </li>
          ))}
        </ul>
      )}

      <div className="actions actions--row">
        <button
          type="button"
          className="btn btn--tier"
          disabled={picked.length === 0}
          onClick={() => onApprove(picked)}
        >
          {picked.length === n ? `Send all ${n}` : `Send ${picked.length} of ${n}`}
        </button>
        <button type="button" className="btn" onClick={() => setChoosing((c) => !c)}>
          {choosing ? 'Done choosing' : 'Choose which to send'}
        </button>
      </div>
      <WhyDetails decisions={card.items} />
    </CardShell>
  );
}
