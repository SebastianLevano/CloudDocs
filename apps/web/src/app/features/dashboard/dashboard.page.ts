import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Document, DocumentStats } from '@clouddocs/shared-types';

import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../shared/utils/api-error';
import { DocumentsService } from '../documents/documents.service';
import { statusBadgeClass } from '../documents/document-status';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <header class="mb-8">
      <h1 class="text-2xl font-semibold tracking-tight text-text" data-testid="dashboard-heading">
        Welcome{{ user()?.displayName ? ', ' + user()?.displayName : '' }}
      </h1>
      <p class="mt-1 text-sm text-text-muted">
        Your workspace at a glance —
        <span class="font-medium text-text">{{ activeOrg()?.name ?? 'your organization' }}</span>
      </p>
    </header>

    @if (loadError()) {
      <p class="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
        {{ loadError() }}
      </p>
    }

    <!-- KPI cards -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="kpis">
      @for (kpi of kpis(); track kpi.label) {
        <div class="rounded-xl border border-border bg-surface-1 p-5">
          <p class="text-xs font-medium uppercase tracking-wider text-text-dim">{{ kpi.label }}</p>
          <p class="mt-2 text-2xl font-semibold text-text">{{ kpi.value }}</p>
        </div>
      }
    </div>

    <div class="mt-6 grid gap-4 lg:grid-cols-2">
      <!-- Uploads sparkline -->
      <section class="rounded-xl border border-border bg-surface-1 p-5">
        <h2 class="text-sm font-semibold text-text">Uploads · last 14 days</h2>
        @if (stats(); as s) {
          <svg
            viewBox="0 0 280 60"
            preserveAspectRatio="none"
            class="mt-4 h-16 w-full"
            data-testid="sparkline"
          >
            <polyline
              [attr.points]="sparklinePoints()"
              fill="none"
              stroke="rgb(124 92 255)"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <p class="mt-2 text-xs text-text-dim">
            {{ totalUploads() }} upload{{ totalUploads() === 1 ? '' : 's' }} in the period
          </p>
        } @else {
          <p class="mt-4 text-sm text-text-muted">Loading…</p>
        }
      </section>

      <!-- Recent documents -->
      <section class="rounded-xl border border-border bg-surface-1 p-5">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-text">Recent documents</h2>
          <a routerLink="/documents" class="text-xs text-brand-300 hover:text-brand-200"
            >View all</a
          >
        </div>
        @if (recent().length === 0) {
          <p class="mt-4 text-sm text-text-muted">No documents yet.</p>
        } @else {
          <ul class="mt-3 divide-y divide-border/60" data-testid="recent">
            @for (doc of recent(); track doc.id) {
              <li class="flex items-center justify-between py-2">
                <a
                  [routerLink]="['/documents', doc.id]"
                  class="truncate text-sm text-text hover:text-brand-200"
                  >{{ doc.filename }}</a
                >
                <span
                  class="ml-2 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                  [class]="statusClass(doc.status)"
                  >{{ doc.status }}</span
                >
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `,
})
export class DashboardPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly documentsApi = inject(DocumentsService);

  protected readonly user = this.auth.user;
  protected readonly activeOrg = this.auth.activeOrg;

  protected readonly stats = signal<DocumentStats | null>(null);
  protected readonly recent = signal<Document[]>([]);
  protected readonly loadError = signal<string | null>(null);

  protected readonly statusClass = statusBadgeClass;

  protected readonly kpis = computed(() => {
    const s = this.stats();
    return [
      { label: 'Documents', value: s ? String(s.total) : '—' },
      { label: 'Ready', value: s ? String(s.ready) : '—' },
      { label: 'Processing', value: s ? String(s.processing) : '—' },
      { label: 'Storage', value: s ? formatBytes(s.storageBytes) : '—' },
    ];
  });

  protected readonly totalUploads = computed(() =>
    (this.stats()?.uploadsPerDay ?? []).reduce((sum, d) => sum + d.count, 0),
  );

  /** Build an SVG polyline (0..280 x, 0..60 y) from the 14-day series. */
  protected readonly sparklinePoints = computed(() => {
    const series = this.stats()?.uploadsPerDay ?? [];
    if (series.length === 0) return '';
    const max = Math.max(1, ...series.map((d) => d.count));
    const stepX = 280 / Math.max(1, series.length - 1);
    return series
      .map((d, i) => {
        const x = i * stepX;
        const y = 58 - (d.count / max) * 54; // leave a little headroom
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });

  ngOnInit(): void {
    this.documentsApi.stats().subscribe({
      next: (s) => this.stats.set(s),
      error: (err) => this.loadError.set(apiErrorMessage(err, 'Could not load stats.')),
    });
    this.documentsApi.list({ limit: 5 }).subscribe({
      next: (res) => this.recent.set(res.documents),
      error: () => undefined, // KPI error already surfaced
    });
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
