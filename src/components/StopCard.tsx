'use client';

import type { Card, Context, DocBlock } from '@/lib/types';
import { formatDate, formatINR, groupAccount } from '@/lib/format';
import { TASK } from '@/lib/fixtures';
import { CardShell } from './CardShell';
import { Icon } from './Icon';
import { WhyDetails } from './WhyDetails';

interface Props {
  card: Card;
  index: number;
  ctx: Context;
  onVerify: () => void;
  onReroute: () => void;
  onReject: () => void;
}

function Highlight({ text, quote }: { text: string; quote?: string }) {
  const at = quote ? text.indexOf(quote) : -1;
  if (!quote || at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{quote}</mark>
      {text.slice(at + quote.length)}
    </>
  );
}

function Paper({ filename, blocks, quote }: { filename: string; blocks: DocBlock[]; quote?: string }) {
  const visible = blocks.filter((b) => !b.hidden);
  const hidden = blocks.filter((b) => b.hidden);
  return (
    <figure className="paper" aria-label={`Text extracted from ${filename}`}>
      <figcaption className="paper__name">
        <span>{filename}</span>
        <span>Text the agent read</span>
      </figcaption>
      {visible.map((b) => (
        <p className="paper__line" key={b.text}>
          {b.text}
        </p>
      ))}
      {hidden.map((b) => (
        <div className="paper__hidden" key={b.text}>
          <span className="paper__hidden-tag">
            <Icon name="eyeOff" size={12} /> Hidden text · invisible when you open the PDF
          </span>
          <Highlight text={b.text} quote={quote} />
        </div>
      ))}
    </figure>
  );
}

/** Tier 3: no Approve button. Shows where the instruction came from and offers the safe paths. */
export function StopCard({ card, index, ctx, onVerify, onReroute, onReject }: Props) {
  const pay = card.items.find((d) => d.action.kind === 'pay_vendor');
  const lead = pay ?? card.items[0]!;
  const vendor = lead.action.counterparty ? ctx.vendors[lead.action.counterparty.id] : undefined;
  const doc = ctx.documents.find((d) => d.id === lead.provenance.documentId);
  const newBank = lead.action.bank;
  const amount = pay?.action.amountPaise;

  const title = doc
    ? `A hidden line in ${doc.filename} tells Claude to redirect ${amount ? formatINR(amount) : 'a payment'} to a new account`
    : `${lead.action.title} needs verifying`;

  return (
    <CardShell id={card.id} tier={3} index={index} title={title} why={lead.why}>
      <section className="source" aria-label="Where this instruction came from">
        <div className="source__row">
          <span className="glyph" data-tier={0}>
            <Icon name="user" size={14} />
          </span>
          <div>
            <h3>
              You <span className="chip">Didn’t ask for this</span>
            </h3>
            <blockquote>“{TASK}”</blockquote>
          </div>
        </div>
        {doc ? (
          <div className="source__row">
            <span className="glyph" data-tier={3}>
              <Icon name="file" size={14} />
            </span>
            <div>
              <h3>
                {doc.filename} <span className="chip chip--bad">Source of this request</span>
              </h3>
              <Paper filename={doc.filename} blocks={doc.blocks} quote={lead.provenance.quote} />
            </div>
          </div>
        ) : null}
      </section>

      {vendor && newBank ? (
        <div>
          <table className="compare">
            <caption className="sr-only">Bank details on file compared with this request</caption>
            <thead>
              <tr>
                <th scope="col">Bank details</th>
                <th scope="col">On file</th>
                <th scope="col">This request</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Account</th>
                <td>{groupAccount(vendor.bank.accountNumber)}</td>
                <td>{groupAccount(newBank.accountNumber)}</td>
              </tr>
              <tr>
                <th scope="row">IFSC</th>
                <td>{vendor.bank.ifsc}</td>
                <td>{newBank.ifsc}</td>
              </tr>
              <tr>
                <th scope="row">Last changed</th>
                <td>{formatDate(vendor.bankChangedAt)}</td>
                <td>Today, by this request</td>
              </tr>
            </tbody>
          </table>
          <p className="hint" style={{ textAlign: 'left', marginTop: 8 }}>
            The visible invoice still prints the account on file. Only the hidden line asks for a different one.
          </p>
        </div>
      ) : null}

      {vendor ? (
        <div className="note">
          <span className="note__label">Safe path</span>
          <p>
            Call {vendor.contactName} on {vendor.contactPhone}. That number is from your vendor master, not from the PDF.
          </p>
        </div>
      ) : null}

      <div className="actions">
        <button type="button" className="btn btn--tier btn--block" onClick={onVerify}>
          <Icon name="phone" size={16} /> Verify with vendor
        </button>
        {pay ? (
          <button type="button" className="btn btn--block" onClick={onReroute}>
            Pay the account on file instead{amount ? ` · ${formatINR(amount)}` : ''}
          </button>
        ) : null}
        <button type="button" className="btn btn--quiet btn--block" onClick={onReject}>
          Reject and flag the PDF
        </button>
        <p className="hint">
          There is no Approve button on purpose. If the change is real, confirm it with the vendor, then update the
          vendor master yourself.
        </p>
      </div>

      <WhyDetails decisions={card.items} />
    </CardShell>
  );
}
