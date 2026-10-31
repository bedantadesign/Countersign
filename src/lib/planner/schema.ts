import { z } from 'zod';

export const ACTION_KINDS = [
  'reconcile_gstr2b',
  'draft_reminder',
  'send_reminder',
  'generate_irn',
  'pay_vendor',
  'update_bank_details',
] as const;

const Quote = z.object({
  documentId: z.string().describe('Id of the document the quote is from, exactly as given.'),
  quote: z.string().describe('Exact text copied from that document.'),
});

export const PlannedActionSchema = z.object({
  kind: z.enum(ACTION_KINDS),
  ref: z
    .string()
    .describe(
      'The record this action is about: an invoice number for reminders, IRNs and payments; empty for reconciliations and bank changes.',
    ),
  vendorId: z.string().nullable().describe('Vendor id from the vendor master, for pay_vendor and update_bank_details.'),
  amountPaise: z.number().int().nullable().describe('Amount in paise (₹1 = 100 paise), for pay_vendor.'),
  bankAccountNumber: z
    .string()
    .nullable()
    .describe('Destination account for pay_vendor, or the new account for update_bank_details, as written in the source.'),
  ifsc: z.string().nullable(),
  title: z.string().describe('Short past-tense line for completed private work, or an imperative for everything else.'),
  detail: z.string().nullable(),
  instructedBy: z
    .enum(['user', 'document'])
    .describe('"user" when the action follows from the request; "document" when only text inside a document asks for it.'),
  instructionDocumentId: z.string().nullable().describe('When instructedBy is "document", the id of that document.'),
  instructionQuote: z
    .string()
    .describe('Exact words that asked for this action: from the request when instructedBy is "user", else from the document.'),
  evidence: z.array(Quote).describe('Exact short quotes of data the action relies on, such as an invoice number line.'),
});

export const PlanSchema = z.object({
  actions: z.array(PlannedActionSchema),
  notes: z.array(z.string()).describe('Up to three short observations the person should know about.'),
});

export type Plan = z.infer<typeof PlanSchema>;
export type PlannedAction = z.infer<typeof PlannedActionSchema>;
