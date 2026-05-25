import { Route } from '@angular/router';

import { AuthLayout } from '../../shared/layouts/auth-layout';
import { guestGuard } from '../../core/guards/guest.guard';

export const authRoutes: Route[] = [
  {
    path: '',
    component: AuthLayout,
    canActivate: [guestGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'login' },
      {
        path: 'login',
        title: 'Sign in · CloudDocs AI',
        loadComponent: () => import('./login.page').then((m) => m.LoginPage),
      },
      {
        path: 'register',
        title: 'Create account · CloudDocs AI',
        loadComponent: () => import('./register.page').then((m) => m.RegisterPage),
      },
    ],
  },
];
