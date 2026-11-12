/** An error that maps to an HTTP status and a machine-readable code the app translates. */
export class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export const bad = (code: string) => new HttpError(400, code);
export const forbidden = (code = 'forbidden') => new HttpError(403, code);
export const notFound = () => new HttpError(404, 'not_found');
