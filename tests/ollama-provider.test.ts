import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateStructuredText, getOllamaGenerationTimeoutSeconds, verifyOllamaConnection } from '../server/services/aiProviders';

test('local generation timeout defaults high enough for CPU inference and clamps unsafe values', () => {
  const previous = process.env.OLLAMA_GENERATION_TIMEOUT_SECONDS;
  try {
    delete process.env.OLLAMA_GENERATION_TIMEOUT_SECONDS;
    assert.equal(getOllamaGenerationTimeoutSeconds(), 900);
    process.env.OLLAMA_GENERATION_TIMEOUT_SECONDS = '30';
    assert.equal(getOllamaGenerationTimeoutSeconds(), 60);
    process.env.OLLAMA_GENERATION_TIMEOUT_SECONDS = '3600';
    assert.equal(getOllamaGenerationTimeoutSeconds(), 1800);
    process.env.OLLAMA_GENERATION_TIMEOUT_SECONDS = 'invalid';
    assert.equal(getOllamaGenerationTimeoutSeconds(), 900);
  } finally {
    if (previous === undefined) delete process.env.OLLAMA_GENERATION_TIMEOUT_SECONDS;
    else process.env.OLLAMA_GENERATION_TIMEOUT_SECONDS = previous;
  }
});

test('local Ollama adapter verifies the configured model and returns structured output without cloud usage', async () => {
  const captured: { chatBody: Record<string, unknown> | null } = { chatBody: null };
  const server = createServer(async (req, res) => {
    if (req.url === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'qwen3.5:4b' }] }));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    captured.chatBody = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    const stream = [
      { message: { content: '{"summary":"Ready",' }, done: false },
      { message: { content: '"requiresHumanApproval":true}' }, done: false },
      { done: true, prompt_eval_count: 24, eval_count: 12 },
    ].map((event) => JSON.stringify(event)).join('\n') + '\n';
    res.write(stream.slice(0, 19));
    setTimeout(() => res.end(stream.slice(19)), 5);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const previousBase = process.env.OLLAMA_BASE_URL;
  const previousModel = process.env.OLLAMA_MODEL;
  const previousTimeout = process.env.OLLAMA_GENERATION_TIMEOUT_SECONDS;
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.OLLAMA_MODEL = 'qwen3.5:4b';

  try {
    const check = await verifyOllamaConnection();
    assert.equal(check.ok, true);
    const result = await generateStructuredText({
      provider: 'ollama',
      model: 'qwen3.5:4b',
      systemInstruction: 'Return JSON.',
      prompt: 'Summarize status.',
      expectJson: true,
    });
    assert.equal(result.provider, 'ollama');
    assert.equal(result.parsedJson?.summary, 'Ready');
    assert.equal(result.promptTokens, 24);
    assert.equal(result.outputTokens, 12);
    assert.equal(result.costUsd, 0);
    assert.equal(result.rateCardFound, true);
    assert.equal(captured.chatBody?.model, 'qwen3.5:4b');
    assert.equal(captured.chatBody?.stream, true);
    assert.equal(captured.chatBody?.think, false);
    assert.equal((captured.chatBody?.options as Record<string, unknown>)?.num_predict, 700);
  } finally {
    if (previousBase === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = previousBase;
    if (previousModel === undefined) delete process.env.OLLAMA_MODEL;
    else process.env.OLLAMA_MODEL = previousModel;
    if (previousTimeout === undefined) delete process.env.OLLAMA_GENERATION_TIMEOUT_SECONDS;
    else process.env.OLLAMA_GENERATION_TIMEOUT_SECONDS = previousTimeout;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('local Ollama adapter retries a transient connection reset once before failing a production stage', async (t) => {
  let requests = 0;
  const server = createServer(async (req, res) => {
    if (req.url !== '/api/chat') return res.writeHead(404).end();
    requests += 1;
    for await (const _chunk of req) { /* consume request body */ }
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    res.end(`${JSON.stringify({ message: { content: '{"ready":true}' }, done: false })}\n${JSON.stringify({ done: true })}\n`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const previousBase = process.env.OLLAMA_BASE_URL;
  const previousModel = process.env.OLLAMA_MODEL;
  const realFetch = globalThis.fetch;
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.OLLAMA_MODEL = 'qwen3.5:4b';
  let simulatedDisconnects = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/api/chat') && simulatedDisconnects === 0) {
      simulatedDisconnects += 1;
      throw new TypeError('fetch failed: ECONNRESET');
    }
    return realFetch(input, init);
  };

  t.after(async () => {
    globalThis.fetch = realFetch;
    if (previousBase === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = previousBase;
    if (previousModel === undefined) delete process.env.OLLAMA_MODEL;
    else process.env.OLLAMA_MODEL = previousModel;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  const result = await generateStructuredText({
    provider: 'ollama', model: 'qwen3.5:4b', systemInstruction: 'أخرج JSON.', prompt: 'أنشئ موجزاً.', expectJson: true,
  });
  assert.equal(result.parsedJson?.ready, true);
  assert.equal(simulatedDisconnects, 1);
  assert.equal(requests, 1);
});
