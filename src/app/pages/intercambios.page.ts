import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CatalogCard, CatalogService } from '../core/catalog.service';
import { CollectionMap, CollectionService } from '../core/collection.service';
import { UsersService } from '../core/users.service';
import { ValuationService } from '../core/valuation.service';
import { EurPipe, ThumbPipe } from '../ui/pipes';

interface Oferta {
  card: CatalogCard;
  /** Copias que tiene quien la ofrece (normales + foil). */
  copias: number;
  foil: number;
  precio: number | null;
}

/**
 * Intercambios: con otra persona, las cartas de las que tiene muchas copias (por defecto 4
 * o más) y tú ninguna, para pedírselas; y al revés, las que te sobran a ti y a ella le faltan,
 * para ofrecérselas. Leer la colección de otra persona cuesta una lectura de Firebase por
 * carta, así que solo se lee la de la persona elegida.
 */
@Component({
  selector: 'app-intercambios-page',
  imports: [RouterLink, EurPipe, ThumbPipe],
  template: `
    <main class="pagina">
      <header>
        <h1>Intercambios</h1>
        <p class="muted">
          Elige a alguien y verás las cartas que le sobran y a ti te faltan, para pedírselas, y las
          que te sobran a ti y a esa persona le faltan, para ofrecérselas.
        </p>
      </header>

      <section class="controles">
        <label>
          Con
          <select [value]="otro()" (change)="elegir($any($event.target).value)">
            <option value="">Elige a alguien…</option>
            @for (p of otros(); track p.uid) {
              <option [value]="p.uid" [selected]="p.uid === otro()">{{ p.displayName }}</option>
            }
          </select>
        </label>
        <label>
          Le sobran si tiene
          <select [value]="minimo()" (change)="minimo.set(+$any($event.target).value)">
            @for (n of [2, 3, 4, 5]; track n) {
              <option [value]="n" [selected]="n === minimo()">{{ n }} o más copias</option>
            }
          </select>
        </label>
      </section>

      @if (!otro()) {
        <p class="muted">Elige a una persona del grupo para empezar.</p>
      } @else if (col.loadingOther() || !suColeccion()) {
        <p class="muted">Leyendo su colección…</p>
      } @else {
        <section class="bloque">
          <div class="cabecera-bloque">
            <h2>Puedes pedirle ({{ pedir().length }})</h2>
            @if (pedir().length) {
              <button type="button" class="secondary" (click)="copiar('pedir')">
                {{ copiado() === 'pedir' ? 'Copiado' : 'Copiar mensaje' }}
              </button>
            }
          </div>
          <p class="muted nota">
            Cartas de las que {{ nombreOtro() }} tiene {{ minimo() }} o más copias y tú ninguna.
          </p>
          <ul class="cartas">
            @for (o of pedir(); track o.card.cardId) {
              <li>
                <a [routerLink]="['/carta', o.card.cardId]">
                  <img
                    [src]="o.card.imgUrl | thumb: 240"
                    [alt]="o.card.name"
                    width="120"
                    height="168"
                    loading="lazy"
                  />
                  <span class="nombre">{{ o.card.name }}</span>
                  <span class="meta">
                    ×{{ o.copias }}
                    @if (o.foil) {
                      <small>({{ o.foil }} foil)</small>
                    }
                    · {{ o.precio | eur: '—' }}
                  </span>
                </a>
              </li>
            } @empty {
              <li class="muted vacio">No le sobra ninguna carta que te falte.</li>
            }
          </ul>
        </section>

        <section class="bloque">
          <div class="cabecera-bloque">
            <h2>Puedes ofrecerle ({{ ofrecer().length }})</h2>
            @if (ofrecer().length) {
              <button type="button" class="secondary" (click)="copiar('ofrecer')">
                {{ copiado() === 'ofrecer' ? 'Copiado' : 'Copiar mensaje' }}
              </button>
            }
          </div>
          <p class="muted nota">
            Cartas de las que tú tienes {{ minimo() }} o más copias y {{ nombreOtro() }} ninguna.
          </p>
          <ul class="cartas">
            @for (o of ofrecer(); track o.card.cardId) {
              <li>
                <a [routerLink]="['/carta', o.card.cardId]">
                  <img
                    [src]="o.card.imgUrl | thumb: 240"
                    [alt]="o.card.name"
                    width="120"
                    height="168"
                    loading="lazy"
                  />
                  <span class="nombre">{{ o.card.name }}</span>
                  <span class="meta">×{{ o.copias }} · {{ o.precio | eur: '—' }}</span>
                </a>
              </li>
            } @empty {
              <li class="muted vacio">No te sobra ninguna carta que le falte.</li>
            }
          </ul>
        </section>
      }
    </main>
  `,
  styles: `
    .pagina {
      padding: 12px 16px 48px;
      max-width: 1100px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 18px;
    }
    header p {
      margin: 0;
      font-size: 0.9rem;
    }
    .controles {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .controles label {
      display: grid;
      gap: 4px;
      font-size: 0.8rem;
      color: var(--muted);
      flex: 1 1 200px;
    }
    .bloque {
      padding: 14px;
      background: var(--surface);
      border: 1px solid var(--border);
    }
    .cabecera-bloque {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .cabecera-bloque h2 {
      margin: 0;
    }
    .nota {
      margin: 4px 0 12px;
      font-size: 0.85rem;
    }
    .cartas {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 12px;
    }
    .cartas a {
      display: grid;
      gap: 4px;
      color: var(--text);
      text-decoration: none;
    }
    .cartas img {
      width: 100%;
      height: auto;
      border-radius: 2px;
    }
    .nombre {
      font-size: 0.8rem;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .meta {
      font-size: 0.8rem;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
    }
    .vacio {
      grid-column: 1 / -1;
    }
  `,
})
export class IntercambiosPage implements OnInit {
  protected readonly col = inject(CollectionService);
  private readonly catalog = inject(CatalogService);
  private readonly users = inject(UsersService);
  private readonly auth = inject(AuthService);
  private readonly valuation = inject(ValuationService);

  protected readonly otro = signal('');
  protected readonly minimo = signal(4);
  protected readonly copiado = signal<'pedir' | 'ofrecer' | null>(null);

  protected readonly otros = computed(() =>
    this.users.profiles().filter((p) => p.uid !== this.auth.user()?.uid),
  );
  protected readonly nombreOtro = computed(
    () => this.users.profile(this.otro())?.displayName ?? 'esa persona',
  );
  protected readonly suColeccion = computed(() =>
    this.otro() ? this.col.other(this.otro()) : undefined,
  );

  /** Cartas de las que `de` tiene `minimo` o más copias y `para` ninguna, de más a menos valiosas. */
  private sobrantes(de: CollectionMap, para: CollectionMap): Oferta[] {
    const salida: Oferta[] = [];
    for (const [cardId, q] of de) {
      const copias = q.normal + q.foil;
      if (copias < this.minimo()) continue;
      const suyas = para.get(cardId);
      if (suyas && suyas.normal + suyas.foil > 0) continue;
      const card = this.catalog.card(cardId);
      if (!card) continue;
      const p = this.valuation.pricing(cardId);
      salida.push({ card, copias, foil: q.foil, precio: p.normal ?? p.foil });
    }
    return salida.sort(
      (a, b) => (b.precio ?? 0) - (a.precio ?? 0) || a.card.name.localeCompare(b.card.name),
    );
  }

  protected readonly pedir = computed(() => {
    const suya = this.suColeccion();
    return suya ? this.sobrantes(suya, this.col.cards()) : [];
  });
  protected readonly ofrecer = computed(() => {
    const suya = this.suColeccion();
    return suya ? this.sobrantes(this.col.cards(), suya) : [];
  });

  ngOnInit(): void {
    void this.users.loadProfiles();
    void this.col.loadMine();
  }

  protected elegir(uid: string): void {
    this.otro.set(uid);
    this.copiado.set(null);
    if (uid) void this.col.loadOther(uid);
  }

  /** Un mensaje listo para pegar en WhatsApp con la lista de cartas. */
  protected async copiar(que: 'pedir' | 'ofrecer'): Promise<void> {
    const lista = que === 'pedir' ? this.pedir() : this.ofrecer();
    const lineas = lista.map((o) => `- ${o.card.name} (${o.card.cardId})`);
    const texto =
      que === 'pedir'
        ? `Hola ${this.nombreOtro()}, ¿me cambias alguna de estas? Te sobran y a mí me faltan:\n${lineas.join('\n')}`
        : `Hola ${this.nombreOtro()}, me sobran estas y a ti te faltan, por si te interesa alguna:\n${lineas.join('\n')}`;
    try {
      await navigator.clipboard.writeText(texto);
      this.copiado.set(que);
    } catch {
      this.copiado.set(null);
    }
  }
}
