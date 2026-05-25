import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, switchMap, throwError } from 'rxjs';

import { API_BASE_URL } from '../api/api.config';
import { AuthService } from '../auth/auth.service';

/** Auth endpoints must not trigger the refresh-and-retry loop themselves. */
const AUTH_PATHS = ['/v1/auth/login', '/v1/auth/register', '/v1/auth/refresh', '/v1/auth/logout'];

const isAuthEndpoint = (url: string): boolean => AUTH_PATHS.some((p) => url.includes(p));

/**
 * On a 401 from a protected API call, transparently refreshes the access token
 * (using the refresh cookie) and replays the original request once. If the
 * refresh itself fails the session is cleared and the error propagates so a
 * guard/route can send the user to login.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const baseUrl = inject(API_BASE_URL);
  const auth = inject(AuthService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const isOurApi = req.url.startsWith(baseUrl);
      const refreshable = isOurApi && error.status === 401 && !isAuthEndpoint(req.url);
      if (!refreshable) return throwError(() => error);

      return auth.refresh().pipe(
        switchMap((session) => {
          const retried = req.clone({
            headers: req.headers.set('Authorization', `Bearer ${session.tokens.accessToken}`),
            withCredentials: true,
          });
          return next(retried);
        }),
        catchError(() => throwError(() => error)),
      );
    }),
  );
};
