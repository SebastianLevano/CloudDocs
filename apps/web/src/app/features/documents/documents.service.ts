import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

import type {
  CreateDocumentDto,
  CreateDocumentResponse,
  Document,
  DocumentListResponse,
  DownloadResponse,
} from '@clouddocs/shared-types';

import { API_BASE_URL } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Thin API client for the document endpoints. Every call carries the active
 * org via the `X-Org-Id` header (resolved server-side by `withActiveOrg`); the
 * auth interceptor adds the bearer token + credentials.
 */
@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly auth = inject(AuthService);

  private get url(): string {
    return `${this.baseUrl}/v1/documents`;
  }

  /** Header carrying the currently selected org. */
  private orgHeaders(): HttpHeaders {
    const orgId = this.auth.activeOrg()?.id;
    return orgId ? new HttpHeaders({ 'X-Org-Id': orgId }) : new HttpHeaders();
  }

  /** Register a document, returning the row + presigned PUT to upload to. */
  create(dto: CreateDocumentDto): Observable<CreateDocumentResponse> {
    return this.http.post<CreateDocumentResponse>(this.url, dto, { headers: this.orgHeaders() });
  }

  /** Flip a document to `uploaded` after the S3 PUT succeeds. */
  complete(id: string): Observable<Document> {
    return this.http.post<Document>(
      `${this.url}/${id}/complete`,
      {},
      { headers: this.orgHeaders() },
    );
  }

  list(cursor?: string, limit = 20): Observable<DocumentListResponse> {
    const params: Record<string, string> = { limit: String(limit) };
    if (cursor) params['cursor'] = cursor;
    return this.http.get<DocumentListResponse>(this.url, { headers: this.orgHeaders(), params });
  }

  download(id: string): Observable<DownloadResponse> {
    return this.http.get<DownloadResponse>(`${this.url}/${id}/download`, {
      headers: this.orgHeaders(),
    });
  }
}
