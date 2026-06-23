import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: { id: string; login: string; role: string; permissions: string[] } | null;
}
const STORAGE_KEY = 'rfid_auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private state = signal<AuthState>(this.load());

  readonly user = computed(() => this.state().user);
  readonly isAuthenticated = computed(() => !!this.state().accessToken);
  readonly permissions = computed(() => this.state().user?.permissions ?? []);

  accessToken(): string | null { return this.state().accessToken; }
  refreshTokenValue(): string | null { return this.state().refreshToken; }

  hasPermission(code: string): boolean {
    const p = this.permissions();
    return p.includes('*') || p.includes(code);
  }

  login(login: string, password: string) {
    return this.http
      .post<{ accessToken: string; refreshToken: string }>(
        `${environment.apiUrl}/auth/login`, { login, password })
      .pipe(tap((res) => this.persistTokens(res.accessToken, res.refreshToken)));
  }

  refresh() {
    return this.http
      .post<{ accessToken: string; refreshToken: string }>(
        `${environment.apiUrl}/auth/refresh`, { refreshToken: this.refreshTokenValue() })
      .pipe(tap((res) => this.persistTokens(res.accessToken, res.refreshToken)));
  }

  loadProfile() {
    return this.http.get<AuthState['user']>(`${environment.apiUrl}/auth/me`)
      .pipe(tap((user) => this.state.update((s) => ({ ...s, user }))));
  }

  logout() {
    const rt = this.refreshTokenValue();
    if (rt) this.http.post(`${environment.apiUrl}/auth/logout`, { refreshToken: rt }).subscribe({ error: () => {} });
    this.state.set({ accessToken: null, refreshToken: null, user: null });
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    this.router.navigate(['/login']);
  }

  private persistTokens(accessToken: string, refreshToken: string) {
    this.state.update((s) => ({ ...s, accessToken, refreshToken }));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken, refreshToken })); } catch {}
    this.loadProfile().subscribe({ error: () => {} });
  }

  private load(): AuthState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { accessToken, refreshToken } = JSON.parse(raw);
        return { accessToken, refreshToken, user: null };
      }
    } catch {}
    return { accessToken: null, refreshToken: null, user: null };
  }
}
