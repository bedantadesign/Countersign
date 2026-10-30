'use client';

import type { Card, Context, DocBlock } from '@/lib/types';
import { formatDate, formatINR, groupAccount } from '@/lib/format';
import { hiddenText, normalise } from '@/lib/documents';
import { rerouteToAccountOnFile } from '@/lib/cards';
import { sameAccount } from '@/lib/tiering';
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

const digits = (s: string) => s.replace(/\D/g, '');

/**
 * Tier 3: no Approve button. When a document gave the instruction, shows where it came from.
 * When the hold is about the payment itself (a recent bank change, an unusual amount), says so
 * plainly and offers only the paths that resolve it.
 */
export function StopCard({ card, index, ctx, onVerify, onReroute, onReject }: Props) {
  const pay = card.items.find((d) => d.action.kind === 'pay_vendor');
  const lead = pay ?? card.items[0]!;
  const vendor = lead.action.counterparty ? ctx.vendors[lead.action.counterparty.id] : undefined;
  const doc =
    lead.provenance.origin === 'document' ? ctx.documents.find((d) => d.id === lead.provenance.documentId) : undefined;
  const newBank = vendor && lead.action.bank && !sameAccount(lead.action.bank, vendor.bank) ? lead.action.bank : undefined;
  const amount = pay?.action.amountPaise;
  const canReroute = rerouteToAccountOnFile(card, ctx) !== null;

  const quote = lead.provenance.quote;
  const inHiddenText = !!doc && !!quote && normalise(hiddenText(doc)).includes(normalise(quote));
  const visibleText = doc ? doc.blocks.filter((b) => !b.hidden).map((b) => b.text).join(' ') : '';
  const visiblePrintsOnFile = !!vendor && !!doc && digits(visibleText).includes(digits(vendor.bank.accountNumber));

  const title = doc
    ? `${inHiddenText ? 'A hidden line' : 'Text'} in ${doc.filename} tells Claude to ${
        newBank ? `redirect ${amount ? formatINR(amount) : 'a payment'} to a new account` : lead.action.title.toLowerCase()
      }`
    : `${lead.action.title}${amount ? ` · ${formatINR(amount)}` : ''}`;

  return (
    <CardShell id={card.id} tier={3} index={index} title={title} why={lead.why}>
      {doc ? (
        <section className="source" aria-label="Where this instruction came from">
          <div className="source__row">
            <span className="glyph" data-tier={0}>
              <Icon name="user" size={14} />
            </span>
            <div>
              <h3>
                You <span className="chip">Didn’t ask for this</span>
              </h3>
              <blockquote>“{ctx.request}”</blockquote>
            </div>
          </div>
          <div className="source__row">
            <span className="glyph" data-tier={3}>
              <Icon name="file" size={14} />
            </span>
            <div>
              <h3>
                {doc.filename} <span className="chip chip--bad">Source of this request</span>
              </h3>
              <Paper filename={doc.filename} blocks={doc.blocks} quote={quote} />
            </div>
          </div>
        </section>
      ) : null}

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
                <td>{doc ? 'Today, by this request' : 'Not on file'}</td>
              </tr>
            </tbody>
          </table>
          {inHiddenText && visiblePrintsOnFile ? (
            <p className="hint" style={{ textAlign: 'left', marginTop: 8 }}>
              The visible invoice still prints the account on file. Only the hidden line asks for a different one.
            </p>
          ) : null}
        </div>
      ) : null}

      {vendor ? (
        <div className="note">
          <span className="note__label">Safe path</span>
          <p>
            Call {vendor.contactName} on {vendor.contactPhone}. That number is from your vendor master
            {doc ? ', not from the PDF' : ''}.
          </p>
        </div>
      ) : null}

      <div className="actions">
        <button type="button" className="btn btn--tier btn--block" onClick={onVerify}>
          <Icon name="phone" size={16} /> Verify with vendor
        </button>
        {canReroute ? (
          <button type="button" className="btn btn--block" onClick={onReroute}>
            Pay the account on file instead{amount ? ` · ${formatINR(amount)}` : ''}
          </button>
        ) : null}
        <button type="button" className="btn btn--quiet btn--block" onClick={onReject}>
          {doc ? 'Reject and flag the PDF' : 'Reject'}
        </button>
        <p className="hint">
          {doc
            ? 'There is no Approve button on purpose. If the change is real, confirm it with the vendor, then update the vendor master yourself.'
            : 'There is no Approve button on purpose. Once the vendor has confirmed it, make the payment yourself.'}
        </p>
      </div>

      <WhyDetails decisions={card.items} />
    </CardShell>
  );
}
