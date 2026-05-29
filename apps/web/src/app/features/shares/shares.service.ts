import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

import type { CreateShareDto, ShareListResponse } from '@clouddocs/shared-types';

import { API_BASE_URL } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';

@Injectable({ providedIn: 'root' })
export class SharesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly auth = inject(AuthService);

  private orgHeaders(): HttpHeaders {
    const orgId = this.auth.activeOrg()?.id;
    return orgId ? new HttpHeaders({ 'X-Org-Id': orgId }) : new HttpHeaders();
  }

  create(documentId: string, dto: CreateShareDto): Observable<ShareListResponse> {
    return this.http.post<ShareListResponse>(
      `${this.baseUrl}/v1/documents/${documentId}/shares`,
      dto,
      { headers: this.orgHeaders() },
    );
  }

  delete(documentId: string, shareId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/v1/documents/${documentId}/shares/${shareId}`, {
      headers: this.orgHeaders(),
    });
  }
}
