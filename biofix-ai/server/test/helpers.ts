// Shared test setup: a server per test group with fakes for everything outside this process
// (e-mail, Google Play, the AI).
import { after } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { AiError, type DeviceLabel, type DiagnoseInput } from '../src/ai.js';
import { createApp } from '../src/index.js';
import type { Mailer } from '../src/mailer.js';
import type { PlayClient } from '../src/play.js';
import type { AiService } from '../src/routes.js';
import { Store } from '../src/store.js';
import type { Diagnosis, Solution } from '../src/types.js';

delete process.env.ANTHROPIC_API_KEY;
process.env.ADMIN_TOKEN = 'test-admin-token-0123456789abcdef';
process.env.AUDIT_LOG = 'off';
process.env.DEMO_PAYMENTS = 'true'; // the tests exercise the demo purchase paths too
export const ADMIN = { 'x-admin-token': 'test-admin-token-0123456789abcdef' };

const servers: Server[] = [];
after(() => servers.forEach((s) => s.close()));

/** Each test group gets its own server, store and rate limiter. */
export async function makeApp(ai?: AiService, store = new Store(null), play: PlayClient | null = null, mail?: Mailer) {
  const codes = new Map<string, string>();  // latest verification code per mailbox
  const resets = new Map<string, string>(); // latest password reset code per mailbox
  const mailer: Mailer = mail ?? {
    enabled: true,
    async sendVerifyCode(to, code) { codes.set(to, code); },
    async sendResetCode(to, code) { resets.set(to, code); },
  };
  const server = createApp(store, { mailer, play, ai }).listen(0);
  servers.push(server);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  async function call(method: string, p: string, body?: unknown, token = '', extra: Record<string, string> = {}) {
    const res = await fetch(base + p, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: res.status, json, headers: res.headers, text };
  }
  /** A streamed request: returns every line the server wrote, in order. */
  async function stream(p: string, body: unknown, token: string, signal?: AbortSignal) {
    const res = await fetch(base + p, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', accept: 'application/x-ndjson', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const events = text.split('\n').filter(Boolean).map((l) => JSON.parse(l) as any);
    return { status: res.status, type: res.headers.get('content-type') || '', events };
  }
  /** Register without confirming the address. */
  const signUp = (email: string, name = 'Test User', password = 'correct horse') =>
    call('POST', '/auth/register', { email, password, name });
  /** Register and confirm the e-mailed code; returns the session token. */
  const register = async (email: string, name = 'Test User', password = 'correct horse') => {
    const r = await signUp(email, name, password);
    await call('POST', '/auth/verify', { code: codes.get(email.trim().toLowerCase()) }, r.json.token);
    return r.json.token as string;
  };
  return { base, store, call, stream, register, signUp, codes, resets };
}

export const diagnosis: Diagnosis = {
  summary: 'Güç kartı arızası olası.', firstAction: 'TP2 noktasını ölç.', confidence: 'medium', grounded: true,
  causes: [], steps: [], parts: [], warnings: [], questions: [], community: [],
};

interface FakeOptions {
  /** Solutions the pre-check should flag as dangerous. */
  flag?: (s: Solution) => boolean;
  fail?: () => boolean;
  delayMs?: number;
  /** Intermediate states reported through onPartial before the answer completes. */
  partials?: Partial<Diagnosis>[];
  /** Never answer; finish only when the request is aborted. */
  hang?: boolean;
  label?: DeviceLabel;
}

/** A fake AI that records what it was asked and can be told to flag solutions, fail, stream or hang. */
export function fakeAi(opts: FakeOptions = {}) {
  const seen = {
    calls: 0, solutions: [] as string[][], inputs: [] as DiagnoseInput[], aborted: 0,
    pdfs: [] as string[], indexed: [] as string[][], labels: 0, followUps: [] as string[],
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const service: AiService = {
    aiConfigured: () => true,
    async diagnose(input, o = {}) {
      seen.calls++;
      seen.inputs.push(input);
      seen.solutions.push(input.sols.map((e) => e.sol.symptom));
      if (opts.hang) {
        await new Promise<void>((resolve) => { o.signal?.addEventListener('abort', () => resolve()); });
        seen.aborted++;
        throw new AiError('cancelled');
      }
      for (const p of opts.partials ?? []) {
        o.onPartial?.({ ...diagnosis, summary: '', firstAction: '', ...p });
        await sleep(5);
      }
      await sleep(opts.delayMs ?? 5);
      if (opts.fail?.()) throw new AiError('generic', 'boom');
      return diagnosis;
    },
    async followUp(_x, q, _lang, o = {}) {
      seen.followUps.push(q);
      for (const piece of ['C14 ', 'bir ESR metre ', 'ile ölçülür.']) { o.onDelta?.(piece); await sleep(2); }
      return 'C14 bir ESR metre ile ölçülür.';
    },
    async precheck(s) { return { ai: { v: 'not_covered', note: 'n', safe: !!opts.flag?.(s) }, photoNote: '' }; },
    async identifyDevice(_image, known) {
      seen.labels++;
      return opts.label ?? { brand: 'Örnek', model: 'Hasta Monitörü PM-12', serial: 'SN123', device: known.find((d) => d.includes('PM-12')) ?? '' };
    },
    async transcribePage() { return 'text'; },
    async transcribePdf(_data, name) {
      seen.pdfs.push(name);
      await sleep(opts.delayMs ?? 2);
      if (opts.fail?.()) throw new AiError('generic', 'boom');
      return `# ${name}\nAI ile okunan sayfa metni.`;
    },
    async indexSections(_title, _device, chunks) {
      seen.indexed.push(chunks.map((c) => c.h));
      if (opts.fail?.()) throw new AiError('generic', 'boom');
      return chunks.map((c) => ({
        keywords: /pneumatic/i.test(c.t) ? 'hava kaçağı basınç düşük leak' : '',
        codes: /pneumatic/i.test(c.t) ? [{ code: 'P-07', text: 'Pressure too low. Check the tubing.' }] : [],
      }));
    },
  };
  return { service, seen };
}

export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString('base64');
export const solution = (over: Record<string, unknown> = {}) => ({
  brand: 'Örnek', model: 'Z9', symptom: 'Pompa basınç üretmiyor', steps: '1. Hortumu kontrol et\n2. Contayı değiştir ve test et', ...over,
});
