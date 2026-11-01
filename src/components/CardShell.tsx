import type { Tier } from '@/lib/types';
import { Icon, TIER_ICON, TIER_LABEL } from './Icon';

interface Props {
  id: string;
  tier: 1 | 2 | 3;
  index: number;
  title: string;
  total?: string;
  why: string;
  children: React.ReactNode;
}

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className="badge" data-tier={tier}>
      <span className="glyph" data-tier={tier}>
        <Icon name={TIER_ICON[tier]} size={16} />
      </span>
      Tier {tier} · {TIER_LABEL[tier]}
    </span>
  );
}

/** Shared frame: the badge, the headline, and the one-line "why am I seeing this". */
export function CardShell({ id, tier, index, title, total, why, children }: Props) {
  return (
    <article className="card" data-tier={tier} style={{ '--i': index } as React.CSSProperties} aria-labelledby={`${id}-title`}>
      <header className="card__head">
        <TierBadge tier={tier} />
        <div className="card__headline">
          <h2 className="card__title" id={`${id}-title`} tabIndex={-1} data-focus-target={id}>
            {title}
          </h2>
          {total ? <p className="card__total">{total}</p> : null}
        </div>
        <p className="why">{why}</p>
      </header>
      {children}
    </article>
  );
}
