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
      <a class="marca" routerLink="/inicio">Riftbound <span class="marca-sub">Tracker</span></a>
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
        <a routerLink="/mazos" routerLinkActive="activo" class="solo-escritorio">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="7" y="3" width="12" height="16" rx="1.5" />
            <path d="M4 7v12.5A1.5 1.5 0 0 0 5.5 21H15" />
          </svg>
          <span>Mazos</span>
        </a>
        <a routerLink="/intercambios" routerLinkActive="activo" class="solo-escritorio">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 8h13l-3-3M20 16H7l3 3" />
          </svg>
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
      padding: 10px 20px;
      background: rgb(13 15 19 / 72%);
      backdrop-filter: saturate(160%) blur(14px);
      -webkit-backdrop-filter: saturate(160%) blur(14px);
      border-bottom: 1px solid var(--border);
    }
    .marca {
      font-family: var(--fuente-marca);
      font-weight: 400;
      font-size: 1.15rem;
      letter-spacing: 0.12em;
      white-space: nowrap;
      text-transform: uppercase;
      text-decoration: none;
      background: linear-gradient(180deg, #f5dca4, var(--accent-fuerte));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .marca-sub {
      font-size: 0.72em;
      letter-spacing: 0.28em;
      color: var(--muted);
    }
    nav {
      display: flex;
      gap: 2px;
      flex: 1;
      min-width: 0;
      overflow-x: auto;
      scrollbar-width: none;
    }
    nav a {
      color: var(--muted);
      text-decoration: none;
      padding: 7px 12px;
      white-space: nowrap;
      font-size: 0.9rem;
      font-weight: 500;
      border-radius: 999px;
      transition:
        color 0.15s ease,
        background-color 0.15s ease;
    }
    nav a:hover {
      color: var(--text);
      background: rgb(255 255 255 / 5%);
    }
    nav a.activo {
      color: var(--accent);
      background: var(--accent-suave);
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
      /* Sin desenfoque: backdrop-filter haría que la barra fija de abajo se colocara
         respecto a la cabecera en vez de a la pantalla. */
      .barra {
        gap: 8px;
        padding: 8px 12px;
        background: rgb(13 15 19 / 96%);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
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
        background: rgb(13 15 19 / 82%);
        backdrop-filter: saturate(160%) blur(14px);
        -webkit-backdrop-filter: saturate(160%) blur(14px);
        border-top: 1px solid var(--border);
      }
      nav a {
        display: grid;
        justify-items: center;
        gap: 2px;
        padding: 6px 2px;
        font-size: 0.68rem;
        border-radius: 12px;
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

    /* Escritorio ancho: barra lateral fija con la marca grande, iconos y una pincelada
       dorada en la sección activa. */
    @media (min-width: 1000px) {
      :host {
        display: block;
        padding-left: 236px;
      }
      .barra {
        position: fixed;
        inset: 0 auto 0 0;
        width: 236px;
        flex-direction: column;
        align-items: stretch;
        gap: 28px;
        padding: 28px 16px 20px;
        border-bottom: 0;
        border-right: 1px solid var(--border);
        background:
          radial-gradient(260px 300px at 0% 100%, rgb(168 85 247 / 10%), transparent 70%),
          linear-gradient(180deg, #12151b, #0b0d11);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
      .marca {
        display: grid;
        font-size: 1.75rem;
        line-height: 1.05;
        letter-spacing: 0.08em;
        padding: 0 8px;
        filter: drop-shadow(0 2px 10px rgb(245 184 28 / 25%));
      }
      nav {
        flex-direction: column;
        flex: 1;
        gap: 4px;
        overflow: visible;
      }
      nav a {
        position: relative;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 11px 14px;
        font-size: 1rem;
        border-radius: 10px;
        isolation: isolate;
      }
      nav a.activo {
        color: #1a1305;
        font-weight: 600;
        background: transparent;
      }
      /* Pincelada: un degradado dorado con el borde derecho "roto". */
      nav a.activo::before {
        content: '';
        position: absolute;
        inset: 2px -10px 2px -4px;
        z-index: -1;
        background: linear-gradient(90deg, #f7d77a, var(--accent-fuerte) 70%, transparent);
        clip-path: polygon(0 8%, 4% 0, 92% 4%, 100% 30%, 94% 52%, 100% 76%, 90% 100%, 3% 94%);
        filter: drop-shadow(0 4px 12px rgb(245 184 28 / 35%));
      }
      nav a.activo .icono {
        stroke: #1a1305;
      }
      .icono {
        display: block;
        width: 24px;
        height: 24px;
        flex-shrink: 0;
        fill: none;
        stroke: var(--accent);
        stroke-width: 1.7;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .usuario {
        flex-wrap: wrap;
        padding: 14px 8px 0;
        border-top: 1px solid var(--border);
      }
      .nombre {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
    // Sin cargar, el botón "Para cambiar" no sale: mejor decir por qué.
    if (this.intercambiables.error() && !this.intercambiables.lista())
      e.push(this.intercambiables.error()!);
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
