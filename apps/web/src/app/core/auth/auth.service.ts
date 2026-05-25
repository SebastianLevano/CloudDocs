import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, finalize, map, Observable, of, shareReplay, tap } from 'rxjs';

import type {
  AuthSession,
  LoginDto,
  Membership,
  Organization,
  PublicUser,
  RegisterDto,
} from '@clouddocs/shared-types';

import { API_BASE_URL } from '../api/api.config';

/**
 * - `idle`        — initial session restore hasn't finished yet (boot).
 * - `loading`     — a login/register/refresh request is in flight.
 * - `authenticated` / `anonymous` — settled states.
 */
export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'anonymous';

/**
 * Holds the authenticated session in memory.
 *
 * The access token is deliberately NOT persisted to localStorage/sessionStorage
 * (XSS would leak it). It lives only in this signal for the lifetime of the
 * tab. The long-lived refresh token is an HttpOnly cookie the browser manages;
 * on a fresh load we call {@link restoreSession} to swap it for a new access
 * token. See plan §13 (security).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  private readonly _accessToken = signal<string | null>(null);
  private readonly _user = signal<PublicUser | null>(null);
  private readonly _memberships = signal<readonly Membership[]>([]);
  private readonly _status = signal<AuthStatus>('idle');

  /** Single in-flight refresh shared across concurrent 401 retries. */
  private refreshInFlight: Observable<AuthSession> | null = null;

  readonly user = this._user.asReadonly();
  readonly memberships = this._memberships.asReadonly();
  readonly status = this._status.asReadonly();
  readonly isAuthenticated = computed(() => this._status() === 'authenticated');
  /** First membership for now — org switching arrives in a later phase. */
  readonly activeOrg = computed<Organization | null>(
    () => this._memberships()[0]?.organization ?? null,
  );

  /** Synchronous read for the auth interceptor. */
  get accessToken(): string | null {
    return this._accessToken();
  }

  register(dto: RegisterDto): Observable<AuthSession> {
    this._status.set('loading');
    return this.http.post<AuthSession>(this.url('register'), dto).pipe(
      tap((session) => this.setSession(session)),
      catchError((err) => this.onAuthFailure(err)),
    );
  }

  login(dto: LoginDto): Observable<AuthSession> {
    this._status.set('loading');
    return this.http.post<AuthSession>(this.url('login'), dto).pipe(
      tap((session) => this.setSession(session)),
      catchError((err) => this.onAuthFailure(err)),
    );
  }

  /**
   * Best-effort logout: revoke the refresh token server-side and always clear
   * local state, even if the request fails (mirrors the idempotent backend).
   */
  logout(): Observable<void> {
    return this.http.post<void>(this.url('logout'), {}).pipe(
      catchError(() => of(void 0)),
      finalize(() => this.clearSession()),
    );
  }

  /**
   * Exchanges the refresh cookie for a new session. Shared so that several
   * requests failing with 401 at once trigger a single network refresh.
   */
  refresh(): Observable<AuthSession> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.http.post<AuthSession>(this.url('refresh'), {}).pipe(
      tap((session) => this.setSession(session)),
      finalize(() => (this.refreshInFlight = null)),
      shareReplay(1),
    );
    return this.refreshInFlight;
  }

  /**
   * Called once at app boot (APP_INITIALIZER). Tries to restore a session from
   * the refresh cookie; on any failure we simply settle into `anonymous` so the
   * app can boot. Never throws.
   */
  restoreSession(): Observable<boolean> {
    return this.refresh().pipe(
      map(() => true),
      catchError(() => {
        this.clearSession();
        return of(false);
      }),
    );
  }

  private setSession(session: AuthSession): void {
    this._accessToken.set(session.tokens.accessToken);
    this._user.set(session.user);
    this._memberships.set(session.memberships);
    this._status.set('authenticated');
  }

  private clearSession(): void {
    this._accessToken.set(null);
    this._user.set(null);
    this._memberships.set([]);
    this._status.set('anonymous');
  }

  private onAuthFailure(err: unknown): never {
    this._status.set('anonymous');
    throw err;
  }

  private url(path: string): string {
    return `${this.baseUrl}/v1/auth/${path}`;
  }
}
