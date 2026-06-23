import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DxFormModule, DxButtonModule } from 'devextreme-angular';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [DxFormModule, DxButtonModule],
  template: `
    <div class="login-wrap">
      <div class="login-card">
        <h1>Gestão Patrimonial RFID</h1>
        <p class="subtitle">Acesse com suas credenciais corporativas</p>
        <dx-form [(formData)]="formData">
          <dxi-item dataField="login" [label]="{ text: 'Login' }"
            [editorOptions]="{ stylingMode: 'filled' }"></dxi-item>
          <dxi-item dataField="password" [label]="{ text: 'Senha' }"
            [editorOptions]="{ mode: 'password', stylingMode: 'filled' }"></dxi-item>
        </dx-form>
        @if (error()) { <div class="error">{{ error() }}</div> }
        <dx-button text="Entrar" type="default" width="100%"
          [disabled]="loading()" (onClick)="submit()"></dx-button>
      </div>
    </div>
  `,
  styles: [`
    .login-wrap { display:flex; align-items:center; justify-content:center;
      min-height:100vh; background:#f3f2f1; }
    .login-card { background:#fff; padding:40px; border-radius:8px; width:360px;
      box-shadow:0 2px 12px rgba(0,0,0,.08); }
    h1 { font-size:20px; margin:0 0 4px; color:#201f1e; }
    .subtitle { color:#605e5c; font-size:13px; margin:0 0 24px; }
    .error { color:#a4262c; font-size:13px; margin:12px 0; }
    dx-button { margin-top:20px; }
  `],
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  formData: { login: string; password: string } = { login: '', password: '' };
  loading = signal(false);
  error = signal('');

  submit() {
    this.loading.set(true);
    this.error.set('');
    this.auth.login(this.formData.login, this.formData.password).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: () => { this.error.set('Credenciais inválidas ou conta bloqueada'); this.loading.set(false); },
    });
  }
}
