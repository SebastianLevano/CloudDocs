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
