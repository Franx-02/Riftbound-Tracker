import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login-page',
  template: `
    <main class="center">
      <h1>Riftbound Collection</h1>

      @switch (auth.access()) {
        @case ('loading') {
          <p class="muted">Cargando…</p>
        }
        @case ('not-invited') {
          <p>
            <strong>{{ auth.user()?.email }}</strong> no está invitado.
            Pide a quien administra la app que añada tu email.
          </p>
          <button class="secondary" (click)="auth.signOut()">Usar otra cuenta</button>
        }
        @default {
          <p class="muted">Acceso solo por invitación.</p>
          @if (auth.demo) {
            <p class="demo">Modo demo: Firebase aún sin configurar. El botón entra sin cuenta.</p>
          }
          <button (click)="signIn()" [disabled]="busy()">Entrar con Google</button>
        }
      }

      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    </main>
  `,
})
export class LoginPage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  async signIn(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      if ((await this.auth.signIn()) === 'allowed') await this.router.navigateByUrl('/');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }
}
