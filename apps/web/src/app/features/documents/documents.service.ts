import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

import type {
  CreateDocumentDto,
  CreateDocumentResponse,
  Document,
  DocumentDetailResponse,
  DocumentListResponse,
  DocumentStats,
  DownloadResponse,
} from '@clouddocs/shared-types';

export interface ListParams {
  cursor?: string;
  limit?: number;
  q?: string;
  status?: string;
  category?: string;
}

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

  list(opts: ListParams = {}): Observable<DocumentListResponse> {
    const params: Record<string, string> = { limit: String(opts.limit ?? 20) };
    if (opts.cursor) params['cursor'] = opts.cursor;
    if (opts.q) params['q'] = opts.q;
    if (opts.status) params['status'] = opts.status;
    if (opts.category) params['category'] = opts.category;
    return this.http.get<DocumentListResponse>(this.url, { headers: this.orgHeaders(), params });
  }

  /** Aggregate counters for the dashboard. */
  stats(): Observable<DocumentStats> {
    return this.http.get<DocumentStats>(`${this.url}/stats`, { headers: this.orgHeaders() });
  }

  /** Document detail + its AI analyses. */
  get(id: string): Observable<DocumentDetailResponse> {
    return this.http.get<DocumentDetailResponse>(`${this.url}/${id}`, {
      headers: this.orgHeaders(),
    });
  }

  download(id: string): Observable<DownloadResponse> {
    return this.http.get<DownloadResponse>(`${this.url}/${id}/download`, {
      headers: this.orgHeaders(),
    });
  }
}
