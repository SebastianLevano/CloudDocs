import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

import type { Comment, CommentListResponse, CreateCommentDto } from '@clouddocs/shared-types';

import { API_BASE_URL } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';

@Injectable({ providedIn: 'root' })
export class CommentsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly auth = inject(AuthService);

  private orgHeaders(): HttpHeaders {
    const orgId = this.auth.activeOrg()?.id;
    return orgId ? new HttpHeaders({ 'X-Org-Id': orgId }) : new HttpHeaders();
  }

  list(documentId: string): Observable<CommentListResponse> {
    return this.http.get<CommentListResponse>(
      `${this.baseUrl}/v1/documents/${documentId}/comments`,
      { headers: this.orgHeaders() },
    );
  }

  create(documentId: string, dto: CreateCommentDto): Observable<Comment> {
    return this.http.post<Comment>(`${this.baseUrl}/v1/documents/${documentId}/comments`, dto, {
      headers: this.orgHeaders(),
    });
  }

  delete(documentId: string, commentId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/v1/documents/${documentId}/comments/${commentId}`,
      { headers: this.orgHeaders() },
    );
  }
}
