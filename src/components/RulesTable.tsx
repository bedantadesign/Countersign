import { RULES } from '@/lib/tiering';
import { TIER_LABEL } from './Icon';

export function RulesTable() {
  return (
    <details className="rules">
      <summary>
        <span>How decisions are made</span>
        <span className="rules__sub">{RULES.length} fixed rules</span>
      </summary>
      <ol className="rules__list">
        {RULES.map((r) => (
          <li className="rules__item" key={r.id} data-tier={r.tier}>
            <span className="rules__id">{r.id}</span>
            <span>
              <span className="rules__name">{r.name}</span>
              <span className="rules__tier">
                Tier {r.tier} · {TIER_LABEL[r.tier]}
              </span>
            </span>
            <span className="rules__summary">{r.summary}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
