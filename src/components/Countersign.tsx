'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { buildScenario, COMPANY, PLANNING_STEPS, TASK, type Scenario } from '@/lib/fixtures';
import { decide } from '@/lib/tiering';
import { loggedDecisions, rerouteToAccountOnFile } from '@/lib/cards';
import { handledCards, initialState, openCards, reducer } from '@/lib/reducer';
import { BatchCard } from './BatchCard';
import { Brief } from './Brief';
import { CountersignCard } from './CountersignCard';
import { Feed } from './Feed';
import { HandledRow } from './HandledRow';
import { Icon, TIER_ICON, TIER_LABEL } from './Icon';
import { PlanningSteps } from './PlanningSteps';
import { RulesTable } from './RulesTable';
import { StopCard } from './StopCard';

const LEGEND = [
  [0, 'Reads, drafts and reconciles. Logged, never interrupted.'],
  [1, 'Reaches other people, moves no money. One card, approve all or some.'],
  [2, 'Pays or files. The exact action, the undo window, and a deliberate hold.'],
  [3, 'Looks wrong, or came from a document. No Approve button. Verify first.'],
] as const;

function useNow(active: boolean) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function focusTarget(id: string) {
  document.querySelector<HTMLElement>(`[data-focus-target="${id}"]`)?.focus({ preventScroll: false });
}

export function Countersign() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [step, setStep] = useState(0);
  const timers = useRef<number[]>([]);
  const now = useNow(state.phase === 'ready');

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const run = useCallback(() => {
    clearTimers();
    const sc = buildScenario(Date.now());
    setScenario(sc);
    setStep(0);
    dispatch({ type: 'planning' });

    const gap = prefersReducedMotion() ? 0 : 420;
    PLANNING_STEPS.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setStep(i + 1), gap * (i + 1)));
    });
    timers.current.push(
      window.setTimeout(
        () => dispatch({ type: 'ready', decisions: sc.plan.map((a) => decide(a, sc.ctx)) }),
        gap * (PLANNING_STEPS.length + 1),
      ),
    );
  }, [clearTimers]);

  const reset = useCallback(() => {
    clearTimers();
    setScenario(null);
    dispatch({ type: 'reset' });
    window.scrollTo({ top: 0 });
  }, [clearTimers]);

  // Focus: the brief when the plan lands, the next open card when one is handled (not on undo).
  const handledCount = Object.keys(state.resolutions).length;
  const prevHandled = useRef(0);
  useEffect(() => {
    if (state.phase === 'ready' && handledCount === 0 && prevHandled.current === 0) focusTarget('brief');
  }, [state.phase, handledCount]);
  useEffect(() => {
    if (handledCount > prevHandled.current) {
      const next = openCards(state)[0];
      focusTarget(next ? next.id : 'brief');
    }
    prevHandled.current = handledCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handledCount]);

  const open = useMemo(() => openCards(state), [state]);
  const handled = useMemo(() => handledCards(state), [state]);
  const logged = useMemo(() => loggedDecisions(state.decisions), [state.decisions]);
  const ctx = scenario?.ctx;

  return (
    <main className="shell">
      <div className="top">
        <span className="wordmark">
          <span className="wordmark__seal" aria-hidden="true">
            <Icon name="pen" size={14} />
          </span>
          Countersign
        </span>
        {state.phase === 'idle' ? (
          <span className="concept-tag">Concept prototype</span>
        ) : (
          <button type="button" className="btn btn--quiet" onClick={reset}>
            <Icon name="undo" size={14} /> Replay scenario
          </button>
        )}
      </div>

      {state.phase === 'idle' ? (
        <>
          <section className="intro">
            <p className="eyebrow">How an agent should ask</p>
            <h1>Not every action deserves the same interruption.</h1>
            <p>
              An agent can read, draft and reconcile on its own. When it is about to pay, file, or change where money
              goes, the sign-off should match the stakes. Run a month-end for a fictional company and watch four tiers
              of asking.
            </p>
          </section>

          <section className="ask" aria-label="The request">
            <p className="ask__who">{COMPANY.name} · you asked Claude</p>
            <p className="ask__quote">“{TASK}”</p>
            <button type="button" className="btn btn--primary" onClick={run}>
              Run month-end <Icon name="arrow" size={16} />
            </button>
          </section>

          <ul className="tiers-legend" aria-label="The four tiers">
            {LEGEND.map(([tier, text]) => (
              <li key={tier} data-tier={tier}>
                <span className="glyph">
                  <Icon name={TIER_ICON[tier]} size={14} />
                </span>
                <span>
                  <strong>
                    Tier {tier} · {TIER_LABEL[tier]}.
                  </strong>{' '}
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {state.phase === 'planning' ? (
        <>
          <section className="ask" aria-label="The request">
            <p className="ask__who">You asked Claude</p>
            <p className="ask__quote">“{TASK}”</p>
          </section>
          <PlanningSteps step={step} />
        </>
      ) : null}

      {state.phase === 'ready' && ctx ? (
        <>
          <Brief open={open.length} handled={handled.length} done={logged.length} at={ctx.now} />
          <Feed done={logged} />

          <div className="stack" aria-label="Needs you">
            {open.map((card, i) => {
              if (card.tier === 3) {
                return (
                  <StopCard
                    key={card.id}
                    card={card}
                    index={i}
                    ctx={ctx}
                    onVerify={() => dispatch({ type: 'verify', cardId: card.id, at: Date.now() })}
                    onReject={() => dispatch({ type: 'reject', cardId: card.id, at: Date.now() })}
                    onReroute={() => {
                      const newCard = rerouteToAccountOnFile(card, ctx);
                      if (newCard) dispatch({ type: 'reroute', cardId: card.id, at: Date.now(), newCard });
                    }}
                  />
                );
              }
              if (card.tier === 2) {
                return (
                  <CountersignCard
                    key={card.id}
                    card={card}
                    index={i}
                    ctx={ctx}
                    now={now}
                    onConfirm={() => dispatch({ type: 'approve', cardId: card.id, at: Date.now() })}
                  />
                );
              }
              return (
                <BatchCard
                  key={card.id}
                  card={card}
                  index={i}
                  onApprove={(ids) => dispatch({ type: 'approve', cardId: card.id, at: Date.now(), approvedIds: ids })}
                />
              );
            })}
          </div>

          {handled.length > 0 ? (
            <section className="handled" aria-label="Handled">
              <h2>Handled by you</h2>
              <ul className="stack" style={{ gap: 8 }}>
                {handled.map((card) => (
                  <HandledRow
                    key={card.id}
                    card={card}
                    resolution={state.resolutions[card.id]!}
                    ctx={ctx}
                    now={now}
                    onUndo={() => dispatch({ type: 'undo', cardId: card.id })}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      <RulesTable />
      <p className="foot">
        Unofficial concept prototype. Not affiliated with Anthropic. Every company, vendor, account and invoice here is
        fabricated.
      </p>
    </main>
  );
}
