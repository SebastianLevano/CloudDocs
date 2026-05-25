import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { AuthService } from '../../core/auth/auth.service';

/**
 * Placeholder landing page after login. Confirms the authenticated session is
 * wired end-to-end (user + memberships from `/v1/auth/me` / the login response).
 * The real KPI dashboard arrives once documents exist (Phase 3+).
 */
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-8">
      <h1 class="text-2xl font-semibold tracking-tight text-text" data-testid="dashboard-heading">
        Welcome{{ user()?.displayName ? ', ' + user()?.displayName : '' }}
      </h1>
      <p class="mt-1 text-sm text-text-muted">
        You're signed in to
        <span class="font-medium text-text">{{ activeOrg()?.name ?? 'your workspace' }}</span
        >. Document upload lands in the next phase.
      </p>
    </header>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      @for (kpi of kpis; track kpi.label) {
        <div class="rounded-xl border border-border bg-surface-1 p-5">
          <p class="text-xs font-medium uppercase tracking-wider text-text-dim">{{ kpi.label }}</p>
          <p class="mt-2 text-2xl font-semibold text-text">{{ kpi.value }}</p>
        </div>
      }
    </div>

    <section class="mt-8 rounded-xl border border-border bg-surface-1 p-6">
      <h2 class="text-sm font-semibold text-text">Your session</h2>
      <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt class="text-text-dim">Email</dt>
          <dd class="text-text" data-testid="session-email">{{ user()?.email }}</dd>
        </div>
        <div>
          <dt class="text-text-dim">Organization</dt>
          <dd class="text-text">{{ activeOrg()?.name }} · {{ memberships()[0]?.role }}</dd>
        </div>
      </dl>
    </section>
  `,
})
export class DashboardPage {
  private readonly auth = inject(AuthService);

  protected readonly user = this.auth.user;
  protected readonly memberships = this.auth.memberships;
  protected readonly activeOrg = this.auth.activeOrg;

  protected readonly kpis = [
    { label: 'Documents', value: '0' },
    { label: 'Processed', value: '0' },
    { label: 'Storage', value: '0 MB' },
    { label: 'Analyses', value: '0' },
  ];
}
