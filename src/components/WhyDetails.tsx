import type { Decision } from '@/lib/types';
import { Icon } from './Icon';

/** "Why am I seeing this", with the exact rules that fired. Nothing here is model judgment. */
export function WhyDetails({ decisions }: { decisions: Decision[] }) {
  const seen = new Set<string>();
  const hits = decisions
    .flatMap((d) => d.hits)
    .filter((h) => (seen.has(h.ruleId + h.reason) ? false : (seen.add(h.ruleId + h.reason), true)));
  const byRule = [...new Map(hits.map((h) => [h.ruleId, h])).values()];

  return (
    <details className="details">
      <summary>
        How this was decided <Icon name="chevron" size={14} />
      </summary>
      <div className="details__body">
        {byRule.map((h) => (
          <p className="rule-hit" key={h.ruleId}>
            <b>{h.ruleId}</b>
            <span>
              {h.name}, Tier {h.tier}. {h.reason}
            </span>
          </p>
        ))}
        <p className="hint" style={{ textAlign: 'left' }}>
          Fixed rules over reversibility, blast radius and where the instruction came from. The model proposes; it does
          not pick the tier.
        </p>
      </div>
    </details>
  );
}
