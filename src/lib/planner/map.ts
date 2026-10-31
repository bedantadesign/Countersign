import type { Evidence, ProposedAction, SourceDocument } from '../types';
import { RECEIVABLES, SALES_INVOICES, VENDORS, irnAction, reminderAction, vendorCounterparty } from '../fixtures';
import type { Plan, PlannedAction } from './schema';

export interface Dropped {
  title: string;
  reason: string;
}

const clip = (s: string | null | undefined, max = 140) => (s ? s.slice(0, max) : undefined);

/**
 * Turns the planner's output into proposed actions.
 *
 * Record fields (customer, GSTIN, invoice total, email) come from the books. The planner only
 * controls what the gate must judge: the kind, the destination account, the payment amount and
 * who it says asked. Anything that names a record the books don't have is dropped, not guessed.
 */
export function toProposedActions(plan: Plan, documents: SourceDocument[]): { actions: ProposedAction[]; dropped: Dropped[] } {
  const actions: ProposedAction[] = [];
  const dropped: Dropped[] = [];
  const docIds = new Set(documents.map((d) => d.id));

  plan.actions.forEach((p, i) => {
    const id = `live-${i}-${p.kind}`;
    const evidence: Evidence[] = p.evidence.filter((e) => docIds.has(e.documentId));
    const provenance: ProposedAction['provenance'] =
      p.instructedBy === 'document'
        ? {
            origin: 'document',
            documentId: p.instructionDocumentId && docIds.has(p.instructionDocumentId) ? p.instructionDocumentId : undefined,
            quote: p.instructionQuote,
            evidence,
          }
        : { origin: 'user', quote: p.instructionQuote, evidence };
    const drop = (reason: string) => dropped.push({ title: clip(p.title, 80) ?? p.kind, reason });

    switch (p.kind) {
      case 'reconcile_gstr2b':
        actions.push({ id, kind: p.kind, title: clip(p.title, 80) ?? 'Reconciled purchases', detail: clip(p.detail), provenance });
        return;

      case 'draft_reminder':
      case 'send_reminder': {
        const r = RECEIVABLES.find((x) => x.invoiceNo === p.ref);
        if (!r) return drop(`No overdue receivable ${p.ref || '(none given)'}`);
        actions.push(reminderAction(r, p.kind, id, provenance));
        return;
      }

      case 'generate_irn': {
        const s = SALES_INVOICES.find((x) => x.invoiceNo === p.ref);
        if (!s) return drop(`No sales invoice ${p.ref || '(none given)'} awaiting an IRN`);
        actions.push(irnAction(s, id, provenance));
        return;
      }

      case 'pay_vendor':
      case 'update_bank_details': {
        const v = p.vendorId ? VENDORS[p.vendorId] : undefined;
        if (!v) return drop(`No vendor ${p.vendorId ?? '(none given)'} in the vendor master`);
        if (!p.bankAccountNumber || !p.ifsc) return drop('No destination account given');
        if (p.kind === 'pay_vendor' && (p.amountPaise === null || p.amountPaise <= 0)) return drop('No amount given');
        actions.push({
          id,
          kind: p.kind,
          title: p.kind === 'pay_vendor' ? `Pay ${v.name}` : `Update bank account for ${v.name}`,
          counterparty: vendorCounterparty(v),
          amountPaise: p.kind === 'pay_vendor' ? (p.amountPaise ?? undefined) : undefined,
          refId: p.ref || undefined,
          bank: { accountNumber: p.bankAccountNumber.replace(/\s+/g, ''), ifsc: p.ifsc.toUpperCase() },
          provenance,
        });
        return;
      }
    }
  });

  return { actions, dropped };
}

export type { PlannedAction };
