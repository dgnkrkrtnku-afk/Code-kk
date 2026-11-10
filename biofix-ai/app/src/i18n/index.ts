import { STRINGS, type Lang } from './strings';
import { EXTRA } from './extra';

export type { Lang } from './strings';
export type Key = keyof typeof STRINGS.tr | keyof typeof EXTRA.tr;

/** Translate with {0}, {1}… placeholders; falls back to Turkish, then to the key. */
export function translate(lang: Lang, k: Key | string, ...args: (string | number)[]): string {
  const pick = (l: Lang) => (STRINGS[l] as Record<string, string>)[k] ?? (EXTRA[l] as Record<string, string>)[k];
  let s = pick(lang) ?? pick('tr') ?? k;
  args.forEach((a, i) => { s = s.split(`{${i}}`).join(String(a)); });
  return s;
}

export { COUNTRY } from './strings';
