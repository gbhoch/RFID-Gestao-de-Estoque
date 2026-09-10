import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';
import { Component, inject } from '@angular/core';
import { appConfig } from './app/app.config';
import { ThemeService } from './app/core/theme.service';
import { setupDevExtremeLocale } from './app/core/devextreme-locale';

// Antes do bootstrap: os widgets leem o dicionário na hora em que são criados.
setupDevExtremeLocale();

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
})
export class AppComponent {
  private theme = inject(ThemeService);
}

bootstrapApplication(AppComponent, appConfig).catch((e) => console.error(e));
