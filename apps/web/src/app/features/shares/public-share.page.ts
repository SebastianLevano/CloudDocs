import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';

import type { PublicShareResponse } from '@clouddocs/shared-types';

import { API_BASE_URL } from '../../core/api/api.config';
import { apiErrorMessage } from '../../shared/utils/api-error';

@Component({
  selector: 'app-public-share',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen items-center justify-center bg-bg px-4">
      <div class="w-full max-w-md rounded-2xl border border-border bg-surface-1 p-8 shadow-lg">
        <h1 class="text-xl font-semibold text-text">CloudDocs AI</h1>
        <p class="mt-1 text-sm text-text-muted">Shared document</p>

        @if (loading()) {
          <p class="mt-6 text-sm text-text-muted">Loading…</p>
        } @else if (error()) {
          <div
            class="mt-6 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
          >
            {{ error() }}
          </div>
        } @else if (share(); as s) {
          <div class="mt-6">
            <p class="text-base font-medium text-text">{{ s.filename }}</p>
            <p class="mt-1 text-xs text-text-muted">
              {{ formatSize(s.sizeBytes) }}
              @if (s.expiresAt) {
                · Expires {{ formatDate(s.expiresAt) }}
              }
            </p>
            <a
              [href]="s.downloadUrl"
              download
              class="mt-5 flex h-10 w-full items-center justify-center rounded-lg bg-brand-500 text-sm font-medium text-white transition hover:bg-brand-600"
              >Download file</a
            >
          </div>
        }
      </div>
    </div>
  `,
})
export class PublicSharePage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  readonly token = input.required<string>();

  protected readonly share = signal<PublicShareResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.http
      .get<PublicShareResponse>(`${this.baseUrl}/v1/public/shares/${this.token()}`)
      .subscribe({
        next: (s) => {
          this.share.set(s);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(apiErrorMessage(err, 'This share link is invalid or has expired.'));
          this.loading.set(false);
        },
      });
  }

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
