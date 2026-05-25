import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../shared/utils/api-error';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <h1 class="text-xl font-semibold tracking-tight text-text">Welcome back</h1>
    <p class="mt-1 text-sm text-text-muted">Sign in to your CloudDocs account.</p>

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
        <span class="text-xs font-medium text-text-muted">Password</span>
        <input
          type="password"
          formControlName="password"
          autocomplete="current-password"
          data-testid="password"
          class="h-10 rounded-md border border-border bg-surface-2 px-3 text-sm text-text outline-none transition focus:border-brand-500"
        />
        @if (showError('password')) {
          <span class="text-xs text-danger">Password is required.</span>
        }
      </label>

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
        {{ submitting() ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>

    <p class="mt-6 text-center text-sm text-text-muted">
      No account?
      <a routerLink="/auth/register" class="font-medium text-brand-300 hover:text-brand-200"
        >Create one</a
      >
    </p>
  `,
})
export class LoginPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected showError(control: 'email' | 'password'): boolean {
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

    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => {
        const redirect = this.route.snapshot.queryParamMap.get('redirect');
        this.router.navigateByUrl(redirect || '/dashboard');
      },
      error: (err) => {
        this.errorMessage.set(apiErrorMessage(err, 'Invalid email or password.'));
        this.submitting.set(false);
      },
    });
  }
}
