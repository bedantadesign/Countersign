export type Tier = 0 | 1 | 2 | 3;

/** Who is affected if this action is wrong. */
export type Blast = 'private' | 'external' | 'consequential';

export type ActionKind =
  | 'reconcile_gstr2b'
  | 'draft_reminder'
  | 'send_reminder'
  | 'generate_irn'
  | 'pay_vendor'
  | 'update_bank_details';

export interface BankAccount {
  accountNumber: string;
  ifsc: string;
}

export interface Vendor {
  id: string;
  name: string;
  gstin: string;
  /** The destination of record. Only a person changes this. */
  bank: BankAccount;
  bankChangedAt: string;
  lastPaidAt: string;
  averagePaymentPaise: number;
  contactName: string;
  contactPhone: string;
}

/** One run of extracted text. Hidden runs are invisible to people but not to an agent. */
export interface DocBlock {
  text: string;
  hidden?: boolean;
}

export interface SourceDocument {
  id: string;
  filename: string;
  vendorId: string;
  blocks: DocBlock[];
}

export interface Provenance {
  origin: 'user' | 'document';
  documentId?: string;
  /** The words the action was derived from. */
  quote?: string;
}

export interface Counterparty {
  id: string;
  name: string;
  gstin?: string;
}

export interface EmailPreview {
  to: string;
  subject: string;
  body: string;
}

export interface ProposedAction {
  id: string;
  kind: ActionKind;
  title: string;
  detail?: string;
  counterparty?: Counterparty;
  amountPaise?: number;
  /** Destination account for pay_vendor, new details for update_bank_details. */
  bank?: BankAccount;
  refId?: string;
  email?: EmailPreview;
  /** What the planner says it derived this from. The engine re-checks it. */
  provenance: Provenance;
}

export type Reversibility =
  | { kind: 'full' }
  | { kind: 'windowed'; label: string; windowMs?: number; expiresAt?: number }
  | { kind: 'permanent' };

export interface Context {
  now: number;
  vendors: Record<string, Vendor>;
  documents: SourceDocument[];
  /** When the next bank payment batch is released. */
  paymentCutoffAt: number;
}

export interface RuleHit {
  ruleId: string;
  name: string;
  tier: Tier;
  reason: string;
}

export interface EffectiveProvenance {
  origin: 'user' | 'document';
  documentId?: string;
  quote?: string;
  /** How the engine reached this, which may differ from what the planner declared. */
  basis: 'user' | 'declared' | 'quote-in-document' | 'tainted-parameter';
}

export interface Decision {
  action: ProposedAction;
  tier: Tier;
  blast: Blast;
  reversibility: Reversibility;
  provenance: EffectiveProvenance;
  hits: RuleHit[];
  /** Plain-language answer to "why am I seeing this". */
  why: string;
}

export interface Card {
  id: string;
  tier: 1 | 2 | 3;
  kind: ActionKind;
  items: Decision[];
}
