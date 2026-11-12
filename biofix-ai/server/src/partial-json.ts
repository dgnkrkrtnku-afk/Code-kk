// Reads a JSON document while it is still being written, so a streamed answer can be shown as it arrives.

/**
 * Parse the beginning of a JSON document. Returns the value described so far: an unfinished string
 * is cut where it stands, an unfinished member or number is left out. Returns undefined when not
 * even the first value has started.
 */
export function parsePartialJson(src: string): unknown {
  const closers: string[] = [];
  let inStr = false;
  let esc = false;
  let keyStr = false;      // the string being read is a member name, not a value
  let expectKey = false;   // inside an object, the next string is a member name
  let safe = -1;           // src.slice(0, safe) + safeClose is valid JSON
  let safeClose = '';
  const close = () => closers.slice().reverse().join('');
  const mark = (i: number) => { safe = i; safeClose = close(); };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') { inStr = false; if (!keyStr) mark(i + 1); }
      continue;
    }
    switch (ch) {
      case '"': inStr = true; keyStr = expectKey; break;
      case '{': closers.push('}'); expectKey = true; mark(i + 1); break;
      case '[': closers.push(']'); expectKey = false; mark(i + 1); break;
      case '}': case ']': closers.pop(); expectKey = false; mark(i + 1); break;
      case ':': expectKey = false; break;
      // A comma only ever follows a complete value, so everything before it is safe to keep.
      case ',': mark(i); expectKey = closers[closers.length - 1] === '}'; break;
      default:
    }
  }

  const tryParse = (t: string): unknown => { try { return JSON.parse(t) as unknown; } catch { return undefined; } };
  if (inStr && !keyStr) {
    // An unfinished string value: keep what has arrived, minus a half-written escape sequence.
    let body = esc ? src.slice(0, -1) : src;
    const m = /\\u[0-9a-fA-F]{0,3}$/.exec(body);
    if (m) {
      let slashes = 0;
      for (let j = m.index; j >= 0 && body[j] === '\\'; j--) slashes++;
      if (slashes % 2 === 1) body = body.slice(0, m.index); // the backslash really starts an escape
    }
    const v = tryParse(body + '"' + close());
    if (v !== undefined) return v;
  } else if (!inStr) {
    const v = tryParse(src + close()); // the text may simply end after a complete value
    if (v !== undefined) return v;
  }
  return safe < 0 ? undefined : tryParse(src.slice(0, safe) + safeClose);
}
