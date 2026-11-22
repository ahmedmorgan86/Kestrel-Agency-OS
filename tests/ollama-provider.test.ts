import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateStructuredText, verifyOllamaConnection } from '../server/services/aiProviders';

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
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: { content: '{"summary":"Ready","requiresHumanApproval":true}' },
      prompt_eval_count: 24,
      eval_count: 12,
    }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const previousBase = process.env.OLLAMA_BASE_URL;
  const previousModel = process.env.OLLAMA_MODEL;
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
    assert.equal(captured.chatBody?.stream, false);
    assert.equal(captured.chatBody?.think, false);
  } finally {
    if (previousBase === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = previousBase;
    if (previousModel === undefined) delete process.env.OLLAMA_MODEL;
    else process.env.OLLAMA_MODEL = previousModel;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
