import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Base URL for the CloudDocs API (no trailing slash), injectable so tests can
 * override it without touching `environment.ts`. Auth endpoints live under
 * `${API_BASE_URL}/v1/auth/*`.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiBaseUrl,
});
