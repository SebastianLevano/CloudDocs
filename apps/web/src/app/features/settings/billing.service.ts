import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

import type { CheckoutResponse, PortalResponse, Usage } from '@clouddocs/shared-types';

import { API_BASE_URL } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';

@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly auth = inject(AuthService);

  private orgHeaders(): HttpHeaders {
    const orgId = this.auth.activeOrg()?.id;
    return orgId ? new HttpHeaders({ 'X-Org-Id': orgId }) : new HttpHeaders();
  }

  getUsage(): Observable<Usage> {
    return this.http.get<Usage>(`${this.baseUrl}/v1/billing/usage`, { headers: this.orgHeaders() });
  }

  createCheckout(): Observable<CheckoutResponse> {
    return this.http.post<CheckoutResponse>(
      `${this.baseUrl}/v1/billing/checkout`,
      {},
      { headers: this.orgHeaders() },
    );
  }

  createPortal(): Observable<PortalResponse> {
    return this.http.post<PortalResponse>(
      `${this.baseUrl}/v1/billing/portal`,
      {},
      { headers: this.orgHeaders() },
    );
  }
}
