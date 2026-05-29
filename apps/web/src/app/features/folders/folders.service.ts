import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

import type {
  CreateFolderDto,
  Folder,
  FolderListResponse,
  UpdateFolderDto,
} from '@clouddocs/shared-types';

import { API_BASE_URL } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';

@Injectable({ providedIn: 'root' })
export class FoldersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly auth = inject(AuthService);

  private get url(): string {
    return `${this.baseUrl}/v1/folders`;
  }

  private orgHeaders(): HttpHeaders {
    const orgId = this.auth.activeOrg()?.id;
    return orgId ? new HttpHeaders({ 'X-Org-Id': orgId }) : new HttpHeaders();
  }

  list(): Observable<FolderListResponse> {
    return this.http.get<FolderListResponse>(this.url, { headers: this.orgHeaders() });
  }

  create(dto: CreateFolderDto): Observable<Folder> {
    return this.http.post<Folder>(this.url, dto, { headers: this.orgHeaders() });
  }

  update(id: string, dto: UpdateFolderDto): Observable<Folder> {
    return this.http.patch<Folder>(`${this.url}/${id}`, dto, { headers: this.orgHeaders() });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`, { headers: this.orgHeaders() });
  }
}
