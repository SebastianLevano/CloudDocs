/**
 * RAG chat use case: embed the latest user message, retrieve the most relevant
 * chunks (optionally scoped to one document), ground gpt-4o-mini on them, and
 * return the answer plus the chunks it was given as citations.
 */
import type { ChatRequest, ChatResponse, Citation } from '@clouddocs/shared-types';

import { getAiProvider, type ChatTurn } from '../../lib/ai';
import { buildChatSystem } from '../../lib/ai/prompts/chat/v1';
import { EmbeddingsRepo } from '../../repositories/embeddings-repo';

const TOP_K = 6;
const SNIPPET_CHARS = 240;

export async function chatUseCase(orgId: string, req: ChatRequest): Promise<ChatResponse> {
  const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return { answer: 'Ask a question to get started.', citations: [] };

  const provider = getAiProvider();
  const { vectors } = await provider.embed([lastUser.content]);
  const chunks = await new EmbeddingsRepo(orgId).search(vectors[0] ?? [], TOP_K, req.documentId);

  const system = buildChatSystem(
    chunks.map((c) => ({ filename: c.filename, chunkText: c.chunkText })),
  );
  const turns: ChatTurn[] = [
    { role: 'system', content: system },
    ...req.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const { data: answer } = await provider.chat(turns);

  const citations: Citation[] = chunks.map((c) => ({
    documentId: c.documentId,
    filename: c.filename,
    chunkIndex: c.chunkIndex,
    snippet: c.chunkText.slice(0, SNIPPET_CHARS),
  }));

  return { answer, citations };
}
