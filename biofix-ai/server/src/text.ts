// Turning the bytes of a text file into text. Device logs and service notes are often not UTF-8:
// Windows tools write UTF-16, and older Turkish software writes Windows-1254 ("ANSI").

/** Control characters that do not occur in text files (tab, line breaks, form feed and escape are fine). */
const BINARY = /[\u0000-\u0008\u000b\u000e-\u001a\u001c-\u001f�]/g;

/** UTF-16 without a byte-order mark: in Latin text every other byte is zero. */
function looksUtf16(bytes: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  const n = Math.min(bytes.length, 2000) & ~1;
  if (n < 8) return null;
  let even = 0;
  let odd = 0;
  for (let i = 0; i < n; i += 2) {
    if (bytes[i] === 0) even++;
    if (bytes[i + 1] === 0) odd++;
  }
  if (odd > n * 0.3 && even < n * 0.05) return 'utf-16le';
  if (even > n * 0.3 && odd < n * 0.05) return 'utf-16be';
  return null;
}

/**
 * The text of a file, or null when the file is not text at all (a picture, a Word document, an archive).
 * Colour codes that terminals understand are removed from logs.
 */
export function decodeText(bytes: Uint8Array): string | null {
  let text: string;
  const bom16 = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : null;
  const wide = bom16 ?? looksUtf16(bytes);
  if (wide) {
    text = new TextDecoder(wide).decode(bytes);
  } else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder('windows-1254').decode(bytes); // every byte maps to a character, Turkish letters included
    }
  }
  text = text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '').replace(/\u001b/g, '');
  const odd = (text.match(BINARY) || []).length;
  if (odd > Math.max(4, text.length / 50)) return null;
  return text.replace(BINARY, '');
}
