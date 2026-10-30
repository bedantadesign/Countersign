import type { Reversibility } from '@/lib/types';
import { formatClock, formatCountdown } from '@/lib/format';
import { Icon } from './Icon';

interface Props {
  reversibility: Reversibility;
  now: number;
  /** When the clock started running. Omit to show the window as not yet started. */
  startedAt?: number;
  /** Absolute close time, if known. */
  until?: number;
}

const hoursLabel = (ms: number) => {
  const h = Math.round(ms / 3_600_000);
  if (h >= 1) return `${h} hours`;
  return `${Math.round(ms / 60_000)} minutes`;
};

/** Drains in real time while an action can still be undone. Reads "Cannot be undone" when it can't. */
export function ReversibilityMeter({ reversibility, now, startedAt, until }: Props) {
  if (reversibility.kind === 'permanent') {
    return (
      <div className="rev rev--permanent">
        <div className="rev__row">
          <span className="rev__label">
            <Icon name="clock" size={14} /> Undo
          </span>
          <span className="rev__time">Cannot be undone</span>
        </div>
      </div>
    );
  }
  if (reversibility.kind === 'full') {
    return (
      <div className="rev">
        <div className="rev__row">
          <span className="rev__label">
            <Icon name="clock" size={14} /> Undo
          </span>
          <span className="rev__time">Anytime</span>
        </div>
      </div>
    );
  }

  const close = until ?? reversibility.expiresAt;
  const started = startedAt !== undefined && (close !== undefined || reversibility.windowMs !== undefined);
  const total = close !== undefined && startedAt !== undefined ? close - startedAt : reversibility.windowMs;
  const remaining = close !== undefined && started ? Math.max(0, close - now) : reversibility.windowMs;
  const fraction = total && remaining !== undefined ? Math.min(1, Math.max(0, remaining / total)) : 1;

  const closed = started && remaining === 0;
  return (
    <div className="rev" role="group" aria-label={reversibility.label}>
      <div className="rev__row">
        <span className="rev__label">
          <Icon name="clock" size={14} /> {reversibility.label}
          {close !== undefined && !closed ? ` · until ${formatClock(close)}` : ''}
        </span>
        <span className="rev__time">
          {closed
            ? 'Window closed'
            : started && remaining !== undefined
              ? formatCountdown(remaining)
              : reversibility.windowMs !== undefined
                ? `${hoursLabel(reversibility.windowMs)} after you confirm`
                : ''}
        </span>
      </div>
      <div className="meter" aria-hidden="true">
        <div className="meter__fill" style={{ '--p': fraction } as React.CSSProperties} />
      </div>
    </div>
  );
}
