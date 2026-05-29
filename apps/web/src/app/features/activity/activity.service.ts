import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import type { ActivityListResponse } from '@clouddocs/shared-types';

import { API_BASE_URL } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';

@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly auth = inject(AuthService);

  private orgHeaders(): HttpHeaders {
    const orgId = this.auth.activeOrg()?.id;
    return orgId ? new HttpHeaders({ 'X-Org-Id': orgId }) : new HttpHeaders();
  }

  list(
    opts: {
      action?: string;
      targetType?: string;
      from?: string;
      to?: string;
      limit?: number;
      cursor?: string;
    } = {},
  ): Observable<ActivityListResponse> {
    let params = new HttpParams();
    if (opts.action) params = params.set('action', opts.action);
    if (opts.targetType) params = params.set('targetType', opts.targetType);
    if (opts.from) params = params.set('from', opts.from);
    if (opts.to) params = params.set('to', opts.to);
    if (opts.limit) params = params.set('limit', String(opts.limit));
    if (opts.cursor) params = params.set('cursor', opts.cursor);
    return this.http.get<ActivityListResponse>(`${this.baseUrl}/v1/activity`, {
      headers: this.orgHeaders(),
      params,
    });
  }

  csvUrl(opts: { action?: string; from?: string; to?: string } = {}): string {
    let params = new HttpParams().set('format', 'csv');
    if (opts.action) params = params.set('action', opts.action);
    if (opts.from) params = params.set('from', opts.from);
    if (opts.to) params = params.set('to', opts.to);
    // The auth interceptor won't fire for window.open, so we build a URL here
    // for display; actual export is done via the HTTP client with auth headers.
    return `${this.baseUrl}/v1/activity?${params.toString()}`;
  }

  exportCsv(opts: { action?: string; from?: string; to?: string } = {}): Observable<Blob> {
    let params = new HttpParams().set('format', 'csv');
    if (opts.action) params = params.set('action', opts.action);
    if (opts.from) params = params.set('from', opts.from);
    if (opts.to) params = params.set('to', opts.to);
    return this.http.get(`${this.baseUrl}/v1/activity`, {
      headers: this.orgHeaders(),
      params,
      responseType: 'blob',
    });
  }
}
