import type { Folder } from '@clouddocs/shared-types';

import { OrgScopedRepository } from './org-scoped-repository';

export type FolderRow = {
  id: string;
  org_id: string;
  parent_id: string | null;
  name: string;
  created_by: string;
  created_at: Date;
};

function toFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    orgId: row.org_id,
    parentId: row.parent_id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

export class FoldersRepo extends OrgScopedRepository {
  async create(input: {
    name: string;
    parentId?: string | null;
    createdBy: string;
  }): Promise<Folder> {
    const rows = await this.scopedQuery<FolderRow>(
      `INSERT INTO folders (org_id, parent_id, name, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.parentId ?? null, input.name, input.createdBy],
    );
    const row = rows[0];
    if (!row) throw new Error('Insert into folders returned no row.');
    return toFolder(row);
  }

  async list(): Promise<Folder[]> {
    const rows = await this.scopedQuery<FolderRow>(
      'SELECT * FROM folders WHERE org_id = $1 ORDER BY name ASC',
    );
    return rows.map(toFolder);
  }

  async findById(id: string): Promise<Folder | undefined> {
    const rows = await this.scopedQuery<FolderRow>(
      'SELECT * FROM folders WHERE org_id = $1 AND id = $2',
      [id],
    );
    return rows[0] ? toFolder(rows[0]) : undefined;
  }

  async update(
    id: string,
    patch: { name?: string; parentId?: string | null },
  ): Promise<Folder | undefined> {
    const rows = await this.scopedQuery<FolderRow>(
      `UPDATE folders
       SET name      = COALESCE($3, name),
           parent_id = CASE WHEN $4 THEN $5::uuid ELSE parent_id END
       WHERE org_id = $1 AND id = $2
       RETURNING *`,
      [id, patch.name ?? null, patch.parentId !== undefined, patch.parentId ?? null],
    );
    return rows[0] ? toFolder(rows[0]) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.scopedQuery<{ id: string }>(
      'DELETE FROM folders WHERE org_id = $1 AND id = $2 RETURNING id',
      [id],
    );
    return rows.length > 0;
  }
}
