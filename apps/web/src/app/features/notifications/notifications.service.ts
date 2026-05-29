import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

import type { NotificationListResponse } from '@clouddocs/shared-types';

import { API_BASE_URL } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly auth = inject(AuthService);

  private orgHeaders(): HttpHeaders {
    const orgId = this.auth.activeOrg()?.id;
    return orgId ? new HttpHeaders({ 'X-Org-Id': orgId }) : new HttpHeaders();
  }

  list(): Observable<NotificationListResponse> {
    return this.http.get<NotificationListResponse>(`${this.baseUrl}/v1/notifications`, {
      headers: this.orgHeaders(),
    });
  }

  markRead(id: string): Observable<void> {
    return this.http.post<void>(
      `${this.baseUrl}/v1/notifications/${id}/read`,
      {},
      { headers: this.orgHeaders() },
    );
  }

  markAllRead(): Observable<void> {
    return this.http.post<void>(
      `${this.baseUrl}/v1/notifications/read-all`,
      {},
      { headers: this.orgHeaders() },
    );
  }
}
