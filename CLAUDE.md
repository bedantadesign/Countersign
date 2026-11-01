# Countersign

Unofficial concept prototype of how an agent should ask before it does something you can't undo. A fictional Indian company's month-end (GST e-invoices, vendor payments, customer reminders) runs through four tiers of asking. The climax is a hidden line in a vendor invoice that tries to redirect a payment. It is a portfolio piece for Anthropic design roles. Every company, vendor, account and invoice is fabricated: never add real client or employer data. Keep the "Not affiliated with Anthropic" footer.

## Commands

```bash
npm run dev        # http://localhost:3000
npm test           # vitest: engine, provenance, cards, reducer, planner, route, Tier 3 rendering
npm run test:e2e   # playwright: builds, serves on :3100, drives the real flow and the MCP App in a test host
npm run typecheck
npm run build      # build:view (the MCP App's single HTML file, into mcp-dist/) then next build
```

## Where things are

- `src/lib/tiering.ts`: the rules (R1–R8) and `effectiveProvenance`. The heart of the argument.
- `src/lib/fixtures.ts`: the scenario, the recorded plan, and builders the live planner reuses.
- `src/lib/cards.ts`, `src/lib/reducer.ts`: bundling decisions into cards, and UI state.
- `src/lib/planner/`: live planning. `live.ts` (server-only request), `schema.ts`, `prompt.ts`, `map.ts` (planner output to actions), `errors.ts`, `client.ts` (browser fetch).
- `src/lib/planner/run.ts`: `planMonthEnd()`, the one live-planning path shared by `/api/plan` and MCP.
- `src/app/api/plan/route.ts`: GET says whether live planning is on; POST plans. Takes no input.
- `src/app/mcp/route.ts` and `src/mcp/server.ts`: the MCP server. `run_month_end` (model-visible, plans, links the view) and `plan_month_end` (app-only, for Try again and Replay).
- `src/mcp/view/`: the MCP App view. `main.tsx` connects with the ext-apps `App`, applies host context, and renders `Countersign` with `embedded`; `planner.ts` reads the first plan from the tool result; `embed.css` maps host CSS variables.
- `src/lib/report.ts`: the plain-text account the view sends the chat model with `updateModelContext`.
- `src/components/`: `Countersign.tsx` wires the flow; `StopCard`, `CountersignCard`, `BatchCard` are Tiers 3, 2, 1.
- `src/test/plans.ts`: surfacing, fooled and resisting planner outputs, shared by unit and e2e tests.
- `e2e/mcp-host/`: a test chat host (real MCP client plus the SDK's `AppBridge`), bundled by Playwright's global setup.

## Invariants

- The model proposes; the fixed rules pick the tier. Never let model output set or lower a tier.
- Provenance separates the instruction (who asked) from evidence (data used). Evidence never changes who asked, except evidence taken from hidden text. Instruction quotes under 16 letters and digits are ignored.
- Record fields (names, GSTINs, invoice totals, emails) come from the books, never from the planner.
- Tier 3 has no Approve button. "Pay the account on file instead" appears only when it lowers the tier and the plan doesn't already pay that invoice to that account.
- Money is integer paise everywhere; strings are made only in `src/lib/format.ts`.
- A planning failure does nothing and says so.
- In MCP, the plan goes to the view in `structuredContent`; the model's `content` is a short summary that never repeats document text. The chat model can't approve anything.
- Every bug fix gets a test, and that test is checked to fail with the fix reverted.

## Environment gotchas

- `@playwright/test` is pinned to 1.63.0 to match the browsers preinstalled at `/opt/pw-browsers`. Never run `playwright install`.
- e2e `beforeEach` mocks `/api/plan` so tests never reach Claude. A test's own `page.route` overrides it.
- Playwright's raw `page.mouse` doesn't scroll: call `scrollIntoViewIfNeeded()` first.
- Next's route announcer also has `role="alert"`; scope alert locators.
- `pkill -f "next start"` matches and kills your own shell command. Kill the server by PID.
- Vitest aliases `server-only` to `src/test/server-only.ts`.
- The cloud environment has no Claude API key and can't reach vercel.app. Live planning is tested by the owner on the deployed site; unit and e2e tests mock the client.
- `next dev` writes an `AGENTS.md`. Don't commit it.
- MCP SDK is v2 (`@modelcontextprotocol/server`, `/client`), not the old `@modelcontextprotocol/sdk`. The route uses `createMcpHandler`, which also serves 2025-protocol clients statelessly.
- The MCP e2e tests serve the test host at `/__chat-host` with `page.route`, so its MCP client reaches `/mcp` on the same origin.

## Status

Built: the engine, all four tiers, hold-to-confirm, live undo meters, the Tier 3 safe path, live planning with the recorded plan as fallback, and unit and browser tests. Work happens on branch `claude/clever-meitner-3ffzoi`; don't open a pull request unless asked.

Deployed on Vercel from `claude/clever-meitner-3ffzoi` with live planning on (`ANTHROPIC_API_KEY` set for Production and Preview, no `COUNTERSIGN_LIVE`). Every push redeploys. The owner should keep a spend limit on that key.

Live planning runs on `claude-haiku-5-5` (no server-side refusal fallback). First live run: Haiku surfaced the hidden invoice line as document-instructed and the rules held it at Tier 3. It also read the old request ("pending vendor stuff") literally and skipped IRNs and reminders, so the request became "Clear the pending month-end stuff". Notes are capped at two short sentences and render with a dot, not a check. Long planner titles are cut at a word with an ellipsis.

Second live run (new request): IRNs and reminders came back, but Haiku skipped the Sundaram and Kaveri payments because they fall due on 2 and 4 Nov (the planner gets no date), and wrote the reconciliation as "Resolve first/second mismatch". The prompt now says month-end pays invoices due in the coming week, and reconciliation is reported in the past tense, one match line and one mismatch line.

Bank batches recur every half hour (`PAYMENT_BATCH_EVERY_MS`, `everyMs` on the reversibility). If the tab stays open past a cutoff, the payment card names the next batch and an approval's undo deadline rolls forward (`windowClose` in `src/lib/reducer.ts`).

The Run button stays disabled until `GET /api/plan` answers (5s timeout, then recorded), so an early click can't skip live planning.

Visual design: warm light editorial (paper background, Newsreader serif for headlines, Inter for text). Visual weight follows the tier: Tier 3 is the dominant card with a red top rule, Tier 2 cards have an ochre edge and show at most three line items before "Show N more", Tier 1 is a slim dashed row, Tier 0 is the quiet log. Checked at 390px: on phones the bank comparison stacks each row's label above the values so account numbers never break, and handled rows put the undo button under the title. Colours are tokens in `src/app/globals.css`; `--tier` is for text, `--tier-fill` for bars and filled buttons.

Third live run (1 Nov): 4 cards, past-tense reconciliation, two notes, Sundaram and Kaveri paid. Known rough edges from it, not yet fixed: the IRN meter's "until 8:34 pm" has no day for a window that ends tomorrow; both notes were noise (one repeats the Tier 3 card, one flags 1.1–1.2× amounts the rules treat as normal); the brief says "9 other steps" over 3 feed lines; live feed titles end in a full stop, the drafts line doesn't.

MCP App built with `@modelcontextprotocol/ext-apps` 2.x: `/mcp` on the deployed site, 500px inline with internal scroll and a full-screen toggle, host fonts/radii/neutrals on light hosts, own palette on dark hosts. Tested only in the e2e test host so far, not in a real Claude chat.

## Next, in order

1. The owner adds `https://<deployment>/mcp` to Claude as a custom connector and checks the view renders inline, plans live, and the model's follow-up answers match what was handled.
2. Fix the rough edges from the third live run, starting with the IRN end time (it's on screen in the video).
3. The owner records the video and writes the case study.

Before publishing any claim about the 24-hour IRN cancellation window (`IRN_CANCEL_WINDOW_HOURS`), check it against the current government notification.
