import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

import type { ChatMessage, ChatResponse } from '@clouddocs/shared-types';

import { API_BASE_URL } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';

/** Client for the stateless RAG chat endpoint. */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly auth = inject(AuthService);

  send(messages: ChatMessage[], documentId?: string): Observable<ChatResponse> {
    const orgId = this.auth.activeOrg()?.id;
    const headers = orgId ? new HttpHeaders({ 'X-Org-Id': orgId }) : new HttpHeaders();
    const body = documentId ? { messages, documentId } : { messages };
    return this.http.post<ChatResponse>(`${this.baseUrl}/v1/chat`, body, { headers });
  }
}
