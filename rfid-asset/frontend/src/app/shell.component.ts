import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { DxButtonModule } from 'devextreme-angular';
import { AuthService } from './core/auth/auth.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DxButtonModule],
  template: `
    <div class="layout">
      <header class="topbar">
        <span class="brand">Patrimônio RFID</span>
        <div class="spacer"></div>
        <span class="user">{{ auth.user()?.login }} · {{ auth.user()?.role }}</span>
        <dx-button icon="export" hint="Sair" stylingMode="text"
          (onClick)="auth.logout()"></dx-button>
      </header>
      <div class="body">
        <nav class="sidenav">
          <a routerLink="/dashboard" routerLinkActive="active">Dashboard</a>
          <a routerLink="/assets" routerLinkActive="active">Patrimônios</a>
          <a routerLink="/rfid" routerLinkActive="active">Etiquetas RFID</a>
          <a routerLink="/movements" routerLinkActive="active">Movimentações</a>
          <a routerLink="/inventory" routerLinkActive="active">Inventários</a>
          <a routerLink="/sectors" routerLinkActive="active">Setores</a>
          <a routerLink="/categories" routerLinkActive="active">Categorias</a>
          <a routerLink="/users" routerLinkActive="active">Usuários</a>
          <a routerLink="/reports" routerLinkActive="active">Relatórios</a>
          <a routerLink="/audit" routerLinkActive="active">Auditoria</a>
        </nav>
        <main class="content"><router-outlet></router-outlet></main>
      </div>
    </div>
  `,
  styles: [`
    .layout { height:100vh; display:flex; flex-direction:column; }
    .topbar { height:48px; background:#0078d4; color:#fff; display:flex;
      align-items:center; padding:0 16px; gap:12px; }
    .brand { font-weight:600; }
    .spacer { flex:1; }
    .user { font-size:13px; opacity:.9; }
    .body { flex:1; display:flex; overflow:hidden; }
    .sidenav { width:220px; background:#faf9f8; border-right:1px solid #edebe9;
      padding:8px 0; overflow:auto; }
    .sidenav a { display:block; padding:10px 20px; color:#323130; text-decoration:none;
      font-size:14px; border-left:3px solid transparent; }
    .sidenav a:hover { background:#f3f2f1; }
    .sidenav a.active { background:#eff6fc; border-left-color:#0078d4; font-weight:600; }
    .content { flex:1; padding:24px; overflow:auto; background:#fff; }
  `],
})
export class ShellComponent {
  auth = inject(AuthService);
}
