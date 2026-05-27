import { z } from 'zod';

/** A turn in the conversation. `system` is internal; the API only accepts these two. */
export const ChatRoleSchema = z.enum(['user', 'assistant']);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

export const ChatMessageSchema = z.object({
  role: ChatRoleSchema,
  content: z.string().min(1).max(4000),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/**
 * A chat request is stateless: the client sends the recent conversation. The
 * last message must be from the user (the one we answer). `documentId` scopes
 * retrieval to a single document ("chat with this document").
 */
export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(20),
  documentId: z.uuid().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/** A source chunk the answer drew on, for "cited from" UI. */
export const CitationSchema = z.object({
  documentId: z.uuid(),
  filename: z.string(),
  chunkIndex: z.number().int().nonnegative(),
  snippet: z.string(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const ChatResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(CitationSchema),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
