import {
  Component,
  ElementRef,
  Injectable,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogService } from '../core/catalog.service';
import { CollectionService } from '../core/collection.service';
import { ValuationService } from '../core/valuation.service';
import { ConfidenceBadgeComponent } from '../ui/confidence-badge.component';
import { EurPipe, ThumbPipe } from '../ui/pipes';
import { QtyControlComponent } from '../ui/qty-control.component';

const POR_PAGINA = 60;

/**
 * Estado de los filtros fuera del componente: al abrir una ficha y volver, el
 * catálogo sigue con la misma búsqueda, los mismos filtros y las mismas cartas pintadas.
 */
@Injectable({ providedIn: 'root' })
export class CatalogFiltersState {
  readonly texto = signal('');
  readonly set = signal('');
  readonly rarity = signal('');
  readonly domain = signal('');
  readonly type = signal('');
  readonly soloMias = signal(false);
  readonly limite = signal(POR_PAGINA);

  limpiar(): void {
    this.texto.set('');
    this.set.set('');
    this.rarity.set('');
    this.domain.set('');
    this.type.set('');
    this.soloMias.set(false);
    this.limite.set(POR_PAGINA);
  }
}

@Component({
  selector: 'app-catalog-page',
  imports: [RouterLink, QtyControlComponent, ConfidenceBadgeComponent, EurPipe, ThumbPipe],
  template: `
    <main class="pagina">
      <section class="filtros" aria-label="Filtros">
        <label class="busqueda">
          <span class="sr-only">Buscar</span>
          <input
            type="search"
            placeholder="Nombre o código (p. ej. Jinx o OGN-202)"
            [value]="f.texto()"
            (input)="cambiar(f.texto, $event)"
            autocomplete="off"
          />
        </label>
        <select aria-label="Set" [value]="f.set()" (change)="cambiar(f.set, $event)">
          <option value="">Todos los sets</option>
          @for (s of catalog.sets(); track s.id) {
            <option [value]="s.id">{{ s.name }}</option>
          }
        </select>
        <select aria-label="Rareza" [value]="f.rarity()" (change)="cambiar(f.rarity, $event)">
          <option value="">Cualquier rareza</option>
          @for (r of catalog.rarities(); track r) {
            <option [value]="r">{{ r }}</option>
          }
        </select>
        <select aria-label="Dominio" [value]="f.domain()" (change)="cambiar(f.domain, $event)">
          <option value="">Cualquier dominio</option>
          @for (d of catalog.domains(); track d) {
            <option [value]="d">{{ d }}</option>
          }
        </select>
        <select aria-label="Tipo" [value]="f.type()" (change)="cambiar(f.type, $event)">
          <option value="">Cualquier tipo</option>
          @for (t of catalog.types(); track t) {
            <option [value]="t">{{ t }}</option>
          }
        </select>
        <label class="check">
          <input type="checkbox" [checked]="f.soloMias()" (change)="alternarMias($event)" />
          Solo las que tengo
        </label>
      </section>

      @if (!catalog.loaded()) {
        <p class="muted">Cargando catálogo…</p>
      } @else {
        <p class="resumen muted">
          {{ resultados().length }} {{ resultados().length === 1 ? 'carta' : 'cartas' }}
          @if (hayFiltros()) {
            · <button class="enlace" type="button" (click)="f.limpiar()">Quitar filtros</button>
          }
        </p>

        <ul class="rejilla">
          @for (c of visibles(); track c.cardId) {
            @let p = valuation.pricing(c.cardId);
            <li class="carta" [class.tengo]="col.has(c.cardId)">
              <a [routerLink]="['/carta', c.cardId]" class="enlace-carta">
                <img
                  [src]="c.imgUrl | thumb: 300"
                  [alt]="c.name"
                  [class.horizontal]="c.orientation === 'landscape'"
                  loading="lazy"
                  decoding="async"
                  width="240"
                  height="335"
                />
                <span class="nombre">{{ c.name }}</span>
                <span class="meta">
                  <span class="codigo">{{ c.cardId }}</span>
                  <!-- Si no hay precio normal pero sí foil, se dice: si no, parecería el de la normal. -->
                  <span class="precio">
                    @if (p.normal !== null) {
                      {{ p.normal | eur }}
                    } @else if (p.foil !== null) {
                      <span class="muted">foil</span> {{ p.foil | eur }}
                    } @else {
                      —
                    }
                  </span>
                </span>
                <app-confidence-badge [pricing]="p" />
              </a>
              <app-qty-control [cardId]="c.cardId" />
            </li>
          }
        </ul>

        @if (visibles().length < resultados().length) {
          <div #centinela class="mas">
            <button class="secondary" type="button" (click)="mostrarMas()">
              Mostrar más ({{ resultados().length - visibles().length }} restantes)
            </button>
          </div>
        } @else if (resultados().length === 0) {
          <p class="muted vacio">Ninguna carta coincide con la búsqueda.</p>
        }
      }

      @if (col.error()) {
        <p class="error" role="alert">No se pudo guardar: {{ col.error() }}</p>
      }
    </main>
  `,
  styles: `
    .pagina {
      padding: 12px 16px 48px;
      max-width: 1400px;
      margin: 0 auto;
    }
    .filtros {
      display: grid;
      grid-template-columns: minmax(200px, 2fr) repeat(4, minmax(120px, 1fr)) auto;
      gap: 8px;
      align-items: center;
    }
    .busqueda input {
      width: 100%;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      font-size: 0.9rem;
    }
    .resumen {
      margin: 12px 0;
      font-size: 0.9rem;
    }
    .enlace {
      background: none;
      border: 0;
      padding: 0;
      color: var(--accent);
      font-weight: inherit;
      text-decoration: underline;
    }
    .rejilla {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 12px;
    }
    .carta {
      display: grid;
      gap: 8px;
      align-content: start;
      padding: 8px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
    }
    .carta.tengo {
      border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    }
    .enlace-carta {
      display: grid;
      gap: 4px;
      color: inherit;
      text-decoration: none;
    }
    img {
      width: 100%;
      height: auto;
      aspect-ratio: 744 / 1039;
      object-fit: contain;
      border-radius: 6px;
      background: var(--surface-2);
    }
    .nombre {
      font-weight: 600;
      font-size: 0.9rem;
      line-height: 1.25;
    }
    .meta {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 0.8rem;
    }
    .codigo {
      color: var(--muted);
      font-variant-numeric: tabular-nums;
    }
    .precio {
      font-variant-numeric: tabular-nums;
    }
    .mas {
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .vacio {
      text-align: center;
      padding: 32px;
    }

    @media (max-width: 900px) {
      .filtros {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .busqueda {
        grid-column: 1 / -1;
      }
    }
    @media (max-width: 420px) {
      .rejilla {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .carta {
        padding: 6px;
      }
    }
  `,
})
export class CatalogPage implements OnDestroy {
  protected readonly catalog = inject(CatalogService);
  protected readonly col = inject(CollectionService);
  protected readonly valuation = inject(ValuationService);
  protected readonly f = inject(CatalogFiltersState);

  private readonly centinela = viewChild<ElementRef<HTMLElement>>('centinela');
  private readonly observador =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (entradas) => {
            if (entradas.some((e) => e.isIntersecting)) this.mostrarMas();
          },
          { rootMargin: '600px' },
        );

  protected readonly hayFiltros = computed(
    () =>
      !!(this.f.texto() || this.f.set() || this.f.rarity() || this.f.domain() || this.f.type()) ||
      this.f.soloMias(),
  );

  protected readonly resultados = computed(() => {
    const solo = (v: string) => (v ? [v] : []);
    const cartas = this.catalog.filter({
      texto: this.f.texto(),
      sets: solo(this.f.set()),
      rarities: solo(this.f.rarity()),
      domains: solo(this.f.domain()),
      types: solo(this.f.type()),
    });
    if (!this.f.soloMias()) return cartas;
    const mias = this.col.cards();
    return cartas.filter((c) => mias.has(c.cardId));
  });

  protected readonly visibles = computed(() => this.resultados().slice(0, this.f.limite()));

  constructor() {
    // Carga más cartas al acercarse al final, sin tener que pulsar el botón (que se
    // queda para teclado y lectores de pantalla). El centinela se vuelve a pintar
    // debajo de cada tanda nueva, así que hay que observar siempre el actual.
    effect(() => {
      const el = this.centinela()?.nativeElement;
      this.visibles();
      this.observador?.disconnect();
      if (el) this.observador?.observe(el);
    });
  }

  ngOnDestroy(): void {
    this.observador?.disconnect();
  }

  protected cambiar(destino: { set(v: string): void }, ev: Event): void {
    destino.set((ev.target as HTMLInputElement | HTMLSelectElement).value);
    this.f.limite.set(POR_PAGINA);
  }

  protected alternarMias(ev: Event): void {
    this.f.soloMias.set((ev.target as HTMLInputElement).checked);
    this.f.limite.set(POR_PAGINA);
  }

  protected mostrarMas(): void {
    if (this.visibles().length >= this.resultados().length) return;
    this.f.limite.update((n) => n + POR_PAGINA);
  }
}
