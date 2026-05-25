import { inject, Injectable, signal, type Signal, type WritableSignal } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  type Document,
} from '@clouddocs/shared-types';

import { DocumentsService } from './documents.service';

export type UploadStatus = 'creating' | 'uploading' | 'completing' | 'done' | 'error';

/** Live state for a single file upload, surfaced as signals for the UI. */
export interface UploadHandle {
  readonly file: File;
  readonly progress: Signal<number>; // 0..100, the S3 PUT progress
  readonly status: Signal<UploadStatus>;
  readonly error: Signal<string | null>;
  readonly document: Signal<Document | null>;
  /** Resolves true on success, false on failure (never rejects). */
  readonly done: Promise<boolean>;
}

interface MutableHandle extends UploadHandle {
  readonly progress: WritableSignal<number>;
  readonly status: WritableSignal<UploadStatus>;
  readonly error: WritableSignal<string | null>;
  readonly document: WritableSignal<Document | null>;
}

/** Client-side guard mirroring the server's CreateDocumentDto constraints. */
export function validateFile(file: File): string | null {
  if (!(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Only PDF and DOCX files are supported.';
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return 'File exceeds the 10 MB limit.';
  }
  if (file.size === 0) {
    return 'File is empty.';
  }
  return null;
}

/**
 * Orchestrates the three-step upload:
 *   1. POST /documents → presigned PUT URL (+ pending_upload row)
 *   2. PUT the bytes straight to S3 (progress reported here; never via Lambda)
 *   3. POST /documents/:id/complete → flip to `uploaded`
 *
 * `upload()` returns immediately with a handle whose signals drive the UI; the
 * async work runs in the background and updates them.
 */
@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly http = inject(HttpClient);
  private readonly documents = inject(DocumentsService);

  upload(file: File): UploadHandle {
    const handle: MutableHandle = {
      file,
      progress: signal(0),
      status: signal<UploadStatus>('creating'),
      error: signal<string | null>(null),
      document: signal<Document | null>(null),
      done: Promise.resolve(false),
    };

    // Replace the placeholder promise with the real run.
    (handle as { done: Promise<boolean> }).done = this.run(file, handle);
    return handle;
  }

  private async run(file: File, handle: MutableHandle): Promise<boolean> {
    try {
      const created = await lastValueFrom(
        this.documents.create({
          filename: file.name,
          // The browser-reported MIME is validated server-side too.
          mimeType: file.type as (typeof ALLOWED_UPLOAD_MIME_TYPES)[number],
          sizeBytes: file.size,
        }),
      );

      handle.status.set('uploading');
      await this.putToS3(created.upload.url, created.upload.headers, file, handle.progress);

      handle.status.set('completing');
      const doc = await lastValueFrom(this.documents.complete(created.document.id));

      handle.document.set(doc);
      handle.progress.set(100);
      handle.status.set('done');
      return true;
    } catch (err) {
      handle.status.set('error');
      handle.error.set(messageFor(err));
      return false;
    }
  }

  /** Raw presigned PUT with upload-progress events. Bypasses the auth interceptor (off-origin). */
  private putToS3(
    url: string,
    headers: Record<string, string>,
    file: File,
    progress: WritableSignal<number>,
  ): Promise<void> {
    const request$ = this.http.put(url, file, {
      headers,
      reportProgress: true,
      observe: 'events',
      responseType: 'text',
    });

    return new Promise<void>((resolve, reject) => {
      request$.subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            progress.set(Math.round((event.loaded / event.total) * 90)); // reserve last 10% for complete
          }
        },
        error: reject,
        complete: resolve,
      });
    });
  }
}

function messageFor(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'Upload failed. Please try again.';
}
