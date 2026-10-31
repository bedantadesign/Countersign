import { Icon } from './Icon';

export function PlanningSteps({ steps, step }: { steps: readonly string[]; step: number }) {
  return (
    <ul className="planning" aria-label="Claude is planning" aria-live="polite">
      {steps.map((label, i) => (
        <li key={label} data-done={i < step}>
          <span className="planning__mark">{i < step ? <Icon name="check" size={10} /> : null}</span>
          {label}
        </li>
      ))}
    </ul>
  );
}
