import { Component, OnInit, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CatalogService } from '../core/catalog.service';
import { CollectionService } from '../core/collection.service';
import { MappingOverridesService } from '../core/mapping-overrides.service';
import { PricesService } from '../core/prices.service';
import { TraduccionService } from '../core/traduccion.service';

/** Marco de la app con sesión: barra, navegación y carga de los datos compartidos. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="barra">
      <a class="marca" routerLink="/coleccion">Riftbound</a>
      <nav>
        <a routerLink="/coleccion" routerLinkActive="activo">Mi colección</a>
        <a routerLink="/catalogo" routerLinkActive="activo">Catálogo</a>
      </nav>
      <div class="usuario">
        @if (auth.demo) {
          <span
            class="badge-demo"
            title="Firebase sin configurar: los datos se guardan en este navegador"
            >demo</span
          >
        }
        <span class="nombre">{{ auth.displayName() }}</span>
        <button class="secondary salir" (click)="logout()">Salir</button>
      </div>
    </header>

    @for (e of errores(); track e) {
      <p class="aviso error" role="alert">{{ e }}</p>
    }

    <router-outlet />
  `,
  styles: `
    .barra {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 8px 16px;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
    }
    .marca {
      font-weight: 700;
      color: var(--text);
      text-decoration: none;
    }
    nav {
      display: flex;
      gap: 4px;
      flex: 1;
      min-width: 0;
      overflow-x: auto;
      scrollbar-width: none;
    }
    nav a {
      color: var(--muted);
      text-decoration: none;
      padding: 6px 10px;
      border-radius: 8px;
      white-space: nowrap;
    }
    nav a.activo {
      color: var(--text);
      background: var(--surface-2);
    }
    .usuario {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .nombre {
      color: var(--muted);
      font-size: 0.9rem;
    }
    .salir {
      padding: 6px 12px;
    }
    .aviso {
      margin: 8px 16px;
    }

    @media (max-width: 600px) {
      .barra {
        gap: 8px;
        padding: 8px 12px;
      }
      .marca,
      .nombre {
        display: none;
      }
      nav a {
        padding: 6px 8px;
      }
    }
  `,
})
export class ShellComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogService);
  private readonly prices = inject(PricesService);
  private readonly overrides = inject(MappingOverridesService);
  private readonly collection = inject(CollectionService);
  private readonly traduccion = inject(TraduccionService);
  private readonly router = inject(Router);

  /** Lo que impide usar la app, en una frase. Los errores de guardado los enseña cada pantalla. */
  protected readonly errores = computed(() => {
    const e: string[] = [];
    if (this.catalog.error()) e.push(`No se pudo cargar el catálogo: ${this.catalog.error()}`);
    if (this.prices.error())
      e.push(`No se pudieron cargar los precios de Cardmarket: ${this.prices.error()}`);
    if (this.overrides.error())
      e.push(`No se pudieron cargar las correcciones de precio: ${this.overrides.error()}`);
    return e;
  });

  ngOnInit(): void {
    void this.catalog.load();
    void this.prices.load();
    void this.overrides.load();
    void this.collection.loadMine();
    void this.traduccion.load();
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
