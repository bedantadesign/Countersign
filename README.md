# Countersign

**Unofficial concept prototype. Not affiliated with Anthropic. Every company, vendor, account, GSTIN and invoice in it is fabricated.**

How should an agent ask before it does something you can't undo? Countersign argues that not every action deserves the same interruption, and that the sign-off should scale with **reversibility** and **blast radius**, not with which tool the agent happened to call.

The demo runs a month-end for a fictional Indian company (GST e-invoicing, vendor payments, customer reminders) and shows four kinds of asking, including a vendor invoice with a hidden line that tells the agent to redirect a payment.

## The four tiers

| Tier | Name | What it is | What you see |
|---|---|---|---|
| 0 | Just do it | Private and undoable: reads, drafts, reconciliations | A quiet line in the log. Never a card. |
| 1 | Batch review | Reaches other people, moves no money, files nothing | One card, a stacked preview, send all or send some |
| 2 | Countersign | Moves money or files with a regulator | The exact action, the amount, the undo window, and a press-and-hold to confirm |
| 3 | Stop and verify | Looks wrong, or the instruction came from a document | No Approve button. Where the instruction came from, and the safe paths |

## How a tier is chosen

The model proposes actions. It does **not** pick the tier. A fixed rules layer in [`src/lib/tiering.ts`](src/lib/tiering.ts) does, so the risk logic can be read, tested and argued with. The highest tier of any rule that fires wins.

| Rule | Tier | Fires when |
|---|---|---|
| R1 Private and undoable | 0 | Stays in your workspace and can be undone |
| R2 External, low stakes | 1 | Reaches people outside the company, moves no money, files nothing |
| R3 Money or a filing | 2 | Moves money or files with a regulator. Never drops below your sign-off, even with an undo window |
| R4 Permanent | 2 | Cannot be undone, even when private. Deleting is signed off like paying |
| R5 Instruction came from a document | 3 | The request originates in text inside a file, not from you |
| R6 Payee destination changes | 3 | Changes where a vendor is paid, or pays an account that is not the one on file |
| R7 Bank details changed since last payment | 3 | The vendor master changed after you last paid them |
| R8 Amount is out of pattern | 3 | More than 3× what the vendor usually gets |

### Provenance is re-checked, not trusted

The planner says where each action came from, but that is only a claim. It reports two things separately:

- **Instruction:** the words that asked for the action. If they are the person's own words, the person asked. If they are not, but they appear in a document, the document asked. Quotes shorter than 16 letters and digits are too generic to attribute and are ignored.
- **Evidence:** data the action uses, such as an invoice number or total. Evidence never changes who asked, so a normal payment can cite its own invoice. The exception is evidence taken from hidden text, which no person could have seen, so the action is treated as document-originated.

Separately, a destination account that appears in a document but is **not** the account on file in the vendor master marks the action as document-originated. A legitimate invoice prints the vendor's real bank details, so an account that matches the master is never treated as tainted. All of these cases are covered by tests, including one where the planner lies and says the instruction came from the user.

R6 is a second, independent catch. Even if provenance were somehow missed, paying an account that isn't on file is held on its own.

### Tier 3 says why, and offers only paths that resolve it

When a document gave the instruction, the card shows the person's own request beside the document text, with the hidden line highlighted. When the hold is about the payment itself (a recent bank change, an unusual amount), it says so without blaming a document. "Pay the account on file instead" appears only when doing that would actually lower the tier.

## Live planning

With an API key on the server, Claude plans the month-end from the same books and documents each run. Without one, the demo uses the recorded plan and says so.

- **One call, no tools.** `src/lib/planner/live.ts` makes a single structured-output request to `claude-haiku-5-5` at medium effort. Haiku has no server-side refusal fallback, so a refusal fails closed like any other planning failure. If `COUNTERSIGN_MODEL` names Opus, Sonnet or Fable, the request adds `fallbacks: "default"`. The planner can only propose. It cannot execute anything.
- **The planner reports who asked.** Each proposed action carries an instruction quote and separate evidence quotes, which the engine re-checks as described above. The planner is told to surface instructions it finds in documents as proposals, not to follow or drop them quietly.
- **The gate doesn't depend on the planner being honest.** Tests run three planners through the same rules: one that surfaces the injection, one that is fooled and claims the person asked, and one that ignores the hidden line. The first two land on Tier 3; the third pays the account on file.
- **Record fields come from the books.** Customer names, GSTINs, invoice totals and reminder emails are looked up, not taken from the model. A proposal that names a record the books don't have is dropped and listed in the log.
- **Failure does nothing.** A refusal, a cut-off plan, an unreadable plan or an API error shows "Claude couldn't plan this. Nothing was done." with Try again and Use the recorded plan.

| Variable | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Turns live planning on (so does `ANTHROPIC_AUTH_TOKEN`) |
| `COUNTERSIGN_LIVE` | `off` forces the recorded plan; `on` forces live, for credentials the SDK finds without those variables |
| `COUNTERSIGN_MODEL` | Overrides the planner model |

**Cost:** the endpoint takes no input, so it can't be used as a general proxy to Claude. But anyone who can open the page can trigger a planning call billed to your key. Put a spend limit on the key, or leave live planning off for a public link.

## Inside a chat (MCP App)

The same review also runs inline in a chat, as an [MCP App](https://github.com/modelcontextprotocol/ext-apps). The site serves an MCP server at `/mcp` (Streamable HTTP, stateless). Add `https://<your deployment>/mcp` to Claude as a custom connector and ask it to run the Countersign month-end.

- **One tool for the model.** `run_month_end` takes no input and plans the fixed scenario, live when the server has a key and recorded otherwise. The plan goes to the view in `structuredContent`. The model only gets a short text summary, and the injected account stays out of it.
- **The rules still pick the tier.** The view runs the same engine on the proposed actions as the website does. The chat model can't approve anything: sign-off happens in the view.
- **Reopening a conversation doesn't plan again.** The view shows the plan from the original tool call. Try again and Replay ask for a fresh plan through `plan_month_end`, which only the view can call.
- **The model hears what the person did.** After each decision the view sends the chat a plain-text account of what is waiting and what was handled, so a follow-up question gets a true answer.
- **It looks like part of the chat.** It is 500px tall inline and scrolls inside, with a full-screen toggle where the host offers one. On a light host it takes the host's fonts, radii and neutral colours. On a dark host it keeps its own light palette, because the tier colours are tuned for it. Focus stays in the chat until the person acts inside the view.

The view is one self-contained HTML file built by `npm run build:view` (part of `npm run build`) from `src/mcp/view/`. The e2e tests load it through a small test host that uses the SDK's own `AppBridge` and a real MCP client against `/mcp`.

The same cost note applies: anyone with the `/mcp` URL can trigger a planning call on your key.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # unit tests: tiering, provenance, bundling, reducer, formatting, Tier 3 card rendering
npm run test:e2e # browser tests: builds, serves on :3100, drives the real flow in Chromium, and the MCP App in a test chat host
npm run typecheck
```

## What's built, and what isn't

Built:

- The deterministic tiering engine with the rules above, plus tests
- The scenario fixtures, including the poisoned invoice: 3 vendors with one invoice each, 6 sales invoices awaiting an IRN, and 7 overdue receivables
- Tier 1, 2 and 3 cards, the quiet Tier 0 log and the morning-brief header
- Press-and-hold confirm (pointer, touch, or hold Space), a reversibility meter that drains in real time, undo while a window is open
- The safe path out of Tier 3: pay the account on file as a normal Tier 2 sign-off
- Motion that carries meaning (Tier 2 settles, Tier 3 shakes once) with a `prefers-reduced-motion` path, and focus that moves to the next card after you act
- Live planning with Claude, with the recorded plan as the fallback, run against the real API on the deployed site
- A mobile pass at 390px
- The MCP App: the same review inline in a chat

Not built yet:

- **A dark palette** for the MCP App on dark hosts.
- **The video and case study.**

## Things to check before you rely on this

- `IRN_CANCEL_WINDOW_HOURS` (24) in `src/lib/tiering.ts` is the e-invoice cancellation window on the IRP. Verify it against the current government notification before publishing any claim about it.
- The bank-batch cutoff is the next :00 or :30 at least 45 minutes away, shown in your own timezone, so the countdown is always visibly running. It is not a real bank schedule.
- Money is held as integer paise everywhere and formatted only at the edge.

## Layout

```
src/lib/        types, fixtures, tiering engine, card bundling, reducer, formatting
src/lib/planner/ live planning: schema, prompt, request, mapping to actions, errors
src/app/api/plan/ GET reports whether live planning is on; POST plans
src/app/mcp/    the MCP endpoint
src/mcp/        MCP server (tools and view resource) and the view: one HTML file built with Vite
src/lib/__tests__/
src/components/ cards, hold button, reversibility meter, brief, feed
src/app/        layout, page, styles
e2e/            Playwright browser tests; e2e/mcp-host/ is the test chat host
```
