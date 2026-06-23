import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { ThemeService } from './core/theme.service';

interface NavItem {
  label: string;
  route?: string;     // se ausente → "em breve" (desabilitado, não quebra o router)
  icon: string;       // path do SVG (d)
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="layout" [class.collapsed]="collapsed()">
      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="logo">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M4 8c4.5-3 11.5-3 16 0M6.5 11.5c3-2 8-2 11 0M9 15c1.5-1 4.5-1 6 0"
              stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            <circle cx="12" cy="18.5" r="1.4" fill="currentColor"/>
          </svg>
          <span class="logo-text">RFID Patrimônio</span>
        </div>

        <nav>
          @for (group of nav; track group.section) {
            <div class="nav-section">
              <span class="nav-label">{{ group.section }}</span>
              @for (item of group.items; track item.label) {
                @if (item.route) {
                  <a [routerLink]="item.route" routerLinkActive="active"
                     class="nav-item" [title]="item.label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                      <path [attr.d]="item.icon"></path>
                    </svg>
                    <span class="nav-text">{{ item.label }}</span>
                  </a>
                } @else {
                  <span class="nav-item disabled" [title]="item.label + ' — em breve'">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                      <path [attr.d]="item.icon"></path>
                    </svg>
                    <span class="nav-text">{{ item.label }}</span>
                    <span class="soon">em breve</span>
                  </span>
                }
              }
            </div>
          }
        </nav>
      </aside>

      <!-- Conteúdo -->
      <div class="main">
        <header class="topbar">
          <button class="icon-btn" (click)="collapsed.set(!collapsed())" title="Recolher menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>

          <div class="spacer"></div>

          <button class="icon-btn" (click)="theme.toggle()"
            [title]="theme.theme() === 'light' ? 'Tema escuro' : 'Tema claro'">
            @if (theme.theme() === 'light') {
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
            } @else {
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2
                M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4"/></svg>
            }
          </button>

          <div class="user">
            <div class="avatar">{{ initials() }}</div>
            <div class="user-meta">
              <span class="user-name">{{ auth.user()?.login || 'Usuário' }}</span>
              <span class="user-role">{{ roleLabel() }}</span>
            </div>
            <button class="icon-btn" (click)="auth.logout()" title="Sair">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            </button>
          </div>
        </header>

        <main class="content"><router-outlet></router-outlet></main>
      </div>
    </div>
  `,
  styles: [`
    .layout {
      display: grid;
      grid-template-columns: var(--sidebar-w) 1fr;
      height: 100vh;
      transition: grid-template-columns .18s ease;
    }
    .layout.collapsed { grid-template-columns: 68px 1fr; }

    /* ---- Sidebar ---- */
    .sidebar {
      background: var(--surface);
      border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
      overflow: hidden;
    }
    .logo {
      display: flex; align-items: center; gap: 11px;
      height: var(--topbar-h); padding: 0 20px;
      color: var(--brand-600); font-weight: 680; font-size: 15.5px;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    nav { padding: 14px 12px; overflow-y: auto; flex: 1; }
    .nav-section { margin-bottom: 18px; }
    .nav-label {
      display: block; padding: 0 10px 6px;
      font-size: 11px; font-weight: 700; letter-spacing: .07em;
      text-transform: uppercase; color: var(--text-faint);
    }
    .collapsed .nav-label, .collapsed .nav-text,
    .collapsed .logo-text, .collapsed .soon { display: none; }

    .nav-item {
      display: flex; align-items: center; gap: 12px;
      padding: 9px 10px; margin-bottom: 2px;
      border-radius: var(--radius-sm);
      color: var(--text-soft); font-size: 14px; font-weight: 500;
      cursor: pointer; transition: background .12s, color .12s;
      white-space: nowrap;
    }
    .nav-item svg { width: 19px; height: 19px; flex: none; }
    .nav-item:hover:not(.disabled) { background: var(--surface-2); color: var(--text); }
    .nav-item.active {
      background: var(--brand-50); color: var(--brand-600); font-weight: 600;
    }
    .nav-item.disabled { opacity: .5; cursor: not-allowed; }
    .soon {
      margin-left: auto; font-size: 10px; font-weight: 600;
      background: var(--surface-2); color: var(--text-faint);
      padding: 2px 7px; border-radius: 999px;
    }

    /* ---- Main ---- */
    .main { display: flex; flex-direction: column; overflow: hidden; }
    .topbar {
      height: var(--topbar-h); flex: none;
      display: flex; align-items: center; gap: 8px;
      padding: 0 20px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }
    .spacer { flex: 1; }
    .icon-btn {
      display: grid; place-items: center;
      width: 38px; height: 38px;
      border: none; background: none; cursor: pointer;
      color: var(--text-soft); border-radius: var(--radius-sm);
      transition: background .12s, color .12s;
    }
    .icon-btn svg { width: 19px; height: 19px; }
    .icon-btn:hover { background: var(--surface-2); color: var(--text); }

    .user {
      display: flex; align-items: center; gap: 10px;
      padding-left: 8px; margin-left: 6px;
      border-left: 1px solid var(--border);
    }
    .avatar {
      width: 34px; height: 34px; border-radius: 50%;
      display: grid; place-items: center;
      background: var(--brand-600); color: #fff;
      font-size: 13px; font-weight: 650;
    }
    .user-meta { display: flex; flex-direction: column; line-height: 1.25; }
    .user-name { font-size: 13.5px; font-weight: 600; color: var(--text); }
    .user-role { font-size: 11.5px; color: var(--text-faint); }

    .content {
      flex: 1; overflow-y: auto;
      padding: 28px 32px;
      background: var(--bg);
    }

    @media (max-width: 720px) {
      .user-meta { display: none; }
      .content { padding: 18px; }
    }
  `],
})
export class ShellComponent {
  auth = inject(AuthService);
  theme = inject(ThemeService);
  collapsed = signal(false);

  // Apenas rotas implementadas têm `route`; as demais ficam desabilitadas
  // (não quebram o router e sinalizam "em breve").
  nav = [
    {
      section: 'Visão geral',
      items: [
        { label: 'Dashboard', route: '/dashboard', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
      ] as NavItem[],
    },
    {
      section: 'Operação',
      items: [
        { label: 'Patrimônios', route: '/assets', icon: 'M20 7 12 3 4 7m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
        { label: 'Etiquetas RFID', route: '/rfid', icon: 'M4 9V6a2 2 0 0 1 2-2h3M4 15v3a2 2 0 0 0 2 2h3m6-16h3a2 2 0 0 1 2 2v3m0 6v3a2 2 0 0 1-2 2h-3M9 9h.01M9 13a3 3 0 0 1 6 0' },
        { label: 'Inventário', route: '/inventory', icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 7 2 2 4-4' },
        { label: 'Movimentações', route: '/movements', icon: 'M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3' },
      ] as NavItem[],
    },
    {
      section: 'Cadastros',
      items: [
        { label: 'Setores', route: '/sectors', icon: 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4' },
        { label: 'Categorias', route: '/categories', icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z' },
        { label: 'Usuários', route: '/users', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
      ] as NavItem[],
    },
    {
      section: 'Governança',
      items: [
        { label: 'Relatórios', icon: 'M9 17v-6M12 17v-4M15 17v-2M4 4h16v16H4z' },
        { label: 'Auditoria', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 15l2 2 4-4' },
      ] as NavItem[],
    },
  ];

  initials() {
    const l = this.auth.user()?.login ?? 'U';
    return l.slice(0, 2).toUpperCase();
  }
  roleLabel() {
    const map: Record<string, string> = {
      admin: 'Administrador', manager: 'Gestor',
      operator: 'Operador', auditor: 'Auditor',
    };
    const r = this.auth.user()?.role ?? '';
    return map[r] ?? r ?? '—';
  }
}
