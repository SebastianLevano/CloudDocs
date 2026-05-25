import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';

/**
 * Drag-and-drop / click-to-browse file picker. Emits selected files; all upload
 * orchestration + per-file progress lives in the parent page (UploadService).
 */
@Component({
  selector: 'app-upload-dropzone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave()"
      (drop)="onDrop($event)"
      [class.border-brand-500]="dragging()"
      [class.bg-surface-2]="dragging()"
      class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-1 px-6 py-10 text-center transition hover:border-brand-500"
      data-testid="dropzone"
    >
      <div
        class="grid h-10 w-10 place-items-center rounded-lg border border-border-strong bg-surface-3 text-lg"
      >
        ⬆️
      </div>
      <p class="text-sm font-medium text-text">
        Drop PDF or DOCX here, or <span class="text-brand-300">browse</span>
      </p>
      <p class="text-xs text-text-dim">Up to 10 MB per file</p>
      <input
        type="file"
        class="hidden"
        multiple
        accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        (change)="onInput($event)"
        data-testid="file-input"
      />
    </label>
  `,
})
export class UploadDropzoneComponent {
  readonly filesSelected = output<File[]>();
  protected readonly dragging = signal(false);

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDragLeave(): void {
    this.dragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const files = event.dataTransfer?.files;
    if (files?.length) this.filesSelected.emit(Array.from(files));
  }

  protected onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) this.filesSelected.emit(Array.from(input.files));
    input.value = ''; // allow re-selecting the same file
  }
}
