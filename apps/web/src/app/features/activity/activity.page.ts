import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';

import type { ActivityLog } from '@clouddocs/shared-types';

import { apiErrorMessage } from '../../shared/utils/api-error';
import { ActivityService } from './activity.service';

const ACTION_OPTIONS = [
  '',
  'document.uploaded',
  'document.ready',
  'share.created',
  'comment.posted',
  'folder.created',
] as const;

@Component({
  selector: 'app-activity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-text">Activity</h1>
        <p class="mt-1 text-sm text-text-muted">Audit log of all org actions.</p>
      </div>
      <button
        type="button"
        class="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-sm font-medium text-text transition hover:bg-surface-3 disabled:opacity-50"
        [disabled]="exporting()"
        (click)="exportCsv()"
      >
        {{ exporting() ? 'Exporting…' : '⬇ Export CSV' }}
      </button>
    </header>

    <!-- Filters -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <select
        [value]="actionFilter()"
        (change)="actionFilter.set($any($event.target).value); load()"
        class="h-9 rounded-md border border-border bg-surface-2 px-2 text-sm text-text-muted outline-none focus:border-brand-500"
        data-testid="action-filter"
      >
        <option value="">All actions</option>
        @for (a of actions; track a) {
          @if (a) {
            <option [value]="a">{{ a }}</option>
          }
        }
      </select>
      <input
        type="date"
        [value]="fromDate()"
        (change)="fromDate.set($any($event.target).value); load()"
        class="h-9 rounded-md border border-border bg-surface-2 px-2 text-sm text-text outline-none focus:border-brand-500"
        title="From date"
      />
      <input
        type="date"
        [value]="toDate()"
        (change)="toDate.set($any($event.target).value); load()"
        class="h-9 rounded-md border border-border bg-surface-2 px-2 text-sm text-text outline-none focus:border-brand-500"
        title="To date"
      />
      @if (actionFilter() || fromDate() || toDate()) {
        <button
          type="button"
          class="h-9 rounded-md px-3 text-sm text-text-muted hover:text-text"
          (click)="clearFilters()"
        >
          Clear
        </button>
      }
    </div>

    <!-- Log table -->
    @if (loading()) {
      <p class="text-sm text-text-muted">Loading…</p>
    } @else if (error()) {
      <p class="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
        {{ error() }}
      </p>
    } @else if (logs().length === 0) {
      <div
        class="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-12 text-center"
      >
        <p class="text-sm font-medium text-text">No activity yet</p>
        <p class="mt-1 text-xs text-text-dim">
          Actions like uploads and document processing will appear here.
        </p>
      </div>
    } @else {
      <div class="overflow-hidden rounded-xl border border-border">
        <table class="w-full text-left text-sm" data-testid="activity-table">
          <thead class="bg-surface-1 text-xs uppercase tracking-wider text-text-dim">
            <tr class="border-b border-border">
              <th class="px-4 py-2.5 font-medium">Action</th>
              <th class="px-4 py-2.5 font-medium">Target</th>
              <th class="px-4 py-2.5 font-medium">User</th>
              <th class="px-4 py-2.5 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            @for (log of logs(); track log.id) {
              <tr class="border-b border-border/60 hover:bg-surface-1">
                <td class="px-4 py-2.5">
                  <span class="inline-flex items-center gap-1.5">
                    <span class="h-1.5 w-1.5 rounded-full" [class]="actionDot(log.action)"></span>
                    <code class="text-xs text-text">{{ log.action }}</code>
                  </span>
                </td>
                <td class="px-4 py-2.5 font-mono text-xs text-text-dim">
                  @if (log.targetType) {
                    {{ log.targetType }}{{ log.targetId ? ' · ' + log.targetId.slice(0, 8) : '' }}
                  } @else {
                    —
                  }
                </td>
                <td class="px-4 py-2.5 font-mono text-xs text-text-dim">
                  {{ log.userId ? log.userId.slice(0, 8) + '…' : 'system' }}
                </td>
                <td class="px-4 py-2.5 text-xs text-text-muted">{{ formatDate(log.createdAt) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (nextCursor()) {
        <button
          type="button"
          class="mt-4 w-full rounded-lg border border-border py-2 text-sm text-text-muted transition hover:bg-surface-1"
          (click)="loadMore()"
        >
          Load more
        </button>
      }
    }
  `,
})
export class ActivityPage implements OnInit {
  private readonly activityService = inject(ActivityService);

  protected readonly logs = signal<ActivityLog[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly exporting = signal(false);

  protected readonly actionFilter = signal('');
  protected readonly fromDate = signal('');
  protected readonly toDate = signal('');

  protected readonly actions = ACTION_OPTIONS;

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.nextCursor.set(null);
    this.activityService
      .list({
        ...(this.actionFilter() ? { action: this.actionFilter() } : {}),
        ...(this.fromDate() ? { from: new Date(this.fromDate()).toISOString() } : {}),
        ...(this.toDate() ? { to: new Date(this.toDate() + 'T23:59:59').toISOString() } : {}),
      })
      .subscribe({
        next: (res) => {
          this.logs.set(res.logs);
          this.nextCursor.set(res.nextCursor);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(apiErrorMessage(err, 'Could not load activity.'));
          this.loading.set(false);
        },
      });
  }

  protected loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor) return;
    this.activityService
      .list({
        cursor,
        ...(this.actionFilter() ? { action: this.actionFilter() } : {}),
      })
      .subscribe({
        next: (res) => {
          this.logs.update((prev) => [...prev, ...res.logs]);
          this.nextCursor.set(res.nextCursor);
        },
      });
  }

  protected clearFilters(): void {
    this.actionFilter.set('');
    this.fromDate.set('');
    this.toDate.set('');
    this.load();
  }

  protected exportCsv(): void {
    this.exporting.set(true);
    this.activityService
      .exportCsv({
        ...(this.actionFilter() ? { action: this.actionFilter() } : {}),
        ...(this.fromDate() ? { from: new Date(this.fromDate()).toISOString() } : {}),
        ...(this.toDate() ? { to: new Date(this.toDate() + 'T23:59:59').toISOString() } : {}),
      })
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'activity.csv';
          a.click();
          URL.revokeObjectURL(url);
          this.exporting.set(false);
        },
        error: () => this.exporting.set(false),
      });
  }

  protected actionDot(action: string): string {
    if (action.startsWith('document.ready')) return 'bg-green-500';
    if (action.startsWith('document.')) return 'bg-brand-500';
    if (action.startsWith('share.')) return 'bg-amber-500';
    return 'bg-surface-3';
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
