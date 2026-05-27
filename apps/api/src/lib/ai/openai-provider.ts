/**
 * OpenAI implementation of {@link AiProvider} using gpt-4o-mini with structured
 * (JSON-schema) outputs. We pass an explicit JSON schema to `response_format`
 * and validate the result with our own zod schema, rather than the SDK's
 * `zodResponseFormat` helper, to stay decoupled from its Zod-version coupling.
 */
import OpenAI from 'openai';

import {
  ClassifyResultSchema,
  DOCUMENT_CATEGORIES,
  SummaryResultSchema,
  type ClassifyResult,
  type SummaryResult,
} from '@clouddocs/shared-types';

import { AppError } from '../errors';
import type { AiProvider, AiResult, AiUsage, ChatTurn, EmbedResult } from './provider';
import { CHAT_PROMPT_VERSION } from './prompts/chat/v1';
import { SUMMARY_PROMPT_VERSION, SUMMARY_SYSTEM, summaryUserPrompt } from './prompts/summary/v1';
import {
  CLASSIFY_PROMPT_VERSION,
  CLASSIFY_SYSTEM,
  classifyUserPrompt,
} from './prompts/classify/v1';

const MODEL = 'gpt-4o-mini';
const EMBEDDING_MODEL = 'text-embedding-3-small';
/** Bound input cost: ~6-8K tokens. gpt-4o-mini handles 128K but we don't need it. */
const MAX_INPUT_CHARS = 24_000;
/** gpt-4o-mini pricing (USD per token), 2025 rates. */
const INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 0.6 / 1_000_000;
/** text-embedding-3-small pricing (USD per token). */
const EMBED_USD_PER_TOKEN = 0.02 / 1_000_000;

const SUMMARY_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    bullets: { type: 'array', items: { type: 'string' } },
    language: { type: 'string', description: 'ISO 639-1 code' },
  },
  required: ['summary', 'bullets', 'language'],
};

const CLASSIFY_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: { type: 'string', enum: [...DOCUMENT_CATEGORIES] },
    confidence: { type: 'number' },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['category', 'confidence', 'tags'],
};

export class OpenAiProvider implements AiProvider {
  private readonly client: OpenAI;

  constructor(apiKey = process.env['OPENAI_API_KEY']) {
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set.');
    this.client = new OpenAI({ apiKey });
  }

  async summarize(text: string): Promise<AiResult<SummaryResult>> {
    const { parsed, usage } = await this.complete(
      SUMMARY_SYSTEM,
      summaryUserPrompt(truncate(text)),
      'summary',
      SUMMARY_JSON_SCHEMA,
      SUMMARY_PROMPT_VERSION,
    );
    const data = SummaryResultSchema.parse(parsed);
    return { data, usage };
  }

  async classify(text: string): Promise<AiResult<ClassifyResult>> {
    const { parsed, usage } = await this.complete(
      CLASSIFY_SYSTEM,
      classifyUserPrompt(truncate(text)),
      'classification',
      CLASSIFY_JSON_SCHEMA,
      CLASSIFY_PROMPT_VERSION,
    );
    const data = ClassifyResultSchema.parse(parsed);
    return { data, usage };
  }

  async embed(texts: string[]): Promise<EmbedResult> {
    if (texts.length === 0) {
      return { vectors: [], usage: { model: EMBEDDING_MODEL, promptVersion: 'embed.v1' } };
    }
    const response = await this.client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts.map((t) => t.slice(0, MAX_INPUT_CHARS)),
    });
    // The API returns items with an `index`; sort to guarantee input order.
    const vectors = [...response.data]
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding as number[]);
    const inputTokens = response.usage?.prompt_tokens;
    return {
      vectors,
      usage: {
        model: EMBEDDING_MODEL,
        promptVersion: 'embed.v1',
        ...(inputTokens != null ? { inputTokens } : {}),
        ...(inputTokens != null ? { costUsd: inputTokens * EMBED_USD_PER_TOKEN } : {}),
      },
    };
  }

  async chat(turns: ChatTurn[]): Promise<AiResult<string>> {
    const completion = await this.client.chat.completions.create({
      model: MODEL,
      messages: turns.map((t) => ({ role: t.role, content: t.content })),
    });
    const answer = completion.choices[0]?.message.content;
    if (!answer) throw new AppError('ai_error', 'OpenAI returned no content.', 502);
    const inputTokens = completion.usage?.prompt_tokens;
    const outputTokens = completion.usage?.completion_tokens;
    return {
      data: answer,
      usage: {
        model: MODEL,
        promptVersion: CHAT_PROMPT_VERSION,
        ...(inputTokens != null ? { inputTokens } : {}),
        ...(outputTokens != null ? { outputTokens } : {}),
        costUsd: estimateCost(inputTokens, outputTokens),
      },
    };
  }

  private async complete(
    system: string,
    user: string,
    schemaName: string,
    schema: Record<string, unknown>,
    promptVersion: string,
  ): Promise<{ parsed: unknown; usage: AiUsage }> {
    const completion = await this.client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, strict: true, schema },
      },
    });

    const content = completion.choices[0]?.message.content;
    if (!content) throw new AppError('ai_error', 'OpenAI returned no content.', 502);

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new AppError('ai_error', 'OpenAI returned non-JSON content.', 502);
    }

    const inputTokens = completion.usage?.prompt_tokens;
    const outputTokens = completion.usage?.completion_tokens;
    return {
      parsed,
      usage: {
        model: MODEL,
        promptVersion,
        inputTokens,
        outputTokens,
        costUsd: estimateCost(inputTokens, outputTokens),
      },
    };
  }
}

function truncate(text: string): string {
  return text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
}

function estimateCost(inputTokens?: number, outputTokens?: number): number | undefined {
  if (inputTokens == null || outputTokens == null) return undefined;
  return inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN;
}
