# Countersign

Unofficial concept prototype of how an agent should ask before it does something you can't undo. A fictional Indian company's month-end (GST e-invoices, vendor payments, customer reminders) runs through four tiers of asking. The climax is a hidden line in a vendor invoice that tries to redirect a payment. It is a portfolio piece for Anthropic design roles. Every company, vendor, account and invoice is fabricated: never add real client or employer data. Keep the "Not affiliated with Anthropic" footer.

## Commands

```bash
npm run dev        # http://localhost:3000
npm test           # vitest: engine, provenance, cards, reducer, planner, route, Tier 3 rendering
npm run test:e2e   # playwright: builds, serves on :3100, drives the real flow
npm run typecheck
npm run build
```

## Where things are

- `src/lib/tiering.ts`: the rules (R1–R8) and `effectiveProvenance`. The heart of the argument.
- `src/lib/fixtures.ts`: the scenario, the recorded plan, and builders the live planner reuses.
- `src/lib/cards.ts`, `src/lib/reducer.ts`: bundling decisions into cards, and UI state.
- `src/lib/planner/`: live planning. `live.ts` (server-only request), `schema.ts`, `prompt.ts`, `map.ts` (planner output to actions), `errors.ts`, `client.ts` (browser fetch).
- `src/app/api/plan/route.ts`: GET says whether live planning is on; POST plans. Takes no input.
- `src/components/`: `Countersign.tsx` wires the flow; `StopCard`, `CountersignCard`, `BatchCard` are Tiers 3, 2, 1.
- `src/test/plans.ts`: surfacing, fooled and resisting planner outputs, shared by unit and e2e tests.

## Invariants

- The model proposes; the fixed rules pick the tier. Never let model output set or lower a tier.
- Provenance separates the instruction (who asked) from evidence (data used). Evidence never changes who asked, except evidence taken from hidden text. Instruction quotes under 16 letters and digits are ignored.
- Record fields (names, GSTINs, invoice totals, emails) come from the books, never from the planner.
- Tier 3 has no Approve button. "Pay the account on file instead" appears only when it lowers the tier and the plan doesn't already pay that invoice to that account.
- Money is integer paise everywhere; strings are made only in `src/lib/format.ts`.
- A planning failure does nothing and says so.
- Every bug fix gets a test, and that test is checked to fail with the fix reverted.

## Environment gotchas

- `@playwright/test` is pinned to 1.63.0 to match the browsers preinstalled at `/opt/pw-browsers`. Never run `playwright install`.
- e2e `beforeEach` mocks `/api/plan` so tests never reach Claude. A test's own `page.route` overrides it.
- Playwright's raw `page.mouse` doesn't scroll: call `scrollIntoViewIfNeeded()` first.
- Next's route announcer also has `role="alert"`; scope alert locators.
- `pkill -f "next start"` matches and kills your own shell command. Kill the server by PID.
- Vitest aliases `server-only` to `src/test/server-only.ts`.
- The cloud environment has no Claude API key, so live planning has only been tested with a mocked client.

## Status

Built: the engine, all four tiers, hold-to-confirm, live undo meters, the Tier 3 safe path, live planning with the recorded plan as fallback, and unit and browser tests. Work happens on branch `claude/clever-meitner-3ffzoi`; don't open a pull request unless asked.

## Next, in order

1. Mobile polish pass at 390px width: screenshot each card, fix only what's broken.
2. Stale bank cutoff: if the tab stays open past the cutoff, the payment card still names a batch time that has passed, and approving records an undo deadline in the past. Roll to the next batch.
3. Run live planning once with a real key (`ANTHROPIC_API_KEY=... npm run dev`) and tune the prompt in `src/lib/planner/prompt.ts`. The planner runs on `claude-haiku-5-5`, which has no server-side refusal fallback; check the injected invoice does not trip a refusal.
4. Deploy (the owner does this on Vercel). Use `COUNTERSIGN_LIVE=off`, or a key with a spend limit: anyone who opens the page can trigger a billed call.
5. MCP App wrapper, timeboxed to 3 hours: the official `ext-apps` SDK, 500px inline height, host CSS variables.
6. The owner records the video and writes the case study.

Small: `HoldButton` builds its hint id with `Math.random`; `useId` is cleaner.

Before publishing any claim about the 24-hour IRN cancellation window (`IRN_CANCEL_WINDOW_HOURS`), check it against the current government notification.
