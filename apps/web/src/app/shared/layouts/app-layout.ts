import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import type { Notification } from '@clouddocs/shared-types';

import { AuthService } from '../../core/auth/auth.service';
import { NotificationsService } from '../../features/notifications/notifications.service';

/**
 * Authenticated app shell: sidebar + topbar (with notification bell) + routed outlet.
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
          <div class="relative flex items-center gap-3">
            <!-- Notification bell -->
            <div class="relative">
              <button
                type="button"
                class="relative rounded-md p-1.5 text-text-muted transition hover:bg-surface-2 hover:text-text"
                (click)="toggleNotifications()"
                aria-label="Notifications"
                data-testid="notification-bell"
              >
                <svg
                  class="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                  />
                </svg>
                @if (unreadCount() > 0) {
                  <span
                    class="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[9px] font-bold text-white"
                    data-testid="unread-badge"
                    >{{ unreadCount() > 9 ? '9+' : unreadCount() }}</span
                  >
                }
              </button>

              <!-- Notifications dropdown -->
              @if (notifOpen()) {
                <div
                  class="absolute right-0 top-10 z-50 w-80 rounded-xl border border-border bg-surface-1 shadow-lg"
                  data-testid="notification-dropdown"
                >
                  <div class="flex items-center justify-between border-b border-border px-4 py-3">
                    <span class="text-sm font-semibold text-text">Notifications</span>
                    @if (unreadCount() > 0) {
                      <button
                        type="button"
                        class="text-xs text-brand-400 hover:text-brand-300"
                        (click)="markAllRead()"
                      >
                        Mark all read
                      </button>
                    }
                  </div>

                  <ul class="max-h-72 overflow-y-auto">
                    @if (notifications().length === 0) {
                      <li class="px-4 py-6 text-center text-xs text-text-dim">
                        No notifications yet.
                      </li>
                    }
                    @for (n of notifications(); track n.id) {
                      <li
                        class="flex items-start gap-3 border-b border-border/60 px-4 py-3 transition hover:bg-surface-2"
                        [class.opacity-60]="n.readAt !== null"
                      >
                        <div
                          class="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                          [class.bg-brand-500]="n.readAt === null"
                          [class.bg-transparent]="n.readAt !== null"
                        ></div>
                        <div class="min-w-0 flex-1">
                          <p class="text-xs font-medium text-text">{{ n.title }}</p>
                          @if (n.body) {
                            <p class="mt-0.5 text-xs text-text-muted">{{ n.body }}</p>
                          }
                          <p class="mt-1 text-[10px] text-text-dim">
                            {{ formatDate(n.createdAt) }}
                          </p>
                        </div>
                        @if (n.readAt === null) {
                          <button
                            type="button"
                            class="shrink-0 text-[10px] text-text-dim hover:text-text"
                            (click)="markRead(n.id)"
                          >
                            ✓
                          </button>
                        }
                      </li>
                    }
                  </ul>
                </div>
              }
            </div>

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
export class AppLayout implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifService = inject(NotificationsService);

  protected readonly user = this.auth.user;
  protected readonly activeOrg = this.auth.activeOrg;

  protected readonly notifOpen = signal(false);
  protected readonly notifications = signal<Notification[]>([]);
  protected readonly unreadCount = signal(0);

  protected readonly nav = [
    { icon: '🏠', label: 'Home', link: '/dashboard', disabled: false },
    { icon: '📄', label: 'Documents', link: '/documents', disabled: false },
    { icon: '🔍', label: 'Search', link: '/documents', disabled: false },
    { icon: '💬', label: 'Chat', link: '/chat', disabled: false },
    { icon: '📋', label: 'Activity', link: '/activity', disabled: false },
    { icon: '💳', label: 'Billing', link: '/settings/billing', disabled: false },
  ];

  ngOnInit(): void {
    this.loadNotifications();
  }

  private loadNotifications(): void {
    this.notifService.list().subscribe({
      next: (res) => {
        this.notifications.set(res.notifications);
        this.unreadCount.set(res.unreadCount);
      },
    });
  }

  protected toggleNotifications(): void {
    const wasOpen = this.notifOpen();
    this.notifOpen.set(!wasOpen);
    if (!wasOpen) this.loadNotifications();
  }

  protected markRead(id: string): void {
    this.notifService.markRead(id).subscribe({
      next: () => {
        this.notifications.update((list) =>
          list.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
        );
        this.unreadCount.update((c) => Math.max(0, c - 1));
      },
    });
  }

  protected markAllRead(): void {
    this.notifService.markAllRead().subscribe({
      next: () => {
        this.notifications.update((list) =>
          list.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
        );
        this.unreadCount.set(0);
      },
    });
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected logout(): void {
    this.auth.logout().subscribe(() => this.router.navigateByUrl('/auth/login'));
  }
}
