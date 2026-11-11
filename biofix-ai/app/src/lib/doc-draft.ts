// Hands a manual's extracted text from the developer panel to the "add document" form (too large for route params).
let draft: { name: string; text: string } = { name: '', text: '' };
export const setDocDraft = (d: { name: string; text: string }) => { draft = d; };
/** Reading does not clear the draft: React may render a screen more than once before showing it. The panel sets a fresh one each time. */
export const getDocDraft = () => draft;
export const clearDocDraft = () => { draft = { name: '', text: '' }; };
