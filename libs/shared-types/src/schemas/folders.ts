import { z } from 'zod';

export const FolderSchema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  parentId: z.uuid().nullable(),
  name: z.string().min(1).max(255),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type Folder = z.infer<typeof FolderSchema>;

export const CreateFolderDtoSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.uuid().nullable().optional(),
});
export type CreateFolderDto = z.infer<typeof CreateFolderDtoSchema>;

export const UpdateFolderDtoSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.uuid().nullable().optional(),
});
export type UpdateFolderDto = z.infer<typeof UpdateFolderDtoSchema>;

export const FolderListResponseSchema = z.object({
  folders: z.array(FolderSchema),
});
export type FolderListResponse = z.infer<typeof FolderListResponseSchema>;
