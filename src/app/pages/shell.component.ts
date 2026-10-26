import { Component, OnInit, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CatalogService } from '../core/catalog.service';
import { CollectionService } from '../core/collection.service';
import { IntercambiablesService } from '../core/intercambiables.service';
import { DescartadasService } from '../core/descartadas.service';
import { MappingOverridesService } from '../core/mapping-overrides.service';
import { PricesService } from '../core/prices.service';
import { TraduccionService } from '../core/traduccion.service';

/** Marco de la app con sesión: barra, navegación y carga de los datos compartidos. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="barra">
      <a class="marca" routerLink="/inicio">Riftbound</a>
      <!-- En móvil esta misma navegación baja a una barra fija con iconos. -->
      <nav aria-label="Secciones">
        <a routerLink="/inicio" routerLinkActive="activo">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 11l8-7 8 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5z" />
          </svg>
          <span>Inicio</span>
        </a>
        <a routerLink="/coleccion" routerLinkActive="activo">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="7" height="9" rx="1.5" />
            <rect x="14" y="4" width="7" height="9" rx="1.5" />
            <rect x="3" y="15" width="18" height="5" rx="1.5" />
          </svg>
          <span class="texto-largo">Mi colección</span><span class="texto-corto">Colección</span>
        </a>
        <a routerLink="/catalogo" routerLinkActive="activo">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" />
          </svg>
          <span>Catálogo</span>
        </a>
        <a routerLink="/escanear" routerLinkActive="activo" class="escanear">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"
            />
            <rect x="8.5" y="7.5" width="7" height="9" rx="1" />
          </svg>
          <span>Escanear</span>
        </a>
        <a routerLink="/deseos" routerLinkActive="activo">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
          </svg>
          <span>Deseos</span>
        </a>
        <a routerLink="/intercambios" routerLinkActive="activo" class="solo-escritorio">
          <span>Intercambios</span>
        </a>
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
    <!-- Hueco para que la barra inferior del móvil no tape el final de la página. -->
    <div class="hueco-barra" aria-hidden="true"></div>
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
      background: linear-gradient(180deg, #091428, #010a13);
      border-bottom: 1px solid transparent;
      border-image: linear-gradient(90deg, transparent, var(--accent-fuerte), transparent) 1;
    }
    .marca {
      font-family: var(--fuente-titulos);
      font-weight: 700;
      font-size: 1.15rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent);
      text-decoration: none;
      text-shadow: 0 0 12px rgb(200 155 60 / 35%);
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
      white-space: nowrap;
      font-family: var(--fuente-titulos);
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      border-bottom: 2px solid transparent;
    }
    nav a:hover {
      color: var(--text);
    }
    nav a.activo {
      color: var(--accent);
      border-bottom-color: var(--accent);
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

    .icono,
    .texto-corto,
    .hueco-barra {
      display: none;
    }

    /* Móvil: arriba solo la marca y Salir; las secciones, en una barra fija abajo. */
    @media (max-width: 700px) {
      .barra {
        gap: 8px;
        padding: 8px 12px;
      }
      .marca {
        flex: 1;
      }
      .nombre {
        display: none;
      }
      nav {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 15;
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 0;
        overflow: visible;
        padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
        background: var(--bg);
        border-top: 1px solid var(--border);
      }
      nav a {
        display: grid;
        justify-items: center;
        gap: 2px;
        padding: 6px 2px;
        font-size: 0.62rem;
        letter-spacing: 0.04em;
        border-bottom: 0;
      }
      nav a.activo {
        background: transparent;
        color: var(--accent);
      }
      .icono {
        display: block;
        width: 24px;
        height: 24px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .texto-largo {
        display: none;
      }
      .texto-corto {
        display: inline;
      }
      nav a.solo-escritorio {
        display: none;
      }
      .hueco-barra {
        display: block;
        height: calc(68px + env(safe-area-inset-bottom));
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
  private readonly descartadas = inject(DescartadasService);
  private readonly intercambiables = inject(IntercambiablesService);
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
    void this.descartadas.load();
    void this.intercambiables.load();
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
