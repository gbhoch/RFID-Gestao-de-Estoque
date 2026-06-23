import { Injectable, signal } from '@angular/core';

type Theme = 'light' | 'dark';
const KEY = 'rfid_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.initial());

  constructor() {
    this.apply(this.theme());
  }

  toggle() {
    const next: Theme = this.theme() === 'light' ? 'dark' : 'light';
    this.theme.set(next);
    this.apply(next);
    try { localStorage.setItem(KEY, next); } catch {}
  }

  private apply(t: Theme) {
    document.documentElement.setAttribute('data-theme', t);
  }

  private initial(): Theme {
    try {
      const saved = localStorage.getItem(KEY) as Theme | null;
      if (saved) return saved;
    } catch {}
    return 'light';
  }
}
