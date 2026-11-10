// Hands a manual's extracted text from the developer panel to the "add document" form (too large for route params).
let draft: { name: string; text: string } = { name: '', text: '' };
export const setDocDraft = (d: { name: string; text: string }) => { draft = d; };
export const takeDocDraft = () => { const d = draft; draft = { name: '', text: '' }; return d; };
