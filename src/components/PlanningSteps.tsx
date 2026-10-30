import { PLANNING_STEPS } from '@/lib/fixtures';
import { Icon } from './Icon';

export function PlanningSteps({ step }: { step: number }) {
  return (
    <ul className="planning" aria-label="Claude is planning" aria-live="polite">
      {PLANNING_STEPS.map((label, i) => (
        <li key={label} data-done={i < step}>
          <span className="planning__mark">{i < step ? <Icon name="check" size={10} /> : null}</span>
          {label}
        </li>
      ))}
    </ul>
  );
}
