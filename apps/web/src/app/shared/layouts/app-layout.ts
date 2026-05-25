import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';

/**
 * Authenticated app shell: collapsible-ready sidebar + topbar + routed outlet.
 * Most nav items are placeholders until their features land in later phases.
 */
@Component({
  selector: 'app-app-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex min-h-screen">
      <!-- Sidebar -->
      <aside class="hidden w-60 shrink-0 border-r border-border bg-surface-1 md:flex md:flex-col">
        <div class="flex h-14 items-center gap-2 border-b border-border px-5">
          <div
            class="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-brand-400 to-brand-700"
          >
            <span class="text-xs font-bold text-white">C</span>
          </div>
          <span class="text-sm font-semibold tracking-tight">CloudDocs AI</span>
        </div>

        <nav class="flex flex-1 flex-col gap-1 p-3 text-sm">
          @for (item of nav; track item.label) {
            <a
              [routerLink]="item.link"
              routerLinkActive="bg-surface-3 text-text"
              [routerLinkActiveOptions]="{ exact: true }"
              class="flex items-center gap-3 rounded-md px-3 py-2 text-text-muted transition hover:bg-surface-2 hover:text-text"
              [class.pointer-events-none]="item.disabled"
              [class.opacity-40]="item.disabled"
            >
              <span class="text-base">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
              @if (item.disabled) {
                <span class="ml-auto text-[10px] uppercase tracking-wider text-text-dim">soon</span>
              }
            </a>
          }
        </nav>
      </aside>

      <!-- Main column -->
      <div class="flex min-w-0 flex-1 flex-col">
        <header
          class="flex h-14 items-center justify-between border-b border-border bg-surface-1/60 px-6 backdrop-blur"
        >
          <span class="text-sm font-medium text-text-muted">{{ activeOrg()?.name ?? '—' }}</span>
          <div class="flex items-center gap-3">
            @if (user(); as u) {
              <span class="text-sm text-text-muted">{{ u.displayName || u.email }}</span>
              <div
                class="grid h-8 w-8 place-items-center rounded-full border border-border-strong bg-surface-3 text-xs font-semibold uppercase text-text"
              >
                {{ (u.displayName || u.email).charAt(0) }}
              </div>
            }
            <button
              type="button"
              (click)="logout()"
              class="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition hover:border-border-strong hover:text-text"
            >
              Sign out
            </button>
          </div>
        </header>

        <main class="flex-1 overflow-auto px-6 py-8">
          <div class="mx-auto max-w-7xl">
            <router-outlet />
          </div>
        </main>
      </div>
    </div>
  `,
})
export class AppLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly user = this.auth.user;
  protected readonly activeOrg = this.auth.activeOrg;

  protected readonly nav = [
    { icon: '🏠', label: 'Home', link: '/dashboard', disabled: false },
    { icon: '📄', label: 'Documents', link: '/documents', disabled: false },
    { icon: '🔍', label: 'Search', link: '/dashboard', disabled: true },
    { icon: '💬', label: 'Chat', link: '/dashboard', disabled: true },
    { icon: '⚙️', label: 'Settings', link: '/dashboard', disabled: true },
  ];

  protected logout(): void {
    this.auth.logout().subscribe(() => this.router.navigateByUrl('/auth/login'));
  }
}
