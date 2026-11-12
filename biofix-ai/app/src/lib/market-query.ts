// One-shot hand-off of a search term to the Market tab ("Find in market" on a diagnosis part).
let pending: string | null = null;
export const setPendingMarketQuery = (q: string) => { pending = q; };
export const takePendingMarketQuery = () => { const q = pending; pending = null; return q; };
