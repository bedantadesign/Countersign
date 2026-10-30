import { formatDay } from '@/lib/format';
import { plural } from '@/lib/format';

interface Props {
  open: number;
  handled: number;
  done: number;
  at: number;
}

/** The roll-up: how many things need you, how many were already done quietly. */
export function Brief({ open, handled, done, at }: Props) {
  return (
    <header className="brief">
      <p className="eyebrow">Month-end brief · {formatDay(at)}</p>
      <h1 id="brief-title" tabIndex={-1} data-focus-target="brief">
        {open > 0 ? (
          <>
            <span className="brief__count">{open}</span> {open === 1 ? 'thing needs' : 'things need'} you
          </>
        ) : (
          'All clear'
        )}
      </h1>
      <p aria-live="polite">
        {open > 0
          ? `${done} other ${done === 1 ? 'step is' : 'steps are'} already done and logged below.`
          : `You handled ${plural(handled, 'thing')}. Nothing went out that you didn’t see.`}
      </p>
    </header>
  );
}
