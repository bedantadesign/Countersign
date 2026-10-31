'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { buildScenario, COMPANY, PLANNING_STEPS, TASK, type Scenario } from '@/lib/fixtures';
import { decide } from '@/lib/tiering';
import { loggedDecisions, rerouteToAccountOnFile } from '@/lib/cards';
import { handledCards, initialState, openCards, reducer } from '@/lib/reducer';
import { fetchLiveAvailable, fetchLivePlan } from '@/lib/planner/client';
import type { Dropped } from '@/lib/planner/map';
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

/** Narrates fixed inputs truthfully; the last step waits for Claude's answer. */
const LIVE_STEPS = [
  'Reading 3 vendor invoices',
  'Reading the vendor master and open receivables',
  'Sending it all to Claude',
  'Waiting for Claude’s plan',
];

type Mode = 'live' | 'recorded';

interface PlanMeta {
  source: Mode;
  notes: string[];
  dropped: Dropped[];
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function focusTarget(id: string) {
  document.querySelector<HTMLElement>(`[data-focus-target="${id}"]`)?.focus({ preventScroll: false });
}

export function Countersign() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [step, setStep] = useState(0);
  const [liveAvailable, setLiveAvailable] = useState(false);
  const [mode, setMode] = useState<Mode>('recorded');
  const [meta, setMeta] = useState<PlanMeta>({ source: 'recorded', notes: [], dropped: [] });
  const timers = useRef<number[]>([]);
  const inflight = useRef<AbortController | null>(null);
  const tick = useNow(state.phase === 'ready');

  useEffect(() => {
    let cancelled = false;
    fetchLiveAvailable().then((live) => {
      if (cancelled) return;
      setLiveAvailable(live);
      if (live) setMode('live');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    inflight.current?.abort();
    inflight.current = null;
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const run = useCallback(
    (how: Mode) => {
      clearTimers();
      const sc = buildScenario(Date.now());
      setScenario(sc);
      setStep(0);
      dispatch({ type: 'planning' });
      const gap = prefersReducedMotion() ? 0 : 420;
      const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

      if (how === 'recorded') {
        PLANNING_STEPS.forEach((_, i) => later(() => setStep(i + 1), gap * (i + 1)));
        later(() => {
          setMeta({ source: 'recorded', notes: [], dropped: [] });
          dispatch({ type: 'ready', decisions: sc.plan.map((a) => decide(a, sc.ctx)) });
        }, gap * (PLANNING_STEPS.length + 1));
        return;
      }

      LIVE_STEPS.slice(0, -1).forEach((_, i) => later(() => setStep(i + 1), gap * (i + 1)));
      const earliest = Date.now() + gap * LIVE_STEPS.length;
      const controller = new AbortController();
      inflight.current = controller;
      fetchLivePlan(controller.signal)
        .then((plan) => {
          later(() => {
            setStep(LIVE_STEPS.length);
            setMeta({ source: 'live', notes: plan.notes, dropped: plan.dropped });
            // The model proposed; the same fixed rules decide, here as for the recorded plan.
            dispatch({ type: 'ready', decisions: plan.actions.map((a) => decide(a, sc.ctx)) });
          }, Math.max(0, earliest - Date.now()));
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          timers.current.forEach((t) => window.clearTimeout(t));
          timers.current = [];
          dispatch({ type: 'failed', message: error instanceof Error ? error.message : 'Planning failed.' });
        });
    },
    [clearTimers],
  );

  const reset = useCallback(() => {
    clearTimers();
    setScenario(null);
    dispatch({ type: 'reset' });
    window.scrollTo({ top: 0 });
  }, [clearTimers]);

  // Focus: the brief when the plan lands, the next open card when one is handled,
  // and the restored card on undo (its undo button is gone, so focus would fall to the page).
  const handledCount = Object.keys(state.resolutions).length;
  const prevHandled = useRef(0);
  const restoreFocus = useRef<string | null>(null);
  useEffect(() => {
    if (state.phase === 'ready' && handledCount === 0 && prevHandled.current === 0) focusTarget('brief');
    if (state.phase === 'failed') focusTarget('failed');
  }, [state.phase, handledCount]);
  useEffect(() => {
    if (handledCount > prevHandled.current) {
      const next = openCards(state)[0];
      focusTarget(next ? next.id : 'brief');
    } else if (handledCount < prevHandled.current && restoreFocus.current) {
      focusTarget(restoreFocus.current);
    }
    restoreFocus.current = null;
    prevHandled.current = handledCount;
  }, [handledCount, state]);

  const open = useMemo(() => openCards(state), [state]);
  const handled = useMemo(() => handledCards(state), [state]);
  const logged = useMemo(() => loggedDecisions(state.decisions), [state.decisions]);
  const ctx = scenario?.ctx;
  // The clock starts on the first tick after the plan lands. Until then, and after a replay
  // leaves a stale tick behind, the scenario's own start time is the honest floor.
  const now = Math.max(tick, ctx?.now ?? 0);

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
            {liveAvailable ? (
              <fieldset className="mode">
                <legend className="sr-only">How to plan</legend>
                <label className="mode__option">
                  <input type="radio" name="mode" checked={mode === 'live'} onChange={() => setMode('live')} />
                  <span>
                    <span className="mode__name">Live with Claude</span>
                    <span className="mode__hint">Claude plans from the same books each run. Takes a few seconds.</span>
                  </span>
                </label>
                <label className="mode__option">
                  <input type="radio" name="mode" checked={mode === 'recorded'} onChange={() => setMode('recorded')} />
                  <span>
                    <span className="mode__name">Recorded plan</span>
                    <span className="mode__hint">The same plan every time.</span>
                  </span>
                </label>
              </fieldset>
            ) : null}
            <button type="button" className="btn btn--primary" onClick={() => run(liveAvailable ? mode : 'recorded')}>
              Run month-end <Icon name="arrow" size={16} />
            </button>
            {!liveAvailable ? <p className="ask__who">Recorded plan. Live planning is off on this server.</p> : null}
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
          <PlanningSteps steps={mode === 'live' && liveAvailable ? LIVE_STEPS : PLANNING_STEPS} step={step} />
        </>
      ) : null}

      {state.phase === 'failed' ? (
        <>
          <section className="ask" aria-label="The request">
            <p className="ask__who">You asked Claude</p>
            <p className="ask__quote">“{TASK}”</p>
          </section>
          <section className="failed" role="alert">
            <h2 className="failed__title" tabIndex={-1} data-focus-target="failed">
              Claude couldn’t plan this. Nothing was done.
            </h2>
            <p className="why">{state.error}</p>
            <div className="actions actions--row">
              <button type="button" className="btn btn--primary" onClick={() => run('live')}>
                Try again
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setMode('recorded');
                  run('recorded');
                }}
              >
                Use the recorded plan
              </button>
            </div>
          </section>
        </>
      ) : null}

      {state.phase === 'ready' && ctx ? (
        <>
          <Brief
            open={open.length}
            handled={handled.length}
            done={logged.length}
            at={ctx.now}
            source={meta.source === 'live' ? 'Planned live by Claude' : 'Recorded plan'}
          />
          <Feed done={logged} notes={meta.notes} dropped={meta.dropped} />

          <div className="stack" aria-label="Needs you">
            {open.map((card, i) => {
              if (card.tier === 3) {
                return (
                  <StopCard
                    key={card.id}
                    card={card}
                    index={i}
                    ctx={ctx}
                    decisions={state.decisions}
                    onVerify={() => dispatch({ type: 'verify', cardId: card.id, at: Date.now() })}
                    onReject={() => dispatch({ type: 'reject', cardId: card.id, at: Date.now() })}
                    onReroute={() => {
                      const newCard = rerouteToAccountOnFile(card, ctx, state.decisions);
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
                    onUndo={() => {
                      restoreFocus.current = card.id;
                      dispatch({ type: 'undo', cardId: card.id });
                    }}
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
