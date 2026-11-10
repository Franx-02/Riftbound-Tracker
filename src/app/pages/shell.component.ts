import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { CatalogService } from '../core/catalog.service';
import { CollectionService } from '../core/collection.service';
import { IntercambiablesService } from '../core/intercambiables.service';
import { WishlistService } from '../core/wishlist.service';
import { DescartadasService } from '../core/descartadas.service';
import { MappingOverridesService } from '../core/mapping-overrides.service';
import { PricesService } from '../core/prices.service';
import { TraduccionService } from '../core/traduccion.service';
import { AccionesCartaComponent } from '../ui/acciones-carta.component';
import { IMPORTAR, SECCIONES } from '../ui/secciones';

/** Marco de la app con sesión: barra, navegación y carga de los datos compartidos. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AccionesCartaComponent],
  template: `
    <a class="saltar" href="#contenido">Saltar al contenido</a>
    <header class="barra">
      <a class="marca" routerLink="/inicio">Riftbound <span class="marca-sub">Tracker</span></a>
      <!-- En móvil esta misma navegación baja a una barra fija con iconos: cuatro secciones
           y "Más", que abre el resto en una hoja. Más de cinco botones no caben. -->
      <nav aria-label="Secciones">
        @for (e of enlaces; track e.ruta) {
          <a
            [routerLink]="e.ruta"
            routerLinkActive="activo"
            [class.en-mas]="!e.barra"
            [attr.aria-label]="e.texto"
          >
            <svg class="icono" viewBox="0 0 24 24" aria-hidden="true">
              <path [attr.d]="e.icono" />
            </svg>
            <span class="texto-largo">{{ e.texto }}</span>
            <span class="texto-corto" aria-hidden="true">{{ e.corto ?? e.texto }}</span>
          </a>
        }
        <button
          type="button"
          class="boton-mas"
          [class.activo]="masAbierto() || enSeccionDeMas()"
          aria-haspopup="dialog"
          [attr.aria-expanded]="masAbierto()"
          (click)="masAbierto.set(!masAbierto())"
        >
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 7h14M5 12h14M5 17h14" />
          </svg>
          <span>Más</span>
        </button>
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
        <button type="button" class="secondary salir" (click)="logout()">Salir</button>
      </div>
    </header>

    @if (masAbierto()) {
      <div class="fondo-hoja" (click)="masAbierto.set(false)"></div>
      <section class="hoja" role="dialog" aria-modal="true" aria-label="Más secciones">
        <span class="asa" aria-hidden="true"></span>
        <ul>
          @for (e of enlacesMas; track e.ruta) {
            <li>
              <a [routerLink]="e.ruta" routerLinkActive="activo" (click)="masAbierto.set(false)">
                <svg class="icono" viewBox="0 0 24 24" aria-hidden="true">
                  <path [attr.d]="e.icono" />
                </svg>
                <span>{{ e.texto }}</span>
              </a>
            </li>
          }
        </ul>
        <div class="hoja-pie">
          <span class="nombre-hoja">{{ auth.displayName() }}</span>
          <button type="button" class="secondary" (click)="logout()">Salir</button>
        </div>
      </section>
    }

    @if (errores().length) {
      <div class="avisos" role="alert">
        <ul>
          @for (e of errores(); track e) {
            <li>{{ e }}</li>
          }
        </ul>
        <button type="button" class="secondary" (click)="reintentar()">Reintentar</button>
      </div>
    }

    <div id="contenido" tabindex="-1"><router-outlet /></div>
    <!-- Hueco para que la barra inferior del móvil no tape el final de la página. -->
    <div class="hueco-barra" aria-hidden="true"></div>

    <!-- Una sola hoja de acciones para todas las cartas de la app. -->
    <app-acciones-carta />

    <!-- Los fallos al guardar salen aquí, flotando: al pie de una rejilla de cientos de
         cartas nadie los vería, y el cambio se deshace solo. -->
    @if (falloGuardado(); as f) {
      <div class="tostada" role="alert">
        <span>{{ f }}</span>
        <button type="button" class="secondary" (click)="ocultarFallo()">Entendido</button>
      </div>
    }
  `,
  styles: `
    .saltar {
      position: fixed;
      top: 8px;
      left: 8px;
      z-index: 100;
      padding: 8px 14px;
      border-radius: var(--radio-s);
      background: var(--accent);
      color: #1a1305;
      font-weight: 600;
      text-decoration: none;
      transform: translateY(-200%);
    }
    .saltar:focus {
      transform: none;
    }
    #contenido:focus {
      outline: none;
    }
    .barra {
      position: sticky;
      top: 0;
      z-index: 10;
      /* Con nombre propio queda fuera de la animación de página (solo se anima el contenido). */
      view-transition-name: barra-nav;
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
    nav a,
    .boton-mas {
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
    .avisos {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px 16px;
      margin: 12px 16px 0;
      padding: 10px 12px 10px 16px;
      border-radius: var(--radio);
      background: color-mix(in srgb, var(--error) 10%, var(--surface));
      border: 1px solid color-mix(in srgb, var(--error) 45%, transparent);
      font-size: 0.9rem;
    }
    .avisos ul {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 2px;
    }
    .avisos button {
      padding: 6px 12px;
    }

    .icono {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    nav .icono,
    .texto-corto,
    .boton-mas,
    .hueco-barra {
      display: none;
    }

    .tostada {
      position: fixed;
      left: 50%;
      bottom: calc(var(--alto-nav) + 16px);
      z-index: 60;
      translate: -50% 0;
      width: min(520px, calc(100vw - 24px));
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px 10px 16px;
      border-radius: var(--radio);
      background: color-mix(in srgb, var(--error) 14%, var(--surface-2));
      border: 1px solid color-mix(in srgb, var(--error) 60%, transparent);
      box-shadow: 0 16px 40px rgb(0 0 0 / 55%);
      font-size: 0.9rem;
      animation: sube-tostada 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .tostada button {
      flex-shrink: 0;
      padding: 6px 12px;
    }
    @keyframes sube-tostada {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
    }

    /* Hoja de "Más": solo existe en móvil. */
    .fondo-hoja,
    .hoja {
      display: none;
    }

    /* Móvil: arriba solo la marca; las secciones, en una barra fija abajo. */
    @media (max-width: 700px) {
      /* Sin desenfoque: backdrop-filter haría que la barra fija de abajo se colocara
         respecto a la cabecera en vez de a la pantalla. */
      .barra {
        gap: 8px;
        padding: 10px 14px;
        background: rgb(13 15 19 / 96%);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
      .marca {
        flex: 1;
      }
      .nombre,
      .salir {
        display: none;
      }
      nav {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 15;
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 0;
        overflow: visible;
        height: var(--alto-nav);
        padding: 5px 4px calc(5px + env(safe-area-inset-bottom));
        line-height: 1.2;
        background: rgb(13 15 19 / 88%);
        backdrop-filter: saturate(160%) blur(14px);
        -webkit-backdrop-filter: saturate(160%) blur(14px);
        border-top: 1px solid var(--border);
      }
      nav a,
      .boton-mas {
        display: grid;
        justify-items: center;
        gap: 2px;
        min-width: 0;
        padding: 6px 2px;
        font-size: 0.68rem;
        border-radius: 12px;
      }
      nav a.en-mas {
        display: none;
      }
      .boton-mas {
        background: none;
        border: 0;
        box-shadow: none;
      }
      .boton-mas:hover:not(:disabled) {
        filter: none;
      }
      nav a.activo,
      .boton-mas.activo {
        background: transparent;
        color: var(--accent);
      }
      /* Marca fina encima de la sección en la que estás. */
      nav a.activo::before,
      .boton-mas.activo::before {
        content: '';
        position: absolute;
        top: 0;
        width: 28px;
        height: 2px;
        border-radius: 0 0 2px 2px;
        background: var(--accent);
        box-shadow: 0 0 10px var(--accent);
      }
      nav a,
      .boton-mas {
        position: relative;
      }
      nav .icono {
        display: block;
        width: 24px;
        height: 24px;
      }
      .texto-largo {
        display: none;
      }
      .texto-corto {
        display: inline;
      }
      .hueco-barra {
        display: block;
        height: var(--alto-nav);
      }

      .fondo-hoja {
        display: block;
        position: fixed;
        inset: 0;
        z-index: 50;
        background: rgb(0 0 0 / 55%);
        animation: aparece-fondo 0.2s ease both;
      }
      .hoja {
        display: grid;
        gap: 12px;
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 51;
        padding: 10px 16px calc(16px + env(safe-area-inset-bottom));
        border-radius: 20px 20px 0 0;
        background: var(--surface);
        border: 1px solid var(--border-claro);
        border-bottom: 0;
        box-shadow: 0 -20px 50px rgb(0 0 0 / 55%);
        animation: sube-hoja 0.26s cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }
      .asa {
        justify-self: center;
        width: 36px;
        height: 4px;
        border-radius: 999px;
        background: var(--border-claro);
      }
      .hoja ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .hoja a {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px;
        border-radius: var(--radio);
        background: var(--surface-2);
        border: 1px solid var(--border);
        color: var(--text);
        font-weight: 600;
        text-decoration: none;
      }
      .hoja a.activo {
        border-color: var(--accent);
        color: var(--accent);
      }
      .hoja .icono {
        width: 22px;
        height: 22px;
        flex-shrink: 0;
        stroke: var(--accent);
      }
      .hoja-pie {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--border);
      }
      .nombre-hoja {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--muted);
        font-size: 0.9rem;
      }
    }
    @keyframes aparece-fondo {
      from {
        opacity: 0;
      }
    }
    @keyframes sube-hoja {
      from {
        transform: translateY(24px);
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .hoja,
      .fondo-hoja,
      .tostada {
        animation: none;
      }
    }

    /* Escritorio ancho: barra lateral fija con la marca grande, iconos y una pincelada
       dorada en la sección activa. */
    @media (min-width: 1000px) {
      :host {
        display: block;
        padding-left: 236px;
        /* Las usa el simulador para ocupar justo lo que deja libre la barra. */
        --alto-barra: 0px;
        --ancho-barra: 236px;
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
        overflow-x: visible;
        overflow-y: auto;
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
      nav .icono {
        display: block;
        width: 24px;
        height: 24px;
        flex-shrink: 0;
        stroke: var(--accent);
        stroke-width: 1.7;
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
      .tostada {
        left: calc(50% + 118px);
      }
    }
  `,
  host: { '(document:keydown.escape)': 'masAbierto.set(false)' },
})
export class ShellComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogService);
  private readonly prices = inject(PricesService);
  private readonly overrides = inject(MappingOverridesService);
  private readonly collection = inject(CollectionService);
  private readonly traduccion = inject(TraduccionService);
  private readonly descartadas = inject(DescartadasService);
  private readonly wish = inject(WishlistService);
  private readonly intercambiables = inject(IntercambiablesService);
  private readonly router = inject(Router);

  protected readonly enlaces = SECCIONES;
  protected readonly enlacesMas = [...SECCIONES.filter((e) => !e.barra), IMPORTAR];
  /** Hoja de "Más" de la barra inferior del móvil. */
  protected readonly masAbierto = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  /** Estás en una sección que en móvil vive dentro de "Más": el botón se marca como activo. */
  protected readonly enSeccionDeMas = computed(() =>
    this.enlacesMas.some((e) => this.url().startsWith(e.ruta)),
  );

  /**
   * El último fallo al guardar (copias, deseos, "no la quiero", "para cambiar"). Los
   * servicios deshacen el cambio solos; esto solo lo cuenta.
   */
  private readonly falloActual = computed(
    () =>
      (this.collection.uid() ? this.collection.error() : null) ??
      (this.wish.editable() ? this.wish.error() : null) ??
      (this.descartadas.lista() ? this.descartadas.error() : null) ??
      (this.intercambiables.lista() ? this.intercambiables.error() : null),
  );
  private readonly falloOculto = signal<string | null>(null);
  protected readonly falloGuardado = computed(() => {
    const f = this.falloActual();
    return f && f !== this.falloOculto() ? `No se pudo guardar: ${f}` : null;
  });

  constructor() {
    // Si el fallo desaparece (el siguiente guardado va bien), el aviso vuelve a poder salir.
    effect(() => {
      if (!this.falloActual()) this.falloOculto.set(null);
    });
  }

  protected ocultarFallo(): void {
    this.falloOculto.set(this.falloActual());
  }

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

  /** Vuelve a pedir lo que falló (cada servicio no repite lo que ya tiene cargado). */
  protected reintentar(): void {
    this.ngOnInit();
  }

  ngOnInit(): void {
    void this.catalog.load();
    void this.prices.load();
    void this.overrides.load();
    void this.collection.loadMine();
    void this.traduccion.load();
    void this.descartadas.load();
    void this.wish.load();
    void this.intercambiables.load();
  }

  async logout(): Promise<void> {
    this.masAbierto.set(false);
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
