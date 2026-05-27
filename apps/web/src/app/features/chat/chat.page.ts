import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { ChatMessage, Citation } from '@clouddocs/shared-types';

import { apiErrorMessage } from '../../shared/utils/api-error';
import { ChatService } from './chat.service';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
}

@Component({
  selector: 'app-chat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <header class="mb-4">
      <h1 class="text-2xl font-semibold tracking-tight text-text">Chat</h1>
      <p class="mt-1 text-sm text-text-muted">
        @if (documentId()) {
          Ask questions about <span class="text-text">this document</span>.
          <a routerLink="/chat" class="text-brand-300 hover:text-brand-200">Chat across all docs</a>
        } @else {
          Ask questions across all your documents — answers cite their sources.
        }
      </p>
    </header>

    <div
      class="flex h-[calc(100vh-16rem)] flex-col rounded-xl border border-border bg-surface-1"
      data-testid="chat"
    >
      <!-- Thread -->
      <div class="flex-1 space-y-4 overflow-y-auto p-5">
        @if (turns().length === 0) {
          <p class="text-sm text-text-dim">
            e.g. “What's the total on the invoice?” or “Summarize the report.”
          </p>
        }
        @for (t of turns(); track $index) {
          <div [class]="t.role === 'user' ? 'flex justify-end' : 'flex justify-start'">
            <div
              [class]="
                t.role === 'user'
                  ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-brand-500 px-4 py-2 text-sm text-white'
                  : 'max-w-[80%] rounded-2xl rounded-bl-sm border border-border bg-surface-2 px-4 py-2 text-sm text-text'
              "
            >
              <p class="whitespace-pre-wrap">{{ t.content }}</p>
              @if (t.citations?.length) {
                <div class="mt-3 border-t border-border/60 pt-2">
                  <p class="text-[10px] font-medium uppercase tracking-wider text-text-dim">
                    Sources
                  </p>
                  <ul class="mt-1 space-y-1" data-testid="citations">
                    @for (c of uniqueCitations(t.citations!); track c.documentId + c.chunkIndex) {
                      <li class="text-xs">
                        <a
                          [routerLink]="['/documents', c.documentId]"
                          class="text-brand-300 hover:text-brand-200"
                          >{{ c.filename }}</a
                        >
                        <span class="text-text-dim"> — {{ c.snippet }}</span>
                      </li>
                    }
                  </ul>
                </div>
              }
            </div>
          </div>
        }
        @if (sending()) {
          <div class="flex justify-start">
            <div
              class="rounded-2xl border border-border bg-surface-2 px-4 py-2 text-sm text-text-muted"
            >
              Thinking…
            </div>
          </div>
        }
      </div>

      @if (error()) {
        <p class="border-t border-border px-5 py-2 text-xs text-danger">{{ error() }}</p>
      }

      <!-- Composer -->
      <div class="flex items-center gap-2 border-t border-border p-3">
        <input
          [value]="draft()"
          (input)="draft.set($any($event.target).value)"
          (keydown.enter)="send()"
          [disabled]="sending()"
          placeholder="Ask about your documents…"
          data-testid="chat-input"
          class="h-10 flex-1 rounded-md border border-border bg-surface-2 px-3 text-sm text-text outline-none focus:border-brand-500"
        />
        <button
          type="button"
          (click)="send()"
          [disabled]="sending() || !draft().trim()"
          data-testid="chat-send"
          class="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Send
        </button>
      </div>
    </div>
  `,
})
export class ChatPage {
  private readonly chat = inject(ChatService);

  /** Optional document scope, bound from the `documentId` query param. */
  readonly documentId = input<string>();

  protected readonly turns = signal<Turn[]>([]);
  protected readonly draft = signal('');
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);

  /** History sent to the API (roles + content only). */
  private readonly history = computed<ChatMessage[]>(() =>
    this.turns().map((t) => ({ role: t.role, content: t.content })),
  );

  protected send(): void {
    const text = this.draft().trim();
    if (!text || this.sending()) return;

    this.turns.update((t) => [...t, { role: 'user', content: text }]);
    this.draft.set('');
    this.error.set(null);
    this.sending.set(true);

    this.chat.send(this.history(), this.documentId()).subscribe({
      next: (res) => {
        this.turns.update((t) => [
          ...t,
          { role: 'assistant', content: res.answer, citations: res.citations },
        ]);
        this.sending.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorMessage(err, 'Chat failed. Please try again.'));
        this.sending.set(false);
      },
    });
  }

  /** Collapse citations to one entry per document for a tidy source list. */
  protected uniqueCitations(citations: Citation[]): Citation[] {
    const seen = new Set<string>();
    return citations.filter((c) => (seen.has(c.documentId) ? false : seen.add(c.documentId)));
  }
}
