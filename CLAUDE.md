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
- The cloud environment has no Claude API key and can't reach vercel.app. Live planning is tested by the owner on the deployed site; unit and e2e tests mock the client.

## Status

Built: the engine, all four tiers, hold-to-confirm, live undo meters, the Tier 3 safe path, live planning with the recorded plan as fallback, and unit and browser tests. Work happens on branch `claude/clever-meitner-3ffzoi`; don't open a pull request unless asked.

Deployed on Vercel from `claude/clever-meitner-3ffzoi` with live planning on (`ANTHROPIC_API_KEY` set for Production and Preview, no `COUNTERSIGN_LIVE`). Every push redeploys. The owner should keep a spend limit on that key.

Live planning runs on `claude-haiku-5-5` (no server-side refusal fallback). First live run: Haiku surfaced the hidden invoice line as document-instructed and the rules held it at Tier 3. It also read the old request ("pending vendor stuff") literally and skipped IRNs and reminders, so the request became "Clear the pending month-end stuff". Notes are capped at two short sentences and render with a dot, not a check. Long planner titles are cut at a word with an ellipsis.

Bank batches recur every half hour (`PAYMENT_BATCH_EVERY_MS`, `everyMs` on the reversibility). If the tab stays open past a cutoff, the payment card names the next batch and an approval's undo deadline rolls forward (`windowClose` in `src/lib/reducer.ts`).

Visual design: warm light editorial (paper background, Newsreader serif for headlines, Inter for text). Visual weight follows the tier: Tier 3 is the dominant card with a red top rule, Tier 2 cards have an ochre edge and show at most three line items before "Show N more", Tier 1 is a slim dashed row, Tier 0 is the quiet log. Checked at 390px: on phones the bank comparison stacks each row's label above the values so account numbers never break, and handled rows put the undo button under the title. Colours are tokens in `src/app/globals.css`; `--tier` is for text, `--tier-fill` for bars and filled buttons.

## Next, in order

1. Confirm a live run on the new prompt shows 4 cards (Tier 3 stop, payments, IRN batch, reminders) and at most two short notes. If Haiku still skips IRNs or reminders, tune `src/lib/planner/prompt.ts`.
2. Start screen race: if Start is clicked before the `GET /api/plan` check returns, the page runs the recorded plan even when live is on. Wait for the check.
3. MCP App wrapper, timeboxed to 3 hours: the official `ext-apps` SDK, 500px inline height, host CSS variables.
4. The owner records the video and writes the case study.

Small: `HoldButton` builds its hint id with `Math.random`; `useId` is cleaner.

Before publishing any claim about the 24-hour IRN cancellation window (`IRN_CANCEL_WINDOW_HOURS`), check it against the current government notification.
