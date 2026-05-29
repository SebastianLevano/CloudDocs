/**
 * @clouddocs/shared-types
 *
 * Single source of truth for DTOs shared between the Angular frontend and the
 * Lambda backend. Schemas are defined with zod so the same definition serves
 * both runtime validation (backend) and compile-time inference (frontend).
 */
export * from './schemas/health';
export * from './schemas/auth';
export * from './schemas/orgs';
export * from './schemas/documents';
export * from './schemas/analysis';
export * from './schemas/chat';
export * from './schemas/folders';
export * from './schemas/shares';
export * from './schemas/comments';
export * from './schemas/billing';
export * from './schemas/notifications';
export * from './schemas/activity';
