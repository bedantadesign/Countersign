'use client';

import type { Card, Context } from '@/lib/types';
import type { Resolution } from '@/lib/reducer';
import { summarise } from '@/lib/summary';
import { Icon } from './Icon';
import { ReversibilityMeter } from './ReversibilityMeter';

interface Props {
  card: Card;
  resolution: Resolution;
  ctx: Context;
  now: number;
  onUndo: () => void;
}

/** A resolved card, collapsed. The undo window keeps draining here until it closes. */
export function HandledRow({ card, resolution, ctx, now, onUndo }: Props) {
  const s = summarise(card, resolution, ctx);
  const windowOpen = resolution.kind === 'approved' && resolution.undoUntil !== undefined && now < resolution.undoUntil;
  // Anything that came off a Tier 3 card keeps its caught-and-stopped look.
  const held = card.tier === 3;

  return (
    <li className="done" data-tier={held ? 3 : card.tier}>
      <div className="done__top">
        <span className="glyph" data-tier={held ? 3 : card.tier}>
          <Icon name={held ? 'stop' : 'check'} size={14} />
        </span>
        <div>
          <p className="done__title">{s.title}</p>
          {s.detail ? <p className="done__detail">{s.detail}</p> : null}
        </div>
        {windowOpen && s.undoLabel ? (
          <button type="button" className="btn btn--quiet" onClick={onUndo}>
            <Icon name="undo" size={14} /> {s.undoLabel}
          </button>
        ) : null}
      </div>
      {resolution.kind === 'approved' ? (
        <ReversibilityMeter
          reversibility={card.items[0]!.reversibility}
          now={now}
          startedAt={resolution.at}
          until={resolution.undoUntil}
        />
      ) : null}
    </li>
  );
}
