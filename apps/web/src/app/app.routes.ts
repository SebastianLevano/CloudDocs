import { Route } from '@angular/router';

import { AppLayout } from './shared/layouts/app-layout';
import { authGuard } from './core/guards/auth.guard';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/landing/landing.page').then((m) => m.LandingPage),
  },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.authRoutes),
  },
  {
    path: '',
    component: AppLayout,
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        title: 'Dashboard · CloudDocs AI',
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'documents',
        title: 'Documents · CloudDocs AI',
        loadComponent: () =>
          import('./features/documents/documents.page').then((m) => m.DocumentsPage),
      },
      {
        path: 'documents/:id',
        title: 'Document · CloudDocs AI',
        loadComponent: () =>
          import('./features/documents/document-detail.page').then((m) => m.DocumentDetailPage),
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
