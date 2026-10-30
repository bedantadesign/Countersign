import type { SourceDocument } from './types';

/** What an agent extracts from the file: every run of text, visible or not. */
export function documentText(doc: SourceDocument): string {
  return doc.blocks.map((b) => b.text).join('\n');
}
