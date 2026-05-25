import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

/**
 * Minimal centered shell for the login/register pages — branding on top,
 * the feature page rendered into the outlet below.
 */
@Component({
  selector: 'app-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink],
  template: `
    <main class="relative grid min-h-screen place-items-center overflow-hidden px-6 py-12">
      <!-- Background gradient mesh -->
      <div class="pointer-events-none absolute inset-0">
        <div
          class="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-brand-500 opacity-15 blur-[120px]"
        ></div>
      </div>

      <div class="relative z-10 w-full max-w-sm">
        <a routerLink="/" class="mb-8 flex items-center justify-center gap-2">
          <div
            class="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-700 shadow-[0_0_24px_rgba(124,92,255,0.35)]"
          >
            <span class="text-sm font-bold text-white">C</span>
          </div>
          <span class="text-base font-semibold tracking-tight">CloudDocs AI</span>
        </a>

        <div class="rounded-xl border border-border bg-surface-1/80 p-8 backdrop-blur">
          <router-outlet />
        </div>
      </div>
    </main>
  `,
})
export class AuthLayout {}
