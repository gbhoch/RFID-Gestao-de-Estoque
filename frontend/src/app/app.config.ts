import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, Routes } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { authInterceptor, authGuard } from './core/interceptors/auth.interceptor';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent) },
  {
    path: '',
    loadComponent: () => import('./shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent) },
      { path: 'assets', loadComponent: () => import('./features/assets/assets.component').then((m) => m.AssetsComponent) },
      { path: 'rfid', loadComponent: () => import('./features/rfid-tags/rfid-tags.component').then((m) => m.RfidTagsComponent) },
      { path: 'movements', loadComponent: () => import('./features/movements/movements.component').then((m) => m.MovementsComponent) },
      { path: 'inventory', loadComponent: () => import('./features/inventory/inventory.component').then((m) => m.InventoryComponent) },
      { path: 'sectors', loadComponent: () => import('./features/sectors/sectors.component').then((m) => m.SectorsComponent) },
      { path: 'categories', loadComponent: () => import('./features/categories/categories.component').then((m) => m.CategoriesComponent) },
      { path: 'users', loadComponent: () => import('./features/users/users.component').then((m) => m.UsersComponent) },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '' },
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimations(),
  ],
};
