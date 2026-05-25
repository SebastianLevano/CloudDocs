import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';

import { AuthService } from '../auth/auth.service';

/**
 * Protects app routes. By the time any route activates, the APP_INITIALIZER
 * session restore has already settled `status` to `authenticated`/`anonymous`,
 * so this is a synchronous signal read.
 */
export const authGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  return router.createUrlTree(['/auth/login'], {
    queryParams: { redirect: state.url },
  });
};
