import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="auth">
      <!-- Painel de marca -->
      <aside class="brand-panel">
        <div class="brand-mark">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
            <path d="M4 8c4.5-3 11.5-3 16 0M6.5 11.5c3-2 8-2 11 0M9 15c1.5-1 4.5-1 6 0"
              stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <circle cx="12" cy="18.5" r="1.4" fill="currentColor"/>
          </svg>
          <span>RFID Patrimônio</span>
        </div>

        <div class="brand-copy">
          <h1>Controle de ativos<br>com precisão de etiqueta.</h1>
          <p>Rastreie, inventarie e audite cada patrimônio da planta em tempo real.</p>
        </div>

        <ul class="brand-points">
          <li>Inventário por leitura RFID</li>
          <li>Histórico completo de movimentações</li>
          <li>Auditoria de cada operação</li>
        </ul>
      </aside>

      <!-- Formulário -->
      <main class="form-panel">
        <div class="form-box">
          <header>
            <h2>Acessar o sistema</h2>
            <p>Entre com suas credenciais corporativas.</p>
          </header>

          <label class="field">
            <span>Login</span>
            <input type="text" [(ngModel)]="login" autocomplete="username"
              placeholder="seu.usuario" (keyup.enter)="submit()" />
          </label>

          <label class="field">
            <span>Senha</span>
            <div class="pwd">
              <input [type]="showPwd() ? 'text' : 'password'" [(ngModel)]="password"
                autocomplete="current-password" placeholder="••••••••"
                (keyup.enter)="submit()" />
              <button type="button" class="ghost" (click)="showPwd.set(!showPwd())"
                [attr.aria-label]="showPwd() ? 'Ocultar senha' : 'Mostrar senha'">
                {{ showPwd() ? 'Ocultar' : 'Mostrar' }}
              </button>
            </div>
          </label>

          @if (error()) {
            <div class="alert" role="alert">{{ error() }}</div>
          }

          <button class="primary" [disabled]="loading()" (click)="submit()">
            {{ loading() ? 'Entrando…' : 'Entrar' }}
          </button>

          <p class="hint">Esqueceu a senha? Procure o administrador do sistema.</p>
        </div>
      </main>
    </div>
  `,
  styles: [`
    .auth {
      display: grid;
      grid-template-columns: 1.05fr 1fr;
      min-height: 100vh;
      background: var(--bg);
    }

    /* ---- Painel de marca ---- */
    .brand-panel {
      position: relative;
      padding: 48px 56px;
      color: #eafaf7;
      background:
        radial-gradient(120% 120% at 0% 0%, var(--brand-700) 0%, var(--brand-900) 70%);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }
    .brand-panel::after {
      content: '';
      position: absolute;
      inset: 0;
      background:
        repeating-linear-gradient(115deg, transparent 0 28px, rgba(255,255,255,.025) 28px 29px);
      pointer-events: none;
    }
    .brand-mark {
      display: flex; align-items: center; gap: 12px;
      font-weight: 650; font-size: 17px; letter-spacing: -.01em;
      color: var(--brand-300);
      z-index: 1;
    }
    .brand-copy { z-index: 1; }
    .brand-copy h1 {
      color: #ffffff;
      font-size: 34px;
      line-height: 1.18;
      letter-spacing: -.025em;
      font-weight: 680;
    }
    .brand-copy p {
      margin-top: 16px;
      max-width: 30ch;
      color: rgba(234,250,247,.72);
      font-size: 15px;
      line-height: 1.55;
    }
    .brand-points {
      list-style: none; padding: 0; margin: 0; z-index: 1;
      display: flex; flex-direction: column; gap: 12px;
    }
    .brand-points li {
      display: flex; align-items: center; gap: 12px;
      color: rgba(234,250,247,.85); font-size: 14px;
    }
    .brand-points li::before {
      content: '';
      width: 18px; height: 18px; flex: none;
      border-radius: 50%;
      background:
        var(--brand-400)
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2306302b' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E")
        center / 11px no-repeat;
    }

    /* ---- Formulário ---- */
    .form-panel {
      display: flex; align-items: center; justify-content: center;
      padding: 40px;
    }
    .form-box { width: 100%; max-width: 360px; }
    .form-box header { margin-bottom: 28px; }
    .form-box h2 { font-size: 24px; }
    .form-box header p { margin-top: 6px; color: var(--text-soft); font-size: 14px; }

    .field { display: block; margin-bottom: 18px; }
    .field > span {
      display: block; margin-bottom: 7px;
      font-size: 13px; font-weight: 600; color: var(--text-soft);
    }
    .field input {
      width: 100%;
      padding: 12px 14px;
      font-size: 15px;
      color: var(--text);
      background: var(--surface);
      border: 1.5px solid var(--border-strong);
      border-radius: var(--radius-sm);
      transition: border-color .15s, box-shadow .15s;
    }
    .field input::placeholder { color: var(--text-faint); }
    .field input:focus {
      outline: none;
      border-color: var(--brand-600);
      box-shadow: 0 0 0 3px var(--brand-100);
    }
    .pwd { position: relative; }
    .pwd .ghost {
      position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
      border: none; background: none; cursor: pointer;
      color: var(--brand-600); font-size: 12.5px; font-weight: 600;
      padding: 6px 8px; border-radius: var(--radius-sm);
    }
    .pwd .ghost:hover { background: var(--brand-50); }

    .alert {
      background: rgba(192,67,47,.10);
      color: var(--danger);
      border: 1px solid rgba(192,67,47,.25);
      border-radius: var(--radius-sm);
      padding: 11px 14px;
      font-size: 13.5px;
      margin-bottom: 18px;
    }

    .primary {
      width: 100%;
      padding: 13px;
      font-size: 15px; font-weight: 600;
      color: #fff;
      background: var(--brand-600);
      border: none;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: background .15s, transform .05s;
    }
    .primary:hover:not(:disabled) { background: var(--brand-700); }
    .primary:active:not(:disabled) { transform: translateY(1px); }
    .primary:disabled { opacity: .6; cursor: default; }

    .hint { margin-top: 18px; text-align: center; font-size: 13px; color: var(--text-faint); }

    @media (max-width: 860px) {
      .auth { grid-template-columns: 1fr; }
      .brand-panel { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .field input, .primary { transition: none; }
    }
  `],
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  login = '';
  password = '';
  showPwd = signal(false);
  loading = signal(false);
  error = signal('');

  submit() {
    if (this.loading()) return;
    if (!this.login || !this.password) {
      this.error.set('Preencha login e senha para continuar.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.auth.login(this.login, this.password).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (e) => {
        this.error.set(
          e?.status === 0
            ? 'Sem conexão com o servidor. Verifique se a API está no ar.'
            : 'Login ou senha incorretos.',
        );
        this.loading.set(false);
      },
    });
  }
}
