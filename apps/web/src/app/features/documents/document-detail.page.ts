import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription, switchMap, timer } from 'rxjs';

import type { AiAnalysis, Comment, Document, Share, SummaryResult } from '@clouddocs/shared-types';

import { apiErrorMessage } from '../../shared/utils/api-error';
import { CommentsService } from '../comments/comments.service';
import { SharesService } from '../shares/shares.service';
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
        <div class="flex shrink-0 items-center gap-3">
          @if (d.status === 'ready') {
            <a
              [routerLink]="['/chat']"
              [queryParams]="{ documentId: d.id }"
              data-testid="chat-with-doc"
              class="inline-flex h-8 items-center rounded-lg border border-border bg-surface-2 px-3 text-xs font-medium text-text transition hover:border-brand-500"
              >💬 Chat with this document</a
            >
          }
          <button
            type="button"
            data-testid="share-button"
            class="inline-flex h-8 items-center rounded-lg border border-border bg-surface-2 px-3 text-xs font-medium text-text transition hover:border-brand-500"
            (click)="shareOpen.set(!shareOpen())"
          >
            🔗 Share
          </button>
          <span
            class="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
            [class]="badgeClass(d.status)"
            data-testid="detail-status"
            >{{ d.status }}</span
          >
        </div>
      </header>

      <!-- Share panel -->
      @if (shareOpen()) {
        <section
          class="mt-4 rounded-xl border border-border bg-surface-1 p-5"
          data-testid="share-panel"
        >
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold text-text">Share link</h2>
            <button
              type="button"
              class="text-xs text-text-muted hover:text-text"
              (click)="shareOpen.set(false)"
            >
              ✕
            </button>
          </div>

          @if (shares().length === 0) {
            <p class="mt-3 text-xs text-text-muted">No active share links.</p>
          } @else {
            <ul class="mt-3 space-y-2">
              @for (s of shares(); track s.id) {
                <li
                  class="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2"
                >
                  <span class="flex-1 truncate font-mono text-xs text-text">{{
                    shareUrl(s.token)
                  }}</span>
                  <button
                    type="button"
                    class="shrink-0 text-xs text-brand-400 hover:text-brand-300"
                    (click)="copyShareUrl(s.token)"
                  >
                    {{ copied() === s.token ? 'Copied!' : 'Copy' }}
                  </button>
                  <button
                    type="button"
                    class="shrink-0 text-xs text-text-muted hover:text-danger"
                    (click)="revokeShare(d.id, s.id)"
                  >
                    Revoke
                  </button>
                </li>
              }
            </ul>
          }

          <div class="mt-3 flex items-center gap-2">
            <button
              type="button"
              class="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              [disabled]="creatingShare()"
              (click)="createShare(d.id)"
            >
              {{ creatingShare() ? 'Creating…' : '+ New link' }}
            </button>
            @if (shareError()) {
              <p class="text-xs text-danger">{{ shareError() }}</p>
            }
          </div>
        </section>
      }

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

      <!-- Comments -->
      <section
        class="mt-6 rounded-xl border border-border bg-surface-1 p-5"
        data-testid="comments-panel"
      >
        <h2 class="text-sm font-semibold text-text">Comments</h2>

        @if (comments().length === 0) {
          <p class="mt-3 text-xs text-text-muted">No comments yet. Be the first to leave one.</p>
        } @else {
          <ul class="mt-3 space-y-3">
            @for (c of comments(); track c.id) {
              <li class="flex gap-3">
                <div class="flex-1">
                  <div class="flex items-baseline gap-2">
                    <span class="text-xs font-medium text-text">{{ c.authorName }}</span>
                    <span class="text-xs text-text-dim">{{ formatDate(c.createdAt) }}</span>
                  </div>
                  <p class="mt-0.5 text-sm text-text-muted">{{ c.body }}</p>
                </div>
                <button
                  type="button"
                  class="self-start text-xs text-text-dim hover:text-danger"
                  title="Delete comment"
                  (click)="deleteComment(d.id, c.id)"
                >
                  ✕
                </button>
              </li>
            }
          </ul>
        }

        <!-- Add comment -->
        <div class="mt-4 flex items-end gap-2">
          <textarea
            #commentInput
            rows="2"
            maxlength="2000"
            placeholder="Add a comment…"
            class="flex-1 resize-none rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none placeholder:text-text-dim focus:border-brand-500"
          ></textarea>
          <button
            type="button"
            class="rounded-md bg-brand-500 px-3 py-2 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            [disabled]="submittingComment()"
            (click)="submitComment(d.id, commentInput)"
          >
            {{ submittingComment() ? '…' : 'Post' }}
          </button>
        </div>
        @if (commentError()) {
          <p class="mt-1 text-xs text-danger">{{ commentError() }}</p>
        }
      </section>
    } @else {
      <p class="mt-4 text-sm text-text-muted">Loading…</p>
    }
  `,
})
export class DocumentDetailPage implements OnInit {
  private readonly api = inject(DocumentsService);
  private readonly sharesService = inject(SharesService);
  private readonly commentsService = inject(CommentsService);

  readonly id = input.required<string>();

  protected readonly doc = signal<Document | null>(null);
  protected readonly analyses = signal<AiAnalysis[]>([]);
  protected readonly loadError = signal<string | null>(null);

  // Share state
  protected readonly shareOpen = signal(false);
  protected readonly shares = signal<Share[]>([]);
  protected readonly creatingShare = signal(false);
  protected readonly shareError = signal<string | null>(null);
  protected readonly copied = signal<string | null>(null);

  // Comment state
  protected readonly comments = signal<Comment[]>([]);
  protected readonly submittingComment = signal(false);
  protected readonly commentError = signal<string | null>(null);

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

  ngOnInit(): void {
    this.loadComments();
  }

  private loadComments(): void {
    this.commentsService.list(this.id()).subscribe({
      next: (res) => this.comments.set(res.comments),
    });
  }

  protected shareUrl(token: string): string {
    return `${window.location.origin}/share/${token}`;
  }

  protected copyShareUrl(token: string): void {
    void navigator.clipboard.writeText(this.shareUrl(token));
    this.copied.set(token);
    setTimeout(() => this.copied.set(null), 2000);
  }

  protected createShare(documentId: string): void {
    this.creatingShare.set(true);
    this.shareError.set(null);
    this.sharesService.create(documentId, {}).subscribe({
      next: (res) => {
        this.shares.set(res.shares);
        this.creatingShare.set(false);
      },
      error: (err) => {
        this.shareError.set(apiErrorMessage(err, 'Could not create share link.'));
        this.creatingShare.set(false);
      },
    });
  }

  protected revokeShare(documentId: string, shareId: string): void {
    this.sharesService.delete(documentId, shareId).subscribe({
      next: () => this.shares.update((s) => s.filter((x) => x.id !== shareId)),
      error: (err) => this.shareError.set(apiErrorMessage(err, 'Could not revoke share.')),
    });
  }

  protected submitComment(documentId: string, textarea: HTMLTextAreaElement): void {
    const body = textarea.value.trim();
    if (!body) return;
    this.submittingComment.set(true);
    this.commentError.set(null);
    this.commentsService.create(documentId, { body }).subscribe({
      next: (comment) => {
        this.comments.update((c) => [...c, comment]);
        textarea.value = '';
        this.submittingComment.set(false);
      },
      error: (err) => {
        this.commentError.set(apiErrorMessage(err, 'Could not post comment.'));
        this.submittingComment.set(false);
      },
    });
  }

  protected deleteComment(documentId: string, commentId: string): void {
    this.commentsService.delete(documentId, commentId).subscribe({
      next: () => this.comments.update((c) => c.filter((x) => x.id !== commentId)),
    });
  }

  protected badgeClass = statusBadgeClass;

  protected formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}
