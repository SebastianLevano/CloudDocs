import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription, switchMap, timer } from 'rxjs';

import type { AiAnalysis, Document, SummaryResult } from '@clouddocs/shared-types';

import { apiErrorMessage } from '../../shared/utils/api-error';
import { DocumentsService } from './documents.service';
import { isProcessing, statusBadgeClass } from './document-status';

@Component({
  selector: 'app-document-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <a routerLink="/documents" class="text-sm text-text-muted hover:text-text">← Documents</a>

    @if (loadError()) {
      <p class="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
        {{ loadError() }}
      </p>
    } @else if (doc(); as d) {
      <header class="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-text">{{ d.filename }}</h1>
          <p class="mt-1 text-sm text-text-muted">
            {{ formatSize(d.sizeBytes) }}
            @if (d.pageCount) {
              · {{ d.pageCount }} pages
            }
            @if (d.language) {
              · {{ d.language }}
            }
          </p>
        </div>
        <span
          class="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
          [class]="badgeClass(d.status)"
          data-testid="detail-status"
          >{{ d.status }}</span
        >
      </header>

      @if (processing()) {
        <div
          class="mt-6 flex items-center gap-3 rounded-xl border border-border bg-surface-1 p-5 text-sm text-text-muted"
          data-testid="processing"
        >
          <span class="h-2 w-2 animate-pulse rounded-full bg-brand-400"></span>
          Analyzing document… this updates automatically.
        </div>
      } @else if (d.status === 'failed') {
        <div class="mt-6 rounded-xl border border-danger/40 bg-danger/10 p-5 text-sm text-danger">
          Processing failed{{ d.error ? ': ' + d.error : '' }}.
        </div>
      } @else {
        <!-- Classification -->
        @if (d.category) {
          <section class="mt-6 rounded-xl border border-border bg-surface-1 p-5">
            <h2 class="text-sm font-semibold text-text">Classification</h2>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <span class="rounded-md bg-brand-500/15 px-2 py-1 text-xs font-medium text-brand-200">
                {{ d.category }}
              </span>
              @for (tag of d.tags; track tag) {
                <span class="rounded-md border border-border px-2 py-1 text-xs text-text-muted">
                  {{ tag }}
                </span>
              }
            </div>
          </section>
        }

        <!-- Summary -->
        @if (summary(); as s) {
          <section
            class="mt-4 rounded-xl border border-border bg-surface-1 p-5"
            data-testid="summary"
          >
            <h2 class="text-sm font-semibold text-text">Summary</h2>
            <p class="mt-2 text-sm leading-relaxed text-text-muted">{{ s.summary }}</p>
            @if (s.bullets.length) {
              <ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-text-muted">
                @for (b of s.bullets; track b) {
                  <li>{{ b }}</li>
                }
              </ul>
            }
          </section>
        }
      }
    } @else {
      <p class="mt-4 text-sm text-text-muted">Loading…</p>
    }
  `,
})
export class DocumentDetailPage {
  private readonly api = inject(DocumentsService);

  /** Bound from the route param via withComponentInputBinding. */
  readonly id = input.required<string>();

  protected readonly doc = signal<Document | null>(null);
  protected readonly analyses = signal<AiAnalysis[]>([]);
  protected readonly loadError = signal<string | null>(null);

  protected readonly processing = computed(() => {
    const d = this.doc();
    return d ? isProcessing(d.status) : false;
  });

  protected readonly summary = computed<SummaryResult | null>(() => {
    const row = this.analyses().find((a) => a.kind === 'summary');
    return row ? (row.result as SummaryResult) : null;
  });

  private readonly poll: Subscription;

  constructor() {
    // Poll every 3s; the server response tells us when to stop (status leaves
    // the processing set). takeUntilDestroyed cleans up on navigation.
    this.poll = timer(0, 3000)
      .pipe(
        switchMap(() => this.api.get(this.id())),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (res) => {
          this.doc.set(res.document);
          this.analyses.set(res.analyses);
          if (!isProcessing(res.document.status)) this.poll.unsubscribe();
        },
        error: (err) => this.loadError.set(apiErrorMessage(err, 'Could not load the document.')),
      });
  }

  protected badgeClass = statusBadgeClass;

  protected formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
