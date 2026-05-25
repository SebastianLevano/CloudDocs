import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';

import type { Document } from '@clouddocs/shared-types';

import { apiErrorMessage } from '../../shared/utils/api-error';
import { DocumentsService } from './documents.service';
import { UploadDropzoneComponent } from './components/upload-dropzone.component';
import { UploadService, validateFile, type UploadHandle } from './upload.service';

interface RejectedFile {
  name: string;
  reason: string;
}

@Component({
  selector: 'app-documents',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UploadDropzoneComponent],
  template: `
    <header class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-text">Documents</h1>
        <p class="mt-1 text-sm text-text-muted">Upload PDFs and DOCX files to your workspace.</p>
      </div>
    </header>

    <app-upload-dropzone (filesSelected)="onFilesSelected($event)" />

    <!-- Rejected files (client-side validation) -->
    @if (rejected().length) {
      <ul class="mt-4 space-y-1" data-testid="rejected">
        @for (r of rejected(); track r.name) {
          <li class="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {{ r.name }} — {{ r.reason }}
          </li>
        }
      </ul>
    }

    <!-- In-flight uploads -->
    @if (uploads().length) {
      <section class="mt-6 space-y-2" data-testid="uploads">
        @for (u of uploads(); track u.file.name + u.file.size) {
          <div class="rounded-lg border border-border bg-surface-1 p-3">
            <div class="flex items-center justify-between text-sm">
              <span class="truncate text-text">{{ u.file.name }}</span>
              <span class="text-xs text-text-muted">{{ uploadLabel(u) }}</span>
            </div>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                class="h-full rounded-full transition-all"
                [class.bg-brand-500]="u.status() !== 'error'"
                [class.bg-danger]="u.status() === 'error'"
                [style.width.%]="u.status() === 'error' ? 100 : u.progress()"
              ></div>
            </div>
            @if (u.error()) {
              <p class="mt-1 text-xs text-danger">{{ u.error() }}</p>
            }
          </div>
        }
      </section>
    }

    <!-- Document list -->
    <section class="mt-8">
      @if (loading()) {
        <p class="text-sm text-text-muted">Loading…</p>
      } @else if (loadError()) {
        <p class="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {{ loadError() }}
        </p>
      } @else if (documents().length === 0) {
        <div
          class="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-12 text-center"
          data-testid="empty-state"
        >
          <p class="text-sm font-medium text-text">No documents yet</p>
          <p class="mt-1 text-xs text-text-dim">Upload your first file to get started.</p>
        </div>
      } @else {
        <table class="w-full text-left text-sm" data-testid="documents-table">
          <thead class="text-xs uppercase tracking-wider text-text-dim">
            <tr class="border-b border-border">
              <th class="py-2 font-medium">Name</th>
              <th class="py-2 font-medium">Size</th>
              <th class="py-2 font-medium">Status</th>
              <th class="py-2 font-medium">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            @for (doc of documents(); track doc.id) {
              <tr class="border-b border-border/60">
                <td class="py-3 text-text">{{ doc.filename }}</td>
                <td class="py-3 text-text-muted">{{ formatSize(doc.sizeBytes) }}</td>
                <td class="py-3">
                  <span
                    class="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                    [class]="statusClass(doc.status)"
                    >{{ doc.status }}</span
                  >
                </td>
                <td class="py-3 text-text-muted">{{ formatDate(doc.createdAt) }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
})
export class DocumentsPage implements OnInit {
  private readonly documentsApi = inject(DocumentsService);
  private readonly uploadService = inject(UploadService);

  protected readonly documents = signal<Document[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly uploads = signal<UploadHandle[]>([]);
  protected readonly rejected = signal<RejectedFile[]>([]);

  ngOnInit(): void {
    this.refresh();
  }

  protected onFilesSelected(files: File[]): void {
    this.rejected.set([]);
    const accepted: File[] = [];
    const rejected: RejectedFile[] = [];

    for (const file of files) {
      const reason = validateFile(file);
      if (reason) rejected.push({ name: file.name, reason });
      else accepted.push(file);
    }
    this.rejected.set(rejected);

    for (const file of accepted) {
      const handle = this.uploadService.upload(file);
      this.uploads.update((list) => [handle, ...list]);
      void handle.done.then((ok) => {
        if (ok) this.refresh();
      });
    }
  }

  private refresh(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.documentsApi.list().subscribe({
      next: (res) => {
        this.documents.set(res.documents);
        this.loading.set(false);
      },
      error: (err) => {
        this.loadError.set(apiErrorMessage(err, 'Could not load documents.'));
        this.loading.set(false);
      },
    });
  }

  protected uploadLabel(u: UploadHandle): string {
    switch (u.status()) {
      case 'creating':
        return 'Preparing…';
      case 'uploading':
        return `${u.progress()}%`;
      case 'completing':
        return 'Finishing…';
      case 'done':
        return 'Done';
      case 'error':
        return 'Failed';
    }
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

  protected statusClass(status: Document['status']): string {
    switch (status) {
      case 'ready':
        return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';
      case 'failed':
        return 'border-danger/40 bg-danger/10 text-danger';
      case 'pending_upload':
        return 'border-border-strong bg-surface-3 text-text-dim';
      default:
        return 'border-brand-500/40 bg-brand-500/10 text-brand-300';
    }
  }
}
