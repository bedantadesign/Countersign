import type { Decision } from '@/lib/types';
import type { Dropped } from '@/lib/planner/map';
import { Icon } from './Icon';

interface Line {
  key: string;
  title: string;
  detail?: string;
}

/** Tier 0: logged as quiet lines, never as cards. Seven reminder drafts collapse into one line. */
function toLines(done: Decision[]): Line[] {
  const lines: Line[] = [];
  const drafts = done.filter((d) => d.action.kind === 'draft_reminder');
  for (const d of done) {
    if (d.action.kind === 'draft_reminder') continue;
    lines.push({ key: d.action.id, title: d.action.title, detail: d.action.detail });
  }
  if (drafts.length) {
    lines.push({ key: 'drafts', title: `Drafted ${drafts.length} payment reminders` });
  }
  return lines;
}

interface Props {
  done: Decision[];
  /** Observations from the planner. Shown, never acted on. */
  notes?: string[];
  /** Proposals that named records the books don't have. */
  dropped?: Dropped[];
}

export function Feed({ done, notes = [], dropped = [] }: Props) {
  const lines = [
    ...toLines(done),
    ...notes.map((n, i) => ({ key: `note-${i}`, title: `Claude noted: ${n}`, detail: undefined })),
    ...dropped.map((d, i) => ({ key: `dropped-${i}`, title: `Ignored a proposal: ${d.title}`, detail: d.reason })),
  ];
  return (
    <ul className="feed" aria-label="Done and logged">
      {lines.map((l, i) => (
        <li className="feed__line" key={l.key} style={{ '--i': i } as React.CSSProperties}>
          <span className="glyph" data-tier={0}>
            <Icon name="check" size={14} />
          </span>
          <span>
            {l.title}
            {l.detail ? <span className="feed__detail"> · {l.detail}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
