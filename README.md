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

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # unit tests: tiering, provenance, bundling, reducer, formatting, Tier 3 card rendering
npm run test:e2e # browser tests: builds, serves on :3100, drives the real flow in Chromium
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

Not built yet:

- **Live planning.** The plan is recorded. A Claude API call that turns a messy request into structured actions, with the recorded plan as fallback, is next.
- **MCP App.** Rendering the card inline in Claude is a stretch goal.
- **Mobile polish pass**, a deployed demo link, and the video and case study.

## Things to check before you rely on this

- `IRN_CANCEL_WINDOW_HOURS` (24) in `src/lib/tiering.ts` is the e-invoice cancellation window on the IRP. Verify it against the current government notification before publishing any claim about it.
- The bank-batch cutoff is the next :00 or :30 at least 45 minutes away, shown in your own timezone, so the countdown is always visibly running. It is not a real bank schedule.
- Money is held as integer paise everywhere and formatted only at the edge.

## Layout

```
src/lib/        types, fixtures, tiering engine, card bundling, reducer, formatting
src/lib/__tests__/
src/components/ cards, hold button, reversibility meter, brief, feed
src/app/        layout, page, styles
e2e/            Playwright browser tests
```
