import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  standalone: true,
  template: `
    <div class="ph">
      <h1 class="page-title">{{ title }}</h1>
      @if (subtitle) { <p class="page-sub">{{ subtitle }}</p> }
    </div>
  `,
  styles: [`.ph { margin-bottom: 4px; }`],
})
export class PageHeaderComponent {
  @Input({ required: true }) title = '';
  @Input() subtitle = '';
}
