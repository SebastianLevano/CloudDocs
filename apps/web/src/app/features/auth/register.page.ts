import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import type { RegisterDto } from '@clouddocs/shared-types';

import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../shared/utils/api-error';

/** Matches OrgSlugSchema on the backend (lowercase, hyphen-separated). */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

@Component({
  selector: 'app-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <h1 class="text-xl font-semibold tracking-tight text-text">Create your account</h1>
    <p class="mt-1 text-sm text-text-muted">Start managing documents with AI in seconds.</p>

    <form class="mt-6 flex flex-col gap-4" [formGroup]="form" (ngSubmit)="submit()">
      <label class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-text-muted">Email</span>
        <input
          type="email"
          formControlName="email"
          autocomplete="email"
          data-testid="email"
          class="h-10 rounded-md border border-border bg-surface-2 px-3 text-sm text-text outline-none transition focus:border-brand-500"
        />
        @if (showError('email')) {
          <span class="text-xs text-danger">Enter a valid email.</span>
        }
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-text-muted"
          >Display name <span class="text-text-dim">(optional)</span></span
        >
        <input
          type="text"
          formControlName="displayName"
          autocomplete="name"
          data-testid="displayName"
          class="h-10 rounded-md border border-border bg-surface-2 px-3 text-sm text-text outline-none transition focus:border-brand-500"
        />
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-text-muted">Password</span>
        <input
          type="password"
          formControlName="password"
          autocomplete="new-password"
          data-testid="password"
          class="h-10 rounded-md border border-border bg-surface-2 px-3 text-sm text-text outline-none transition focus:border-brand-500"
        />
        @if (showError('password')) {
          <span class="text-xs text-danger">At least 12 characters.</span>
        } @else {
          <span class="text-xs text-text-dim">At least 12 characters.</span>
        }
      </label>

      <div class="grid grid-cols-2 gap-3">
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-text-muted">Organization</span>
          <input
            type="text"
            formControlName="orgName"
            data-testid="orgName"
            (input)="onOrgNameInput()"
            class="h-10 rounded-md border border-border bg-surface-2 px-3 text-sm text-text outline-none transition focus:border-brand-500"
          />
          @if (showError('orgName')) {
            <span class="text-xs text-danger">Required.</span>
          }
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-text-muted">Slug</span>
          <input
            type="text"
            formControlName="orgSlug"
            data-testid="orgSlug"
            (input)="slugEdited = true"
            class="h-10 rounded-md border border-border bg-surface-2 px-3 font-mono text-sm text-text outline-none transition focus:border-brand-500"
          />
          @if (showError('orgSlug')) {
            <span class="text-xs text-danger">3–40 chars, a–z, 0–9, hyphens.</span>
          }
        </label>
      </div>

      @if (errorMessage()) {
        <p
          data-testid="form-error"
          class="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {{ errorMessage() }}
        </p>
      }

      <button
        type="submit"
        data-testid="submit"
        [disabled]="submitting()"
        class="mt-2 inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white shadow-[0_0_24px_rgba(124,92,255,0.25)] transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {{ submitting() ? 'Creating account…' : 'Create account' }}
      </button>
    </form>

    <p class="mt-6 text-center text-sm text-text-muted">
      Already have an account?
      <a routerLink="/auth/login" class="font-medium text-brand-300 hover:text-brand-200"
        >Sign in</a
      >
    </p>
  `,
})
export class RegisterPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  /** Once the user edits the slug we stop auto-deriving it from the org name. */
  protected slugEdited = false;

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    displayName: [''],
    password: ['', [Validators.required, Validators.minLength(12)]],
    orgName: ['', [Validators.required, Validators.maxLength(120)]],
    orgSlug: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(40),
        Validators.pattern(SLUG_PATTERN),
      ],
    ],
  });

  protected onOrgNameInput(): void {
    if (this.slugEdited) return;
    this.form.controls.orgSlug.setValue(slugify(this.form.controls.orgName.value));
  }

  protected showError(control: 'email' | 'password' | 'orgName' | 'orgSlug'): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.dirty || c.touched);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);

    const raw = this.form.getRawValue();
    const dto: RegisterDto = {
      email: raw.email,
      password: raw.password,
      orgName: raw.orgName,
      orgSlug: raw.orgSlug,
      ...(raw.displayName.trim() ? { displayName: raw.displayName.trim() } : {}),
    };

    this.auth.register(dto).subscribe({
      next: () => this.router.navigateByUrl('/dashboard'),
      error: (err) => {
        this.errorMessage.set(apiErrorMessage(err, 'Could not create your account.'));
        this.submitting.set(false);
      },
    });
  }
}
