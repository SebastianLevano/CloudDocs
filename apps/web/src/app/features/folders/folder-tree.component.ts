import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';

import type { Folder } from '@clouddocs/shared-types';

import { apiErrorMessage } from '../../shared/utils/api-error';
import { FoldersService } from './folders.service';

interface FolderItem extends Folder {
  depth: number;
}

function flatten(folders: Folder[], parentId: string | null = null, depth = 0): FolderItem[] {
  const result: FolderItem[] = [];
  for (const f of folders.filter((x) => x.parentId === parentId)) {
    result.push({ ...f, depth });
    result.push(...flatten(folders, f.id, depth + 1));
  }
  return result;
}

@Component({
  selector: 'app-folder-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-0.5">
      <button
        type="button"
        class="w-full rounded-md px-2 py-1.5 text-left text-sm transition"
        [class.bg-surface-2]="selectedFolderId() === null"
        [class.text-text]="selectedFolderId() === null"
        [class.text-text-muted]="selectedFolderId() !== null"
        (click)="folderSelected.emit(null)"
      >
        All Documents
      </button>

      @for (item of flatItems(); track item.id) {
        <button
          type="button"
          class="flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-sm transition"
          [class.bg-surface-2]="selectedFolderId() === item.id"
          [class.text-text]="selectedFolderId() === item.id"
          [class.text-text-muted]="selectedFolderId() !== item.id"
          [style.padding-left.rem]="0.5 + item.depth * 1"
          (click)="folderSelected.emit(item.id)"
        >
          <svg
            class="h-3.5 w-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v8.25"
            />
          </svg>
          <span class="truncate">{{ item.name }}</span>
        </button>
      }
    </div>

    @if (createMode()) {
      <div class="mt-2 flex items-center gap-1.5">
        <input
          #nameInput
          class="flex-1 rounded-md border border-border bg-surface-1 px-2 py-1 text-xs text-text outline-none focus:border-brand-500"
          placeholder="Folder name"
          maxlength="255"
          (keydown.enter)="submitCreate(nameInput.value); nameInput.value = ''"
          (keydown.escape)="createMode.set(false)"
        />
        <button
          type="button"
          class="rounded-md bg-brand-500 px-2 py-1 text-xs text-white hover:bg-brand-600"
          (click)="submitCreate(nameInput.value); nameInput.value = ''"
        >
          Add
        </button>
        <button
          type="button"
          class="rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:bg-surface-1"
          (click)="createMode.set(false)"
        >
          ✕
        </button>
      </div>
    } @else {
      <button
        type="button"
        class="mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-muted hover:text-text"
        (click)="createMode.set(true)"
      >
        <svg
          class="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        New folder
      </button>
    }

    @if (error()) {
      <p class="mt-1 text-xs text-danger">{{ error() }}</p>
    }
  `,
})
export class FolderTreeComponent implements OnInit {
  private readonly foldersService = inject(FoldersService);

  readonly selectedFolderId = input<string | null>(null);
  readonly folderSelected = output<string | null>();
  readonly folderCreated = output<void>();

  protected readonly folders = signal<Folder[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly createMode = signal(false);

  protected readonly flatItems = computed(() => flatten(this.folders()));

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.foldersService.list().subscribe({
      next: (res) => this.folders.set(res.folders),
      error: (err) => this.error.set(apiErrorMessage(err, 'Could not load folders.')),
    });
  }

  submitCreate(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.createMode.set(false);
    this.foldersService.create({ name: trimmed }).subscribe({
      next: () => {
        this.reload();
        this.folderCreated.emit();
      },
      error: (err) => this.error.set(apiErrorMessage(err, 'Could not create folder.')),
    });
  }
}
