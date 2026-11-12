// How a call to the AI service behaves when things go wrong: error mapping, the deadline, the fast lane.
// No request is sent anywhere: `run` is given stand-in send functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';

process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
delete process.env.BIOFIX_MODEL;
delete process.env.BIOFIX_EFFORT;
delete process.env.BIOFIX_SPEED;
const { AiError, diagnosisEffort, run, toAiError } = await import('../src/ai.js');
const { SEED_SOLUTIONS } = await import('../src/seed.js');

const apiError = (status: number, type: string, message = type) =>
  Anthropic.APIError.generate(status, { type: 'error', error: { type, message } }, message, new Headers());
const code = async (p: Promise<unknown>) => { try { await p; } catch (e) { return (e as InstanceType<typeof AiError>).code; } return 'no error'; };

test('errors from the AI service become codes the app can explain', () => {
  const map = (e: unknown) => toAiError(e).code;
  assert.equal(map(apiError(529, 'overloaded_error')), 'busy');
  assert.equal(map(apiError(500, 'api_error')), 'busy');
  assert.equal(map(apiError(503, 'api_error')), 'busy');
  assert.equal(map(new Anthropic.APIConnectionError({ message: 'socket hang up' })), 'busy');
  assert.equal(map(new Anthropic.APIConnectionTimeoutError()), 'busy');
  assert.equal(map(apiError(429, 'rate_limit_error')), 'rate_limited');
  assert.equal(map(apiError(413, 'request_too_large')), 'prompt_too_large');
  assert.equal(map(apiError(400, 'invalid_request_error', 'prompt is too long: 1200000 tokens')), 'prompt_too_large');
  assert.equal(map(apiError(400, 'invalid_request_error', 'Could not process image')), 'image_rejected');
  assert.equal(map(apiError(400, 'invalid_request_error', 'something else')), 'generic');
  assert.equal(map(apiError(401, 'authentication_error')), 'not_configured');
  assert.equal(map(apiError(403, 'permission_error')), 'not_configured');
  assert.equal(map(apiError(404, 'not_found_error')), 'not_configured', 'a model name the key cannot use');
  assert.equal(map(new Anthropic.APIUserAbortError()), 'cancelled');
  assert.equal(map(new Error('boom')), 'generic');
  assert.equal(map(new AiError('refused')), 'refused', 'our own errors pass through');
});

test('a call that stalls is given up after the deadline, and Stop cancels it at once', async () => {
  const hang = (_fast: boolean, req: { signal: AbortSignal }) => new Promise<never>((_resolve, reject) => {
    req.signal.addEventListener('abort', () => reject(new Anthropic.APIUserAbortError()));
  });
  process.env.BIOFIX_AI_TIMEOUT_S = '0.05';
  const started = Date.now();
  assert.equal(await code(run({}, hang)), 'timeout');
  assert.ok(Date.now() - started < 2000);
  delete process.env.BIOFIX_AI_TIMEOUT_S;

  const stop = new AbortController();
  setTimeout(() => stop.abort(), 20);
  assert.equal(await code(run({ signal: stop.signal }, hang)), 'cancelled');
});

test('interactive calls retry twice, background work on manuals five times', async () => {
  const seen: number[] = [];
  const ok = async (_fast: boolean, req: { maxRetries: number }) => { seen.push(req.maxRetries); return 'done'; };
  assert.equal(await run({}, ok), 'done');
  assert.equal(await run({ patient: true }, ok), 'done');
  assert.deepEqual(seen, [2, 5]);
});

test('in fast mode a full fast lane is not waited for: the request goes out again at normal speed', async () => {
  process.env.BIOFIX_SPEED = 'fast';
  const attempts: [boolean, number][] = [];
  const busyFastLane = async (fast: boolean, req: { maxRetries: number }) => {
    attempts.push([fast, req.maxRetries]);
    if (fast) throw apiError(429, 'rate_limit_error');
    return 'answer';
  };
  assert.equal(await run({}, busyFastLane), 'answer');
  assert.deepEqual(attempts, [[true, 0], [false, 2]], 'no waiting on the fast attempt, normal retries on the second');

  // A request the service rejects outright is not sent twice.
  let calls = 0;
  assert.equal(await code(run({}, async () => { calls++; throw apiError(400, 'invalid_request_error', 'bad'); })), 'generic');
  assert.equal(calls, 1);
  // Models without a fast mode never get the fast attempt.
  attempts.length = 0;
  await run({ model: 'claude-haiku-5-5' }, busyFastLane);
  assert.deepEqual(attempts, [[false, 2]]);
  delete process.env.BIOFIX_SPEED;
});

test('thinking depth: fixed by default, and with "auto" lower only for faults the knowledge base already answers', () => {
  const verified = { type: 'sol' as const, sol: { ...SEED_SOLUTIONS[0], id: 's', userId: null, photo: '', photoNote: '', votes: {}, rewarded: false, date: '', ok: 5, fail: 0, ai: null } };
  const unverified = { type: 'sol' as const, sol: { ...verified.sol, ok: 1 } };
  const dev = `${verified.sol.brand} ${verified.sol.model}`;
  const codeEntry = { code: 'E21', text: 'x', device: dev, docId: 'd', title: 't', ci: 0 };
  const input = (over: Record<string, unknown> = {}) => ({ codes: [], sols: [], images: [], file: null, dev, ...over }) as Parameters<typeof diagnosisEffort>[0];

  assert.equal(diagnosisEffort(input({ codes: [codeEntry] })), 'high', 'the default is the careful setting, whatever the fault');
  process.env.BIOFIX_EFFORT = 'medium';
  assert.equal(diagnosisEffort(input()), 'medium');

  process.env.BIOFIX_EFFORT = 'auto';
  assert.equal(diagnosisEffort(input()), 'high', 'an open-ended fault');
  assert.equal(diagnosisEffort(input({ codes: [codeEntry] })), 'medium', 'the manual explains the reported code');
  assert.equal(diagnosisEffort(input({ sols: [verified] })), 'medium', 'a verified fix for this device');
  assert.equal(diagnosisEffort(input({ sols: [unverified] })), 'high', 'an unverified fix is not an answer yet');
  assert.equal(diagnosisEffort(input({ sols: [verified], dev: 'Another Device X1' })), 'high', 'a fix for another device');
  assert.equal(diagnosisEffort(input({ codes: [codeEntry], images: [{ data: 'x', mediaType: 'image/jpeg' }] })), 'high', 'photos are studied carefully');
  assert.equal(diagnosisEffort(input({ codes: [codeEntry], file: { kind: 'text', name: 'a.log', text: 'x' } })), 'high');
  delete process.env.BIOFIX_EFFORT;
});
