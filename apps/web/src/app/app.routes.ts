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
      {
        path: 'chat',
        title: 'Chat · CloudDocs AI',
        loadComponent: () => import('./features/chat/chat.page').then((m) => m.ChatPage),
      },
      {
        path: 'settings/billing',
        title: 'Billing · CloudDocs AI',
        loadComponent: () => import('./features/settings/billing.page').then((m) => m.BillingPage),
      },
      {
        path: 'activity',
        title: 'Activity · CloudDocs AI',
        loadComponent: () =>
          import('./features/activity/activity.page').then((m) => m.ActivityPage),
      },
    ],
  },
  {
    path: 'share/:token',
    title: 'Shared Document · CloudDocs AI',
    loadComponent: () =>
      import('./features/shares/public-share.page').then((m) => m.PublicSharePage),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
