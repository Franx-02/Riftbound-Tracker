import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CatalogCard, CatalogService } from '../core/catalog.service';
import { CollectionService } from '../core/collection.service';
import { UsersService } from '../core/users.service';
import { ValuationService } from '../core/valuation.service';
import {
  MAX_DESEO,
  MAX_NOTA,
  Poseedor,
  WishEntry,
  WishlistService,
  faltan,
  quienTiene,
} from '../core/wishlist.service';
import { EurPipe, ThumbPipe } from '../ui/pipes';

interface Fila {
  cardId: string;
  /** undefined si la carta ya no está en el catálogo. */
  card: CatalogCard | undefined;
  entry: WishEntry;
  tienes: number;
  faltan: number;
  /** Tendencia normal; si no la hay, la foil. null = sin precio. */
  precio: number | null;
}

/** Lista de deseos: lo que quieres, cuánto cuesta lo que falta y quién del grupo lo tiene. */
@Component({
  selector: 'app-wishlist-page',
  imports: [RouterLink, EurPipe, ThumbPipe],
  template: `
    <main class="pagina">
      <header class="cabecera">
        <h1>Lista de deseos</h1>
      </header>

      @if (wish.error()) {
        <p class="error" role="alert">{{ wish.error() }}</p>
      }

      <section class="resumen">
        <div class="cifra principal">
          <span class="etiqueta">Coste de lo que falta</span>
          <span class="numero">{{ resumen().coste | eur: '—' }}</span>
          @if (resumen().sinPrecio) {
            <span class="muted pie">
              Sin contar {{ resumen().sinPrecio }}
              {{ resumen().sinPrecio === 1 ? 'carta sin precio' : 'cartas sin precio' }}
            </span>
          }
        </div>
        <div class="cifra">
          <span class="etiqueta">Cartas en la lista</span>
          <span class="numero">{{ filas().length }}</span>
        </div>
        <div class="cifra">
          <span class="etiqueta">Copias que faltan</span>
          <span class="numero">{{ resumen().copias }}</span>
        </div>
      </section>

      <section class="anadir">
        <label for="buscar-deseo">Añadir una carta</label>
        <input
          id="buscar-deseo"
          type="search"
          placeholder="Nombre o código (OGN-001)"
          autocomplete="off"
          [value]="texto()"
          (input)="texto.set($any($event.target).value)"
        />
        @if (resultados().length) {
          <ul class="resultados">
            @for (c of resultados(); track c.cardId) {
              <li>
                <span>
                  {{ c.name }} <span class="muted">· {{ c.cardId }}</span>
                </span>
                @if (wish.get(c.cardId)) {
                  <span class="muted">Ya está</span>
                } @else {
                  <button type="button" class="secondary" (click)="anadir(c.cardId)">Añadir</button>
                }
              </li>
            }
          </ul>
        } @else if (texto().trim().length >= 2) {
          <p class="muted">No hay cartas con ese nombre o código.</p>
        }
      </section>

      <section class="grupo">
        <p class="muted">
          Para saber quién tiene copias hay que leer la colección de los demás: cuesta una lectura
          de Firebase por carta de cada persona, así que solo se hace cuando lo pides.
        </p>
        <button
          type="button"
          class="secondary"
          [disabled]="buscando() || !filas().length"
          (click)="buscarQuienTiene()"
        >
          {{
            buscando()
              ? 'Buscando…'
              : buscado()
                ? 'Volver a buscar quién las tiene'
                : 'Buscar quién las tiene'
          }}
        </button>
        @if (buscado() && !buscando()) {
          <span class="muted"
            >{{ otros().length }}
            {{ otros().length === 1 ? 'colección revisada' : 'colecciones revisadas' }}</span
          >
        }
      </section>

      @if (wish.loading()) {
        <p class="muted">Cargando tu lista…</p>
      } @else if (!filas().length) {
        <div class="vacio">
          <p>Tu lista de deseos está vacía.</p>
          <p class="muted">
            Añade cartas con el buscador de arriba o desde su ficha en el
            <a routerLink="/catalogo">catálogo</a>.
          </p>
        </div>
      } @else {
        <ul class="lista">
          @for (f of filas(); track f.cardId) {
            <li class="fila" [class.conseguida]="f.faltan === 0">
              @if (f.card) {
                <a [routerLink]="['/carta', f.cardId]" class="miniatura">
                  <img
                    [src]="f.card.imgUrl | thumb: 120"
                    [alt]="f.card.name"
                    width="60"
                    height="84"
                    loading="lazy"
                  />
                </a>
              }
              <div class="info">
                <a [routerLink]="['/carta', f.cardId]" class="nombre">
                  {{ f.card?.name ?? f.cardId }}
                </a>
                <span class="muted">
                  {{ f.cardId }}
                  @if (f.card) {
                    · {{ f.card.setName }}
                  }
                </span>
                <span class="estado">
                  @if (f.faltan === 0) {
                    Ya la tienes ({{ f.tienes }}/{{ f.entry.qty }})
                  } @else {
                    Te faltan {{ f.faltan }} · tienes {{ f.tienes }} · {{ f.precio | eur }}
                    @if (f.precio !== null && f.faltan > 1) {
                      <span class="muted">(total {{ f.precio * f.faltan | eur }})</span>
                    }
                  }
                </span>
                <input
                  class="nota"
                  type="text"
                  [maxLength]="maxNota"
                  placeholder="Nota (foil, idioma, para qué mazo…)"
                  [value]="f.entry.nota ?? ''"
                  (change)="wish.setNota(f.cardId, $any($event.target).value)"
                />
                @if (buscado()) {
                  <div class="poseedores">
                    @for (p of poseedores().get(f.cardId) ?? []; track p.uid) {
                      <a class="chip" [routerLink]="['/coleccion', p.uid]">
                        {{ p.nombre }} · {{ copias(p) }}
                      </a>
                    } @empty {
                      <span class="muted">Nadie más del grupo la tiene.</span>
                    }
                  </div>
                }
              </div>
              <div class="cantidad">
                <span class="etiqueta">Quiero</span>
                <div class="pasos">
                  <button
                    type="button"
                    class="paso"
                    [attr.aria-label]="'Querer una copia menos de ' + (f.card?.name ?? f.cardId)"
                    (click)="wish.adjust(f.cardId, -1)"
                  >
                    −
                  </button>
                  <span class="n" aria-live="polite">{{ f.entry.qty }}</span>
                  <button
                    type="button"
                    class="paso"
                    [disabled]="f.entry.qty >= maxDeseo"
                    [attr.aria-label]="'Querer una copia más de ' + (f.card?.name ?? f.cardId)"
                    (click)="wish.adjust(f.cardId, 1)"
                  >
                    +
                  </button>
                </div>
                <button type="button" class="secondary quitar" (click)="wish.remove(f.cardId)">
                  Quitar
                </button>
              </div>
            </li>
          }
        </ul>
      }
    </main>
  `,
  styles: `
    .pagina {
      padding: 12px 16px 48px;
      max-width: 1000px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
    }
    .cabecera h1 {
      margin: 0;
      font-size: 1.3rem;
    }
    .resumen {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr;
      gap: 12px;
    }
    .cifra {
      display: grid;
      gap: 2px;
      align-content: start;
      padding: 14px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
    }
    .etiqueta {
      font-size: 0.8rem;
      color: var(--muted);
    }
    .numero {
      font-size: 1.6rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .principal .numero {
      color: var(--accent);
      font-size: 2rem;
    }
    .pie {
      font-size: 0.75rem;
    }
    .anadir {
      display: grid;
      gap: 6px;
    }
    .anadir label {
      font-size: 0.9rem;
      color: var(--muted);
    }
    .resultados {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    .resultados li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 10px;
      border-top: 1px solid var(--border);
    }
    .resultados li:first-child {
      border-top: 0;
    }
    .resultados button {
      padding: 4px 12px;
    }
    .grupo {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
    }
    .grupo p {
      flex-basis: 100%;
      margin: 0;
      font-size: 0.85rem;
    }
    .vacio {
      text-align: center;
      padding: 32px 16px;
    }
    .lista {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    .fila {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
      padding: 10px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
    }
    .fila.conseguida {
      opacity: 0.65;
    }
    .miniatura img {
      display: block;
      width: 60px;
      height: auto;
      border-radius: 4px;
    }
    .info {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .nombre {
      font-weight: 600;
      color: var(--text);
      text-decoration: none;
    }
    .info > .muted {
      font-size: 0.8rem;
    }
    .estado {
      font-size: 0.9rem;
    }
    .nota {
      font-size: 0.85rem;
      padding: 4px 8px;
      max-width: 100%;
    }
    .poseedores {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 0.85rem;
    }
    .chip {
      padding: 2px 10px;
      border-radius: 999px;
      background: var(--surface-2);
      color: var(--text);
      text-decoration: none;
    }
    .cantidad {
      display: grid;
      justify-items: center;
      gap: 4px;
    }
    .pasos {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .paso {
      width: 32px;
      height: 32px;
      padding: 0;
    }
    .n {
      min-width: 2ch;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .quitar {
      padding: 4px 10px;
      font-size: 0.8rem;
    }

    @media (max-width: 600px) {
      .resumen {
        grid-template-columns: 1fr 1fr;
      }
      .principal {
        grid-column: 1 / -1;
      }
      .fila {
        grid-template-columns: auto minmax(0, 1fr);
      }
      .cantidad {
        grid-column: 1 / -1;
        grid-auto-flow: column;
        justify-content: start;
        align-items: center;
      }
    }
  `,
})
export class WishlistPage implements OnInit {
  protected readonly wish = inject(WishlistService);
  private readonly catalog = inject(CatalogService);
  private readonly col = inject(CollectionService);
  private readonly users = inject(UsersService);
  private readonly auth = inject(AuthService);
  private readonly valuation = inject(ValuationService);

  protected readonly maxDeseo = MAX_DESEO;
  protected readonly maxNota = MAX_NOTA;
  protected readonly texto = signal('');
  protected readonly buscando = signal(false);
  protected readonly buscado = signal(false);

  protected readonly resultados = computed(() => {
    const t = this.texto().trim();
    return t.length < 2 ? [] : this.catalog.search(t, 8);
  });

  protected readonly filas = computed<Fila[]>(() => {
    const filas: Fila[] = [];
    for (const [cardId, entry] of this.wish.entries()) {
      const tienes = this.col.qty(cardId);
      const p = this.valuation.pricing(cardId);
      filas.push({
        cardId,
        card: this.catalog.card(cardId),
        entry,
        tienes: tienes.normal + tienes.foil,
        faltan: faltan(entry, tienes),
        precio: p.normal ?? p.foil,
      });
    }
    // Primero lo que falta, después lo conseguido; dentro, por nombre.
    return filas.sort(
      (a, b) =>
        Number(a.faltan === 0) - Number(b.faltan === 0) ||
        (a.card?.name ?? a.cardId).localeCompare(b.card?.name ?? b.cardId),
    );
  });

  protected readonly resumen = computed(() => {
    let coste = 0;
    let copias = 0;
    let conPrecio = 0;
    let sinPrecio = 0;
    for (const f of this.filas()) {
      if (!f.faltan) continue;
      copias += f.faltan;
      if (f.precio === null) {
        sinPrecio++;
      } else {
        coste += f.precio * f.faltan;
        conPrecio++;
      }
    }
    // Si nada de lo que falta tiene precio, no se enseña 0 €: sería mentir.
    return { coste: conPrecio || !copias ? coste : null, copias, sinPrecio };
  });

  /** Los demás usuarios, sin uno mismo. */
  protected readonly otros = computed(() =>
    this.users.profiles().filter((p) => p.uid !== this.auth.user()?.uid),
  );

  protected readonly poseedores = computed<Map<string, Poseedor[]>>(() => {
    if (!this.buscado()) return new Map();
    const colecciones = this.otros()
      .map((p) => ({ uid: p.uid, nombre: p.displayName, cards: this.col.other(p.uid) }))
      .filter(
        (c): c is { uid: string; nombre: string; cards: NonNullable<typeof c.cards> } => !!c.cards,
      );
    return quienTiene(this.wish.entries().keys(), colecciones);
  });

  ngOnInit(): void {
    void this.wish.load();
    void this.users.loadProfiles();
  }

  protected anadir(cardId: string): void {
    this.wish.add(cardId);
    this.texto.set('');
  }

  protected copias(p: Poseedor): string {
    if (p.foil && p.normal) return `${p.normal} + ${p.foil} foil`;
    return p.foil ? `${p.foil} foil` : String(p.normal);
  }

  /** Lee la colección de cada miembro (la primera vez; "volver a buscar" las relee). */
  protected async buscarQuienTiene(): Promise<void> {
    this.buscando.set(true);
    try {
      await this.users.loadProfiles();
      const recargar = this.buscado();
      await Promise.all(this.otros().map((p) => this.col.loadOther(p.uid, recargar)));
      this.buscado.set(true);
    } finally {
      this.buscando.set(false);
    }
  }
}
