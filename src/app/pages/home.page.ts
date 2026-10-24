import { Component, OnInit, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { PricesService } from '../core/prices.service';

/**
 * F1: pantalla de comprobación. Demuestra que el login, la invitación y la función
 * de precios funcionan en producción. En F2 se sustituye por la colección.
 */
@Component({
  selector: 'app-home-page',
  imports: [DatePipe],
  template: `
    <header class="bar">
      <span>Hola, {{ auth.displayName() }}</span>
      <button class="secondary" (click)="logout()">Salir</button>
    </header>

    <main class="stack">
      <section class="card">
        <h2>Estado</h2>
        <ul>
          <li>Login e invitación: <strong class="ok">correctos</strong></li>
          <li>
            Precios de Cardmarket:
            @if (prices.error()) {
              <strong class="error">error ({{ prices.error() }})</strong>
            } @else if (prices.data()) {
              <strong class="ok">{{ productCount() }} productos</strong>,
              actualizado {{ prices.data()!.updatedAt | date: 'dd/MM/yyyy HH:mm' }}
            } @else {
              <span class="muted">cargando…</span>
            }
          </li>
        </ul>
      </section>
    </main>
  `,
})
export class HomePage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly prices = inject(PricesService);
  private readonly router = inject(Router);
  protected readonly productCount = computed(() => Object.keys(this.prices.data()?.prices ?? {}).length);

  ngOnInit(): void {
    void this.prices.load();
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
