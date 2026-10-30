import type { SourceDocument } from './types';

/** What an agent extracts from the file: every run of text, visible or not. */
export function documentText(doc: SourceDocument): string {
  return doc.blocks.map((b) => b.text).join('\n');
}

/** Text no person sees when they open the file: white-on-white, off-page, zero-size. */
export function hiddenText(doc: SourceDocument): string {
  return doc.blocks
    .filter((b) => b.hidden)
    .map((b) => b.text)
    .join('\n');
}

/** Lowercase letters and digits only, so spacing and punctuation never decide a match. */
export function normalise(s: string): string {
  return s.replace(/[^a-z0-9]/gi, '').toLowerCase();
}
