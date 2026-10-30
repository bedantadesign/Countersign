'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

interface Props {
  label: string;
  onConfirm: () => void;
  durationMs?: number;
}

/**
 * Deliberate friction for Tier 2: nothing happens on a click. You hold for 1.2 s and can let
 * go at any point to cancel. Works with a pointer, touch, or by holding Space or Enter.
 */
export function HoldButton({ label, onConfirm, durationMs = 1200 }: Props) {
  const [holding, setHolding] = useState(false);
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const hintId = useRef(`hold-${Math.random().toString(36).slice(2)}`).current;

  const stop = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    setHolding(false);
  }, []);

  const start = useCallback(() => {
    if (timer.current !== undefined || done) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setHolding(false);
      setDone(true);
      onConfirm();
    }, durationMs);
  }, [done, durationMs, onConfirm]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <div className="confirm">
      <button
        type="button"
        className="hold"
        data-holding={holding}
        style={{ '--hold-ms': `${durationMs}ms` } as React.CSSProperties}
        aria-describedby={hintId}
        onPointerDown={(e) => {
          if (e.button === 0) start();
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
            e.preventDefault();
            start();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') stop();
        }}
        onBlur={stop}
      >
        <span className="hold__fill" aria-hidden="true" />
        <span className="hold__label">
          <Icon name={done ? 'check' : 'pen'} size={18} />
          {done ? 'Confirmed' : holding ? 'Keep holding…' : label}
        </span>
      </button>
      <p className="hint" id={hintId}>
        Press and hold for {(durationMs / 1000).toFixed(1)} seconds, or hold Space. Let go to cancel.
      </p>
    </div>
  );
}
