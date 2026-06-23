import { bootstrapApplication } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';
import { Component } from '@angular/core';
import { appConfig } from './app/app.config';
import 'devextreme/dist/css/dx.material.blue.light.css';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
})
export class AppComponent {}

bootstrapApplication(AppComponent, appConfig).catch((e) => console.error(e));
