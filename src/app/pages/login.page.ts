import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login-page',
  template: `
    <main class="center">
      <h1 class="marca">Riftbound <span>Tracker</span></h1>

      @switch (auth.access()) {
        @case ('loading') {
          <p class="muted">Cargando…</p>
        }
        @default {
          <p class="muted">Entra con tu cuenta de Google. La primera vez se crea tu colección.</p>
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
  styles: `
    .marca {
      display: grid;
      margin-bottom: 8px;
      font-family: var(--fuente-marca);
      font-weight: 400;
      font-size: clamp(2.2rem, 8vw, 3.2rem);
      line-height: 1.05;
      letter-spacing: 0.08em;
      background: linear-gradient(180deg, #f5dca4, var(--accent-fuerte));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .marca span {
      font-size: 0.42em;
      letter-spacing: 0.4em;
      color: var(--muted);
    }
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
      await this.auth.signIn();
      await this.router.navigateByUrl('/');
    } catch (e) {
      const codigo = (e as { code?: string }).code;
      // Cerrar el popup sin elegir cuenta no es un error que haya que enseñar.
      if (codigo === 'auth/popup-closed-by-user' || codigo === 'auth/cancelled-popup-request')
        return;
      this.error.set(
        codigo === 'auth/popup-blocked'
          ? 'El navegador ha bloqueado la ventana de Google. Permite las ventanas emergentes para este sitio.'
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
