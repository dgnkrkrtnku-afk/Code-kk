import type { Tone } from '../components/ui';
import type { ListingView } from './types';

export const condTone = (cond: ListingView['cond']): Tone => (cond === 'new' ? 'ok' : cond === 'used' ? 'warn' : 'info');

/** Parse a user-typed price ("1.250,50" or "1250.5"). */
export const parsePrice = (s: string) => parseFloat(String(s).replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')) || 0;

export const planName = (p: string) =>
  ({ free: 'pl_free_n', pro: 'pl_pro_n', trainer: 'pl_tr_n', biz: 'pl_biz_n', org: 'pl_org_n' } as Record<string, string>)[p] || p;
