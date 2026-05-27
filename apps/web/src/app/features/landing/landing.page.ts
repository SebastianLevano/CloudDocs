import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <main class="relative min-h-screen overflow-hidden">
      <!-- Background gradient mesh -->
      <div class="pointer-events-none absolute inset-0">
        <div
          class="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-brand-500 opacity-20 blur-[120px]"
        ></div>
        <div
          class="absolute top-1/2 -left-40 h-96 w-96 rounded-full bg-brand-700 opacity-15 blur-[120px]"
        ></div>
      </div>

      <!-- Topbar -->
      <header class="relative z-10 border-b border-border/60">
        <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div class="flex items-center gap-2">
            <div
              class="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-700 shadow-[0_0_24px_rgba(124,92,255,0.35)]"
            >
              <span class="text-sm font-bold text-white">C</span>
            </div>
            <span class="text-sm font-semibold tracking-tight">CloudDocs AI</span>
            <span
              class="ml-2 rounded-full border border-border-strong bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-muted"
            >
              alpha
            </span>
          </div>
          <nav class="flex items-center gap-4 text-sm md:gap-6">
            <a class="hidden text-text-muted hover:text-text md:inline" href="#features"
              >Features</a
            >
            <a
              routerLink="/auth/login"
              class="text-text-muted transition hover:text-text"
              data-testid="nav-signin"
              >Sign in</a
            >
            <a
              routerLink="/auth/register"
              class="inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white shadow-[0_0_24px_rgba(124,92,255,0.25)] transition hover:bg-brand-400"
            >
              Get started
            </a>
          </nav>
        </div>
      </header>

      <!-- Hero -->
      <section class="relative z-10 mx-auto max-w-7xl px-6 pt-24 pb-16 lg:pt-32">
        <div class="max-w-3xl">
          <div
            class="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2/60 px-3 py-1 text-xs font-medium text-text-muted backdrop-blur"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
            Live · upload, AI summaries & search
          </div>

          <h1 class="text-5xl font-bold tracking-tight text-text sm:text-6xl lg:text-7xl">
            Intelligent document
            <span
              class="bg-gradient-to-r from-brand-300 via-brand-400 to-brand-500 bg-clip-text text-transparent"
              >management</span
            >
            powered by AI
          </h1>

          <p class="mt-6 max-w-2xl text-lg leading-relaxed text-text-muted">
            Upload PDFs and DOCX files. CloudDocs AI extracts, summarizes, classifies and
            semantically indexes them so you can find exactly what you need — and chat with your
            documents.
          </p>

          <div class="mt-10 flex flex-wrap items-center gap-4">
            <a
              routerLink="/auth/register"
              data-testid="hero-cta"
              class="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-6 text-sm font-semibold text-white shadow-[0_0_24px_rgba(124,92,255,0.25)] transition hover:bg-brand-400"
            >
              Get started — it's free
            </a>
            <a
              href="#features"
              class="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-surface-2/60 px-6 text-sm font-semibold text-text backdrop-blur transition hover:border-border-strong hover:bg-surface-3"
            >
              Explore features
            </a>
          </div>
        </div>
      </section>

      <!-- Feature cards -->
      <section id="features" class="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (f of features; track f.title) {
            <article
              class="group relative overflow-hidden rounded-xl border border-border bg-surface-1/80 p-6 backdrop-blur transition hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-2"
            >
              <div
                class="mb-4 grid h-9 w-9 place-items-center rounded-md border border-border-strong bg-surface-3 text-brand-300"
              >
                <span class="text-base">{{ f.icon }}</span>
              </div>
              <h3 class="text-base font-semibold text-text">{{ f.title }}</h3>
              <p class="mt-1.5 text-sm leading-relaxed text-text-muted">
                {{ f.description }}
              </p>
            </article>
          }
        </div>
      </section>

      <!-- Footer -->
      <footer
        class="relative z-10 border-t border-border/60 py-6 text-center text-xs text-text-dim"
      >
        Built with Angular 21 · Nx · AWS Lambda · OpenAI
      </footer>
    </main>
  `,
})
export class LandingPage {
  protected readonly features = [
    {
      icon: '⚡',
      title: 'Serverless by design',
      description:
        'AWS Lambda + API Gateway + S3 + EventBridge. Pay only for what you use, scale to zero when idle.',
    },
    {
      icon: '🧠',
      title: 'AI-powered analysis',
      description:
        'Automatic summaries, classification, entity extraction and semantic search powered by OpenAI.',
    },
    {
      icon: '🔒',
      title: 'Multi-tenant from day 1',
      description:
        'Organizations, role-based access, signed URLs and row-level scoping built into the data model.',
    },
    {
      icon: '🔍',
      title: 'Hybrid search',
      description:
        'Full-text via Postgres tsvector and semantic via pgvector embeddings — both in one query.',
    },
    {
      icon: '💬',
      title: 'Chat with your documents',
      description:
        'RAG-powered conversations with streaming responses and source citations on every answer.',
    },
    {
      icon: '🎨',
      title: 'Premium dark-first UI',
      description:
        'Designed with care — Linear-inspired layout, Vercel-grade microinteractions and a polished feel.',
    },
  ];
}
