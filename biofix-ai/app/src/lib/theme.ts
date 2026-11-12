// Colour tokens ported from the prototype (light, true-black dark, high contrast).
export interface Colors {
  bg: string; surface: string; sunk: string; line: string; ink: string; muted: string;
  navy: string; onNavy: string; cyan: string; cyanSoft: string;
  ok: string; okBg: string; bad: string; badBg: string; warn: string; warnBg: string;
}

export const LIGHT: Colors = {
  bg: '#F2F5F8', surface: '#FFFFFF', sunk: '#E7EDF3', line: '#D3DDE7', ink: '#14202B', muted: '#566676',
  navy: '#0B2F4E', onNavy: '#FFFFFF', cyan: '#0B7F96', cyanSoft: '#DDF3F7',
  ok: '#1B7F52', okBg: '#E2F4EB', bad: '#B4372B', badBg: '#FAE6E3', warn: '#9A6412', warnBg: '#FAF0DC',
};

export const DARK: Colors = {
  bg: '#000000', surface: '#0E1114', sunk: '#161A1F', line: '#272D34', ink: '#E6EBF0', muted: '#94A1AE',
  navy: '#7DB3D6', onNavy: '#000000', cyan: '#73D2E0', cyanSoft: '#10282E',
  ok: '#86C9A4', okBg: '#10281C', bad: '#E59C93', badBg: '#331917', warn: '#DCC088', warnBg: '#2F2712',
};

export function makeColors(dark: boolean, highContrast: boolean): Colors {
  const c = { ...(dark ? DARK : LIGHT) };
  if (highContrast) { c.muted = c.ink; c.line = c.ink; }
  return c;
}

export const MONO = 'monospace';
