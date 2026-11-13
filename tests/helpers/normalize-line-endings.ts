/**
 * Normalize Windows (`\r\n`) line endings to Unix (`\n`) so exact-text
 * comparisons hold on any checkout platform. Apply only at a
 * text-comparison boundary; never rewrite the source artifact itself.
 */
export function normalizeLineEndings(text: string): string {
  return text.replaceAll('\r\n', '\n');
}
