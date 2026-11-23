import { GoogleGenAI, Type } from '@google/genai';
import { calculateAiUsageCostUsd } from '../../src/domain/finance';

export interface GroundedSourceLink {
  title: string;
  url: string;
}

export interface TextGenerationRequest {
  provider: string;
  model: string;
  systemInstruction: string;
  prompt: string;
  expectJson?: boolean;
  useGoogleSearch?: boolean;
  timeoutSeconds?: number;
  maxOutputTokens?: number;
}

export interface TextGenerationResult {
  provider: string;
  model: string;
  text: string;
  parsedJson: Record<string, unknown> | null;
  groundedSources: GroundedSourceLink[];
  promptTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  rateCardFound: boolean;
}

export interface ImageGenerationRequest {
  provider: string;
  model: string;
  prompt: string;
  aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
}

export interface ImageGenerationResult {
  provider: string;
  model: string;
  mimeType: string;
  imageBuffer: Buffer;
  latencyMs: number;
  costUsd: number;
}

export interface VideoGenerationRequest {
  provider: string;
  prompt: string;
  aspectRatio: string;
  durationSeconds: number;
}

export function getOllamaGenerationTimeoutSeconds(): number {
  const configured = Number(process.env.OLLAMA_GENERATION_TIMEOUT_SECONDS || 900);
  if (!Number.isFinite(configured)) return 900;
  return Math.max(60, Math.min(1800, Math.floor(configured)));
}

async function readOllamaChatStream(response: Response) {
  if (!response.body) throw new Error('Ollama returned an empty response body.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let text = '';
  let promptTokens = 0;
  let outputTokens = 0;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as {
      error?: string;
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    if (event.error) throw new Error(event.error);
    text += event.message?.content || '';
    promptTokens = event.prompt_eval_count ?? promptTokens;
    outputTokens = event.eval_count ?? outputTokens;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let newline = pending.indexOf('\n');
      while (newline >= 0) {
        consume(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
        newline = pending.indexOf('\n');
      }
      if (done) break;
    }
    consume(pending);
  } finally {
    reader.releaseLock();
  }

  return { text: text.trim(), promptTokens, outputTokens };
}

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key.trim().length > 10 && !key.startsWith('MY_'));
}

export async function verifyOllamaConnection(): Promise<{ ok: boolean; latencyMs: number; model: string; error?: string }> {
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'qwen3.5:4b';
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
    const payload = (await response.json()) as { models?: Array<{ name?: string }> };
    const names = (payload.models || []).map((entry) => entry.name || '');
    const installed = names.some((name) => name === model || name.startsWith(`${model}:`) || model.startsWith(`${name.split(':')[0]}:`));
    return {
      ok: installed,
      latencyMs: Date.now() - started,
      model,
      ...(installed ? {} : { error: `Ollama is available, but ${model} is not installed. Run: ollama pull ${model}` }),
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      model,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function createGeminiClient(): GoogleGenAI {
  if (!isGeminiConfigured()) {
    throw new Error(
      'Google Gemini provider is not configured: GEMINI_API_KEY is missing from server environment secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY!,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function tryExtractJson(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const cleaned = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { data: parsed };
  } catch {
    return null;
  }
}

export async function generateStructuredText(
  req: TextGenerationRequest
): Promise<TextGenerationResult> {
  if (req.provider === 'ollama') {
    if (req.useGoogleSearch) {
      throw new Error('Grounded web research is unavailable in local free mode. Configure Google Gemini free tier to use Google Search grounding.');
    }
    const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
    const started = Date.now();
    const model = req.model || process.env.OLLAMA_MODEL || 'qwen3.5:4b';
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(Math.max(30, req.timeoutSeconds || getOllamaGenerationTimeoutSeconds()) * 1000),
        body: JSON.stringify({
          model,
          stream: true,
          think: false,
          format: req.expectJson ? 'json' : undefined,
          messages: [
            { role: 'system', content: req.systemInstruction },
            { role: 'user', content: req.prompt },
          ],
          options: {
            temperature: req.expectJson ? 0.2 : 0.65,
            num_predict: Math.max(64, Math.min(1800, Math.floor(req.maxOutputTokens ?? (req.expectJson ? 700 : 900)))),
          },
        }),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Free local AI is unavailable at ${baseUrl}. Start Ollama and install ${model}. (${detail})`);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Ollama request failed (${response.status}): ${detail || response.statusText}`);
    }
    const payload = await readOllamaChatStream(response);
    const text = payload.text;
    if (!text) throw new Error(`Local model "${model}" returned an empty response.`);
    return {
      provider: 'ollama',
      model,
      text,
      parsedJson: tryExtractJson(text),
      groundedSources: [],
      promptTokens: payload.promptTokens,
      outputTokens: payload.outputTokens,
      latencyMs: Date.now() - started,
      costUsd: 0,
      rateCardFound: true,
    };
  }

  if (req.provider !== 'google_gemini') {
    throw new Error(
      `AI provider "${req.provider}" is not configured on this server. Select "ollama" for free local inference or configure a cloud provider.`
    );
  }

  const ai = createGeminiClient();
  const started = Date.now();
  const model = req.model || 'gemini-3.5-flash-lite';

  const config: Record<string, unknown> = {
    systemInstruction: req.systemInstruction,
  };

  if (req.useGoogleSearch) {
    config.tools = [{ googleSearch: {} }];
  } else if (req.expectJson) {
    config.responseMimeType = 'application/json';
    config.responseSchema = {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING, description: 'Concise executive summary of completed work.' },
        deliverable: {
          type: Type.STRING,
          description: 'Primary structured deliverable text, caption, strategy, or report.',
        },
        recommendations: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Actionable next steps or findings.',
        },
        issues: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Risks, QA issues, or missing prerequisites.',
        },
        requiresHumanApproval: {
          type: Type.BOOLEAN,
          description: 'Whether a human must review before external side effects.',
        },
      },
      required: ['summary', 'deliverable', 'recommendations', 'issues', 'requiresHumanApproval'],
    };
  }

  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: req.prompt,
      config,
    });
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    if (rawMsg.includes('API_KEY_INVALID') || rawMsg.includes('PERMISSION_DENIED') || rawMsg.includes('403')) {
      throw new Error(
        `Gemini API key rejected (${rawMsg}). Check your free GEMINI_API_KEY in Settings > Secrets.`
      );
    }
    if (rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('429')) {
      throw new Error(
        `Gemini free-tier quota or rate limit reached for "${model}" (${rawMsg}). Retry shortly or switch the agent to "gemini-3.1-flash-lite" for higher free-tier throughput.`
      );
    }
    throw err;
  }

  const latencyMs = Date.now() - started;
  const text = (response.text ?? '').trim();
  if (!text) {
    throw new Error(`Model "${model}" returned an empty response.`);
  }

  const groundedSources: GroundedSourceLink[] = [];
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (Array.isArray(chunks)) {
    for (const chunk of chunks) {
      const web = (chunk as { web?: { uri?: string; title?: string } }).web;
      if (web?.uri) {
        groundedSources.push({
          title: web.title || web.uri,
          url: web.uri,
        });
      }
    }
  }

  const promptTokens = response.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
  const { costUsd, rateCardFound } = calculateAiUsageCostUsd(model, promptTokens, outputTokens);

  return {
    provider: req.provider,
    model,
    text,
    parsedJson: tryExtractJson(text),
    groundedSources,
    promptTokens,
    outputTokens,
    latencyMs,
    costUsd,
    rateCardFound,
  };
}

export async function generateRealImage(
  req: ImageGenerationRequest
): Promise<ImageGenerationResult> {
  if (req.provider !== 'google_gemini' && req.provider !== 'gemini_image') {
    throw new Error(
      `Image provider "${req.provider}" is not configured. Configure credentials before generating images.`
    );
  }
  const ai = createGeminiClient();
  const model = req.model || 'gemini-3.1-flash-lite-image';
  const started = Date.now();

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [{ text: req.prompt }],
    },
    config: {
      imageConfig: {
        aspectRatio: req.aspectRatio,
      },
    },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
      const mimeType = part.inlineData.mimeType || 'image/png';
      const promptTokens = response.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
      const { costUsd } = calculateAiUsageCostUsd(model, promptTokens, outputTokens);
      return {
        provider: 'gemini_image',
        model,
        mimeType,
        imageBuffer,
        latencyMs: Date.now() - started,
        costUsd,
      };
    }
  }

  throw new Error(
    `Image generation model "${model}" completed without returning image bytes. Verify billing/paid key eligibility for image models.`
  );
}

export async function dispatchRealVideoGeneration(
  req: VideoGenerationRequest
): Promise<never> {
  if (!process.env.RUNWAY_API_KEY || process.env.RUNWAY_API_KEY.trim() === '') {
    throw new Error(
      `Video generation provider "${req.provider}" is not configured (missing RUNWAY_API_KEY). Capability is unavailable—no placeholder video was created.`
    );
  }
  throw new Error(
    'External video generation API dispatch requires verified webhook endpoint configuration and active provider quota.'
  );
}

export async function verifyGeminiConnection(): Promise<{
  ok: boolean;
  latencyMs: number;
  model: string;
  error?: string;
}> {
  if (!isGeminiConfigured()) {
    return {
      ok: false,
      latencyMs: 0,
      model: 'gemini-3.5-flash-lite',
      error: 'GEMINI_API_KEY is not configured in server environment secrets.',
    };
  }
  const started = Date.now();
  try {
    const ai = createGeminiClient();
    const res = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: 'Respond with the single word OK.',
    });
    const text = (res.text ?? '').trim();
    return {
      ok: text.length > 0,
      latencyMs: Date.now() - started,
      model: 'gemini-3.5-flash-lite',
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      model: 'gemini-3.5-flash-lite',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
