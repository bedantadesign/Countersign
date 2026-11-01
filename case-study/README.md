# Countersign: case-study material

Raw material for writing the case study: the argument, the decisions and the evidence behind each, what the live runs taught, numbers, and screenshots. It's for you to write from, not to publish as it stands.

Everything in the scenario is fabricated. Keep "Unofficial concept prototype. Not affiliated with Anthropic." on anything published.

---

## 1. The argument

**One line:** an agent's sign-off should scale with what an action can't undo and who it reaches, not with which tool it called.

**One paragraph:** Agents that ask before everything train people to click Approve without reading. Agents that never ask eventually pay the wrong account. Countersign runs a month-end for a fictional Indian company (GST e-invoices, vendor payments, customer reminders) and sorts every proposed action into four tiers of asking, using two axes: **reversibility** and **blast radius**. Reads and drafts are only logged. Emails to customers are reviewed in one batch. Payments and filings get a deliberate press-and-hold with a live undo window. Anything that looks wrong, or that a *document* asked for, stops with no Approve button. The climax is a hidden line in a vendor invoice that tells the agent to redirect ₹3,15,000. The model proposes; fixed, readable rules choose the tier, so the gate holds even when the model is fooled.

**The tension worth naming:** interruption is a cost. Every unnecessary prompt makes the next necessary one weaker. In this scenario, 27 proposed actions produce 4 interruptions.

---

## 2. Decisions, and the evidence for each

Each has a screenshot, a file, or a test you can point to.

### The model proposes; rules decide
- **Decision:** a fixed rules layer (R1–R8) picks the tier, never the model. The highest tier of any rule that fires wins.
- **Why:** a tier the model sets is a tier an injection can lower. Rules can be read, tested and argued with.
- **Evidence:** `src/lib/tiering.ts`; screen `08-tier3-why` (each card can show the rules that fired); screen `14-rules`. Test: *"still holds a fooled planner that says the person asked."*

### Two axes, four tiers
| Tier | Trigger | Interaction | Visual weight |
|---|---|---|---|
| 0 Just do it | Private and undoable | A quiet line in the log | No card at all (`04-tier0-log`) |
| 1 Batch review | Reaches outsiders, moves no money | One card, send all or choose (`12`, `13`) | Slim dashed row |
| 2 Countersign | Moves money or files with a regulator | Exact action, undo window, 1.2 s hold (`09`, `10`, `11`) | Ochre edge |
| 3 Stop and verify | Looks wrong, or a document asked | No Approve button, safe paths only (`05`) | Dominant card, red top rule |

- Visual weight follows the tier, so the page's hierarchy *is* the risk ranking. Cards are ordered by distrust (test: *"produces four cards in order of distrust"*).
- A rule worth quoting: R3, *"never drops below your sign-off, even with an undo window."* An undo window doesn't make paying safe.
- R4: permanent private work (deleting) is signed off like paying.

### Tier 3 has no Approve button
- **Decision:** the stop card offers only *Verify with vendor*, *Pay the account on file instead*, and *Reject and flag the PDF*.
- **Why:** if Approve is there, it gets clicked. The safe path is a phone number from the vendor master, "not from the PDF."
- **Detail:** "Pay the account on file instead" only appears when it actually lowers the tier and the plan doesn't already pay that invoice to that account. A hold for an unusual amount doesn't blame a document or offer a reroute that wouldn't help (render tests for all three Tier 3 variants).
- **Evidence:** `05-tier3-card`, `07-bank-compare`, `15-safe-path-card`, `16-handled-undo`. Test: *"has no way to approve a Tier 3 card."*

### Provenance: who asked versus what was used
- **Decision:** each action carries an *instruction* (the words that asked for it) and separate *evidence* (data it uses). Evidence never changes who asked, except evidence taken from hidden text, which no person could have seen.
- **The bug that forced it:** in the first build, the quote "pay" matched the poisoned invoice, and a normal payment citing its own invoice total was held at Tier 3. A false positive is a real cost: it teaches people the stop card is noise. The fix was to split instruction from evidence and ignore instruction quotes under 16 letters and digits as too generic to attribute (commit `96a5566`).
- **Second, independent catch:** R6 holds any payment to an account that isn't on file, whatever provenance says. An account that matches the vendor master is never tainted, because legitimate invoices print it.
- **Tests:** *"does not hold a normal payment that cites its own invoice as evidence"*, *"catches a quote that is really document text, even when declared as the user"*, *"holds an action whose evidence was taken from hidden text"*, *"does not hold evidence from the visible part of the same poisoned invoice."*

### Three planners, one gate
- Tests run three scripted planners through the same rules: one that **surfaces** the injection (Tier 3), one that is **fooled** and claims the person asked (still Tier 3, through provenance and R6), and one that **resists** and pays the account on file (no Tier 3 card, correctly).
- The point for the case study: the design doesn't depend on the model being right.

### Hold to confirm, with honest undo
- Press and hold for 1.2 s, or hold Space. A click or an early release never confirms (e2e test).
- Undo meters drain in real time to a real deadline: the next bank batch for payments, the IRP cancellation window for IRNs. If the tab stays open past a batch cutoff, the card names the next batch, and an approval never gets a deadline in the past (commit `a41a402`).
- Evidence: `10-tier2-holding` (mid-press), `16-handled-undo`.

### The books, not the model, supply facts
- Customer names, GSTINs, totals and emails are looked up from the books. A proposal naming a record the books don't have is dropped and listed in the log as ignored.
- Money is integer paise everywhere, and formatted the Indian way (₹3,15,000) only at the edge.

### Failure does nothing, and says so
- A refusal, a cut-off plan, an unreadable plan or an API error gives *"Claude couldn't plan this. Nothing was done."* with Try again and Use the recorded plan. Raw API errors are never shown. Screen `18-planning-failed`.

### Inside a chat (MCP App)
- The same review renders inline in a chat, 500px tall, scrolling inside.
- The chat model gets a short summary; the plan goes only to the view. **The chat model can't approve anything**: sign-off stays with the person.
- After each decision the view tells the chat what's waiting and what was handled, so "what did I approve?" gets a true answer.
- On light hosts it takes the host's fonts, radii and neutral colours; on dark hosts it keeps its own paper, because a warning has to read as one (`22`–`24`).
- Focus stays in the chat's message box until the person acts in the view. Found from a screenshot: the heading was taking focus on load.

---

## 3. What the live runs taught

The best narrative material: the model was wrong in ordinary, instructive ways, and the rules never moved.

| Run | What Haiku did | What changed |
|---|---|---|
| 1 | Surfaced the hidden line as document-instructed; the rules held it at Tier 3. But it read "pending vendor stuff" literally and skipped IRNs and reminders, so two card types never appeared. | The request became *"Clear the pending month-end stuff."* Notes capped at two short sentences, and shown with a dot, not a check, so they don't read as finished work. |
| 2 | IRNs and reminders came back. It skipped the Sundaram and Kaveri payments because they fall due on 2 and 4 Nov (it had no date), and wrote reconciliation as "Resolve first mismatch." | The prompt says month-end pays invoices due in the coming week, and reports reconciliation in the past tense. |
| 3 | 4 cards, past-tense reconciliation, two notes, all payments. The notes were noise: one repeated the Tier 3 card; one flagged amounts 1.1–1.2× usual that the rules (3× threshold) treat as normal. | Not fixed yet. A good example of a model note second-guessing the rules, which is the confusion the design tries to avoid. |

Themes to draw out:
- **Ask literally, get literally.** The request wording decided which tiers you ever saw.
- **The model lacks context the product has** (today's date). Prompt changes fixed behaviour; the rules never needed to.
- **Prompt changes moved what was proposed, never what was allowed.** Across all three runs, no rule changed and the injection stayed at Tier 3.

---

## 4. Small bugs, as design lessons

| Bug | Lesson |
|---|---|
| "pay" matched the poisoned invoice and held a normal payment | False positives cost trust. Attribution needs a threshold. |
| Countdown showed "498163h" on its first frame | An undo meter that lies once is never believed again. |
| Card named a batch time already past if the tab stayed open | Deadlines have to be live, not computed at load. |
| An early click on Run skipped live planning | The button waits until it knows how it will plan. |
| The in-chat view took focus on load | An embedded app is a guest in someone else's interface. |
| IRN meter says "until 8:59 pm" for a window ending tomorrow | **Open.** A time needs a day once it's more than a few hours away. |

---

## 5. Numbers

- The recorded plan proposes **27** actions: **10** are only logged; the other 17 are bundled into **4** cards that need the person.
- **8** rules, **4** tiers, **2** axes.
- 3 vendors, 3 vendor invoices (1 poisoned), 6 sales invoices awaiting IRN, 7 overdue receivables.
- Hidden line asks to redirect **₹3,15,000** to •••• 1936; the account on file is •••• 7712.
- **91** unit tests and **16** browser tests (7 of them in a test chat host).
- Built 30 Oct – 1 Nov 2026, 15 commits.
- Live planner: one structured-output call to `claude-haiku-5-5`, no tools.

---

## 6. Screens

All are in `screens/`, at 2× from a 960px-wide desktop or a 390px phone, in IST. Regenerate with:

```bash
npx playwright test -c case-study/shots.config.ts
```

They use the **recorded plan** and say so on screen ("Recorded plan"). For live-run images, use your own screenshots from the deployed site.

| File | What it shows |
|---|---|
| `01-start` | Start screen: the request and the four-tier legend |
| `02-brief-full` | The whole brief after planning (tall) |
| `03-brief-fold` | Above the fold: "4 things need you", the log, the top of the Tier 3 card |
| `04-tier0-log` | Tier 0: done work as quiet lines |
| `05-tier3-card` | The full stop card |
| `06-hidden-line` | The invoice as the agent read it, hidden text highlighted |
| `07-bank-compare` | On file versus this request |
| `08-tier3-why` | "How this was decided": R3, R5, R6 |
| `09-tier2-payments` | Payments card at rest |
| `10-tier2-holding` | Mid-hold: "Keep holding…" |
| `11-tier2-irns` | IRN batch, collapsed after three items |
| `12-tier1-batch` | Reminders as one slim card |
| `13-tier1-choose` | Choosing which reminders to send |
| `14-rules` | The eight rules |
| `15-safe-path-card` | After "Pay the account on file instead": a normal Tier 2 to •••• 7712 |
| `16-handled-undo` | Handled rows with live undo meters. **Retake after the IRN end-time fix.** |
| `17-all-clear` | Everything handled |
| `18-planning-failed` | "Claude couldn't plan this. Nothing was done." |
| `19-phone-fold`, `20-phone-full`, `21-phone-tier3` | 390px phone |
| `22-chat-light`, `23-chat-light-scrolled` | Inline in a chat, light host |
| `24-chat-dark` | Inline in a chat, dark host |

`22`–`24` come from the test chat host (the SDK's own host bridge), not from Claude. Replace them with real Claude screenshots once you've added the connector.

---

## 7. Copy worth quoting

From the interface, as shipped:
- "Not every action deserves the same interruption."
- "This instruction came from text inside a document, not from you."
- "That number is from your vendor master, not from the PDF."
- "There is no Approve button on purpose. If the change is real, confirm it with the vendor, then update the vendor master yourself."
- "The visible invoice still prints the account on file. Only the hidden line asks for a different one."
- "Once the batch is released, a transfer can't be recalled."
- "The model proposes; it does not pick the tier."
- "Claude couldn't plan this. Nothing was done."
- "You handled N things. Nothing went out that you didn't see." (All clear)

---

## 8. Honest limits

Say these in the case study; they make the rest more credible.
- **The scenario is fixed.** The planner can't be given other books or other requests. That's deliberate, so the endpoint isn't an open proxy to Claude.
- **The rules are hand-written** for one domain. Generalising them is the real open problem, not solved here.
- **Bank batches are invented** (every half hour). The 24-hour IRN cancellation window must be checked against the current government notification before any public claim.
- **One model, three live runs.** Behaviour on other models, or across many runs, is untested.
- **The in-chat view** has only been run in a test host so far, and has no dark palette.

---

## 9. A possible outline

Use it or ignore it.

1. **Hook:** the hidden line, `06-hidden-line`. One sentence on what would have happened.
2. **The problem:** asking for everything versus asking for nothing.
3. **The idea:** two axes, four tiers, the table above. `03-brief-fold`.
4. **Each tier as an interaction**, worst first: `05`, `10`, `12`, `04`.
5. **Why the model doesn't pick the tier:** three planners, one gate. Provenance and the "pay" false positive.
6. **What live runs taught:** the three-run table.
7. **Details that carry the argument:** the hold, honest undo, failure that does nothing, focus in a chat.
8. **In a chat:** `22`, plus your real Claude screenshot.
9. **Limits, and what's next.**
