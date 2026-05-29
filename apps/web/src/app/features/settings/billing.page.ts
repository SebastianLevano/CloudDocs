import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';

import type { Usage } from '@clouddocs/shared-types';

import { apiErrorMessage } from '../../shared/utils/api-error';
import { BillingService } from './billing.service';

@Component({
  selector: 'app-billing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight text-text">Billing</h1>
      <p class="mt-1 text-sm text-text-muted">Manage your plan and usage.</p>
    </header>

    @if (upgradeSuccess()) {
      <div
        class="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400"
      >
        🎉 You've successfully upgraded to Pro! Your limits have been updated.
      </div>
    }

    @if (loading()) {
      <p class="text-sm text-text-muted">Loading…</p>
    } @else if (error()) {
      <p class="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
        {{ error() }}
      </p>
    } @else if (usage(); as u) {
      <!-- Plan badge -->
      <section class="rounded-xl border border-border bg-surface-1 p-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-base font-semibold text-text">Current plan</h2>
            <div class="mt-2 flex items-center gap-2">
              <span
                class="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider"
                [class.bg-brand-500]="u.plan === 'pro'"
                [class.text-white]="u.plan === 'pro'"
                [class.bg-surface-3]="u.plan === 'free'"
                [class.text-text-muted]="u.plan === 'free'"
                >{{ u.plan }}</span
              >
              <span class="text-sm text-text-muted">
                @if (u.plan === 'free') {
                  Free forever with limited usage
                } @else {
                  Full access · renews {{ formatDate(u) }}
                }
              </span>
            </div>
          </div>

          @if (u.plan === 'free') {
            <button
              type="button"
              class="shrink-0 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
              [disabled]="redirecting()"
              (click)="startCheckout()"
            >
              {{ redirecting() ? 'Redirecting…' : 'Upgrade to Pro' }}
            </button>
          } @else {
            <button
              type="button"
              class="shrink-0 rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-text transition hover:bg-surface-3 disabled:opacity-50"
              [disabled]="redirecting()"
              (click)="openPortal()"
            >
              {{ redirecting() ? 'Redirecting…' : 'Manage subscription' }}
            </button>
          }
        </div>
        @if (actionError()) {
          <p class="mt-2 text-xs text-danger">{{ actionError() }}</p>
        }
      </section>

      <!-- Usage meters -->
      <section class="mt-6 rounded-xl border border-border bg-surface-1 p-6">
        <h2 class="mb-4 text-base font-semibold text-text">
          This month's usage
          <span class="ml-2 text-xs font-normal text-text-dim">{{ u.period }}</span>
        </h2>
        <div class="space-y-5">
          <div data-testid="usage-docs">
            <div class="mb-1 flex items-baseline justify-between text-sm">
              <span class="text-text-muted">Documents uploaded</span>
              <span class="font-medium text-text"
                >{{ u.docsUploaded }} / {{ u.limits.docsPerMonth }}</span
              >
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-surface-3">
              <div
                class="h-full rounded-full transition-all"
                [class.bg-brand-500]="docPct() < 85"
                [class.bg-amber-500]="docPct() >= 85 && docPct() < 100"
                [class.bg-danger]="docPct() >= 100"
                [style.width.%]="docPct()"
              ></div>
            </div>
          </div>

          <div data-testid="usage-ai">
            <div class="mb-1 flex items-baseline justify-between text-sm">
              <span class="text-text-muted">AI analyses</span>
              <span class="font-medium text-text"
                >{{ u.aiAnalyses }} / {{ u.limits.aiAnalysesPerMonth }}</span
              >
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-surface-3">
              <div
                class="h-full rounded-full transition-all"
                [class.bg-brand-500]="aiPct() < 85"
                [class.bg-amber-500]="aiPct() >= 85 && aiPct() < 100"
                [class.bg-danger]="aiPct() >= 100"
                [style.width.%]="aiPct()"
              ></div>
            </div>
          </div>

          <div data-testid="usage-storage">
            <div class="mb-1 flex items-baseline justify-between text-sm">
              <span class="text-text-muted">Storage</span>
              <span class="font-medium text-text"
                >{{ formatBytes(u.storageBytes) }} / {{ formatBytes(u.limits.storageBytes) }}</span
              >
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-surface-3">
              <div
                class="h-full rounded-full bg-brand-500 transition-all"
                [style.width.%]="storagePct()"
              ></div>
            </div>
          </div>
        </div>
      </section>

      <!-- Pro features teaser (only shown to free users) -->
      @if (u.plan === 'free') {
        <section class="mt-6 rounded-xl border border-brand-500/20 bg-brand-500/5 p-6">
          <h2 class="text-base font-semibold text-text">Get more with Pro</h2>
          <ul class="mt-3 space-y-2 text-sm text-text-muted">
            <li>✓ 500 document uploads/month</li>
            <li>✓ 5,000 AI analyses/month</li>
            <li>✓ 5 GB storage</li>
            <li>✓ Priority processing queue</li>
          </ul>
          <button
            type="button"
            class="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
            [disabled]="redirecting()"
            (click)="startCheckout()"
          >
            {{ redirecting() ? 'Redirecting…' : 'Upgrade now' }}
          </button>
        </section>
      }
    }
  `,
})
export class BillingPage implements OnInit {
  private readonly billingService = inject(BillingService);

  /** Set by router when ?upgraded=1 query param is present. */
  readonly upgraded = input<string | null>(null);

  protected readonly usage = signal<Usage | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly redirecting = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly upgradeSuccess = computed(() => this.upgraded() === '1');

  protected readonly docPct = computed(() => {
    const u = this.usage();
    if (!u) return 0;
    return Math.min(100, Math.round((u.docsUploaded / u.limits.docsPerMonth) * 100));
  });

  protected readonly aiPct = computed(() => {
    const u = this.usage();
    if (!u) return 0;
    return Math.min(100, Math.round((u.aiAnalyses / u.limits.aiAnalysesPerMonth) * 100));
  });

  protected readonly storagePct = computed(() => {
    const u = this.usage();
    if (!u) return 0;
    return Math.min(100, Math.round((u.storageBytes / u.limits.storageBytes) * 100));
  });

  ngOnInit(): void {
    this.billingService.getUsage().subscribe({
      next: (u) => {
        this.usage.set(u);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorMessage(err, 'Could not load usage.'));
        this.loading.set(false);
      },
    });
  }

  protected startCheckout(): void {
    this.redirecting.set(true);
    this.actionError.set(null);
    this.billingService.createCheckout().subscribe({
      next: (res) => {
        window.location.href = res.url;
      },
      error: (err) => {
        this.actionError.set(apiErrorMessage(err, 'Could not start checkout.'));
        this.redirecting.set(false);
      },
    });
  }

  protected openPortal(): void {
    this.redirecting.set(true);
    this.actionError.set(null);
    this.billingService.createPortal().subscribe({
      next: (res) => {
        window.location.href = res.url;
      },
      error: (err) => {
        this.actionError.set(apiErrorMessage(err, 'Could not open billing portal.'));
        this.redirecting.set(false);
      },
    });
  }

  protected formatDate(u: Usage): string {
    return u.period;
  }

  protected formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}
