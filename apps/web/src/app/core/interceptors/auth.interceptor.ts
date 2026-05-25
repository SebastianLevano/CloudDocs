import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';

import { API_BASE_URL } from '../api/api.config';
import { AuthService } from '../auth/auth.service';

/**
 * For requests to our own API:
 *  - attaches `Authorization: Bearer <accessToken>` when we have one;
 *  - sets `withCredentials` so the HttpOnly refresh cookie rides along on the
 *    auth endpoints (`/v1/auth/refresh`, `/v1/auth/logout`);
 *  - sends the `X-CDX-Client` marker header that the cookie endpoints require
 *    as CSRF defense (see apps/api middlewares/with-csrf.ts).
 *
 * Third-party requests are left untouched so we never leak the token off-site.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const baseUrl = inject(API_BASE_URL);
  if (!req.url.startsWith(baseUrl)) return next(req);

  let headers = req.headers.set('X-CDX-Client', 'web');
  const token = inject(AuthService).accessToken;
  if (token) headers = headers.set('Authorization', `Bearer ${token}`);

  return next(req.clone({ headers, withCredentials: true }));
};
