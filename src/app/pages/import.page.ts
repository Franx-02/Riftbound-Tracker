import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogService } from '../core/catalog.service';
import { CollectionService, ImportMode } from '../core/collection.service';
import { ImportResult, exportDotgg, importCsv } from '../core/csv';
import { PricesService } from '../core/prices.service';
import { ValuationService } from '../core/valuation.service';
import { EurPipe } from '../ui/pipes';

type Estado =
  | { fase: 'inicio' }
  | { fase: 'revisando'; fichero: string; resultado: ImportResult }
  | { fase: 'importando'; hechos: number; total: number }
  | { fase: 'hecho'; escritas: number; borradas: number; cartas: number };

/** Cuántas filas de cada lista se enseñan antes de "y N más". */
const MUESTRA = 20;

@Component({
  selector: 'app-import-page',
  imports: [RouterLink, EurPipe],
  template: `
    <main class="pagina">
      <h1>Importar y exportar</h1>

      <section class="bloque">
        <h2>Exportar mi colección</h2>
        <p class="muted">
          CSV en formato DotGG (<code>CardId,Normal,Foil,Name,Set</code>), el que importan
          Riftbound.gg y Riftatlas. Sirve también como copia de seguridad.
        </p>
        <button
          type="button"
          (click)="exportar()"
          [disabled]="!col.uid() || col.totals().cards === 0"
        >
          Descargar CSV ({{ col.totals().cards }}
          {{ col.totals().cards === 1 ? 'carta' : 'cartas' }})
        </button>
      </section>

      <section class="bloque">
        <h2>Importar</h2>
        <p class="muted">
          Exporta tu colección desde Riftbound.gg o Riftatlas en CSV y súbela aquí. Antes de guardar
          nada verás qué se reconoce y qué no.
        </p>

        @switch (estado().fase) {
          @case ('inicio') {
            <label class="subir">
              <input type="file" accept=".csv,text/csv,text/plain" (change)="leerFichero($event)" />
            </label>
            <details>
              <summary>O pega el contenido del CSV</summary>
              <textarea
                rows="6"
                placeholder="CardId,Normal,Foil,Name,Set&#10;OGN-001,1,0,Blazing Scorcher,Origins"
                (input)="pegado.set($any($event.target).value)"
              ></textarea>
              <button
                type="button"
                class="secondary"
                [disabled]="!pegado().trim()"
                (click)="revisar(pegado(), 'texto pegado')"
              >
                Revisar
              </button>
            </details>
          }

          @case ('revisando') {
            @let r = revision()!;
            <p>
              <strong>{{ r.fichero }}</strong>
              @if (r.resultado.format) {
                · formato {{ r.resultado.format === 'dotgg' ? 'DotGG' : 'Legacy' }}
              }
            </p>

            @if (r.resultado.cards.size === 0) {
              <p class="error">No hay ninguna carta que importar.</p>
            } @else {
              <div class="resumen">
                <div>
                  <span class="numero">{{ r.resultado.cards.size }}</span> cartas
                </div>
                <div>
                  <span class="numero">{{ r.resultado.copies }}</span> copias
                </div>
                @if (prices.data()) {
                  <div>
                    <span class="numero">{{ valorImportado() | eur }}</span> valor estimado
                  </div>
                }
              </div>
            }

            @if (r.resultado.aliased.length) {
              <details>
                <summary>
                  {{ r.resultado.aliased.length }}
                  {{ r.resultado.aliased.length === 1 ? 'enlazada' : 'enlazadas' }} con su carta del
                  catálogo (promos con otro código)
                </summary>
                <ul>
                  @for (a of r.resultado.aliased; track a.line) {
                    <li>
                      {{ a.from }} → {{ a.to }} <span class="muted">· {{ nombre(a.to) }}</span>
                    </li>
                  }
                </ul>
              </details>
            }

            @if (r.resultado.outsideCatalog.length) {
              <details>
                <summary>
                  {{ r.resultado.outsideCatalog.length }}
                  {{
                    r.resultado.outsideCatalog.length === 1
                      ? 'no está en el catálogo: se guarda igual'
                      : 'no están en el catálogo: se guardan igual'
                  }}, pero sin imagen ni precio
                </summary>
                <ul>
                  @for (o of r.resultado.outsideCatalog.slice(0, muestra); track o.line) {
                    <li>
                      {{ o.cardId }} <span class="muted">· línea {{ o.line }}</span>
                    </li>
                  }
                  @if (r.resultado.outsideCatalog.length > muestra) {
                    <li class="muted">y {{ r.resultado.outsideCatalog.length - muestra }} más</li>
                  }
                </ul>
              </details>
            }

            @if (r.resultado.rejected.length) {
              <details class="rechazadas" open>
                <summary>
                  {{ r.resultado.rejected.length }}
                  {{
                    r.resultado.rejected.length === 1
                      ? 'fila no se importa'
                      : 'filas no se importan'
                  }}
                </summary>
                <ul>
                  @for (x of r.resultado.rejected.slice(0, muestra); track x.line) {
                    <li>
                      Línea {{ x.line }}: {{ x.reason }}
                      <code class="muted">{{ x.original }}</code>
                    </li>
                  }
                  @if (r.resultado.rejected.length > muestra) {
                    <li class="muted">y {{ r.resultado.rejected.length - muestra }} más</li>
                  }
                </ul>
              </details>
            }

            @if (r.resultado.cards.size > 0) {
              @if (col.totals().cards > 0) {
                <fieldset class="modo">
                  <legend>Ya tienes {{ col.totals().cards }} cartas. ¿Qué hago con ellas?</legend>
                  <label>
                    <input
                      type="radio"
                      name="modo"
                      value="sumar"
                      [checked]="modo() === 'sumar'"
                      (change)="modo.set('sumar')"
                    />
                    <span><strong>Sumar</strong>: añadir estas copias a las que ya tengo</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="modo"
                      value="sustituir"
                      [checked]="modo() === 'sustituir'"
                      (change)="modo.set('sustituir')"
                    />
                    <span>
                      <strong>Sustituir</strong>: mi colección pasa a ser exactamente la del fichero
                      @if (seBorrarian() > 0) {
                        <span class="aviso-borrado"
                          >· se borrarán {{ seBorrarian() }} cartas que no están en él</span
                        >
                      }
                    </span>
                  </label>
                </fieldset>
              }
              <div class="botones">
                <button type="button" (click)="importar()">
                  Importar {{ r.resultado.cards.size }} cartas
                </button>
                <button type="button" class="secondary" (click)="reiniciar()">Cancelar</button>
              </div>
            } @else {
              <button type="button" class="secondary" (click)="reiniciar()">
                Probar con otro fichero
              </button>
            }
          }

          @case ('importando') {
            @let p = progreso()!;
            <p aria-live="polite">Guardando… {{ p.hechos }} de {{ p.total }} cambios</p>
            <progress [value]="p.hechos" [max]="p.total || 1"></progress>
          }

          @case ('hecho') {
            @let h = hecho()!;
            <p class="ok" role="status">
              <!-- El texto entre paréntesis se monta en el componente: con @if dentro, el
                   formateo de la plantilla metía espacios antes de la coma y del paréntesis. -->
              Importado. Tu colección tiene ahora {{ h.cartas }} cartas ({{ detalleHecho() }}).
            </p>
            <div class="botones">
              <a class="boton" routerLink="/coleccion">Ver mi colección</a>
              <button type="button" class="secondary" (click)="reiniciar()">Importar otro</button>
            </div>
          }
        }

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
      </section>
    </main>
  `,
  styles: `
    .pagina {
      padding: 12px 16px 48px;
      max-width: 760px;
      margin: 0 auto;
      display: grid;
      gap: 16px;
    }
    h1 {
      font-size: 1.3rem;
      margin: 0;
    }
    .bloque {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      display: grid;
      gap: 12px;
      justify-items: start;
    }
    .bloque > * {
      margin: 0;
    }
    code {
      font-size: 0.85em;
    }
    textarea {
      width: 100%;
      font: inherit;
      font-family: ui-monospace, monospace;
      font-size: 0.85rem;
      color: var(--text);
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px;
      margin: 8px 0;
    }
    details {
      width: 100%;
    }
    details ul {
      margin: 8px 0 0;
      padding-left: 18px;
      font-size: 0.9rem;
    }
    details li code {
      display: block;
      overflow-wrap: anywhere;
    }
    summary {
      cursor: pointer;
    }
    .rechazadas summary {
      color: var(--accent);
    }
    .resumen {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 24px;
    }
    .numero {
      font-size: 1.4rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .modo {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 12px 12px;
      display: grid;
      gap: 8px;
      width: 100%;
    }
    .modo label {
      display: flex;
      gap: 8px;
      align-items: baseline;
    }
    .aviso-borrado {
      color: var(--error);
    }
    .botones {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .boton {
      display: inline-block;
      padding: 10px 18px;
      border-radius: 8px;
      background: var(--accent);
      color: #15120a;
      font-weight: 600;
      text-decoration: none;
    }
    progress {
      width: 100%;
    }
  `,
})
export class ImportPage {
  protected readonly catalog = inject(CatalogService);
  protected readonly col = inject(CollectionService);
  protected readonly prices = inject(PricesService);
  private readonly valuation = inject(ValuationService);

  protected readonly estado = signal<Estado>({ fase: 'inicio' });
  protected readonly modo = signal<ImportMode>('sumar');
  protected readonly pegado = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly muestra = MUESTRA;

  // Atajos tipados para la plantilla, que no estrecha uniones dentro de @switch.
  protected readonly revision = computed(() => {
    const e = this.estado();
    return e.fase === 'revisando' ? e : null;
  });
  protected readonly progreso = computed(() => {
    const e = this.estado();
    return e.fase === 'importando' ? e : null;
  });
  protected readonly hecho = computed(() => {
    const e = this.estado();
    return e.fase === 'hecho' ? e : null;
  });

  protected readonly detalleHecho = computed(() => {
    const h = this.hecho();
    if (!h) return '';
    const guardadas = `${h.escritas} ${h.escritas === 1 ? 'guardada' : 'guardadas'}`;
    return h.borradas ? `${guardadas}, ${h.borradas} borradas` : guardadas;
  });

  protected readonly valorImportado = computed(
    () => this.valuation.value(this.revision()?.resultado.cards ?? new Map()).total,
  );

  /** Con "sustituir", las cartas que tienes y no vienen en el fichero. */
  protected readonly seBorrarian = computed(() => {
    const importadas = this.revision()?.resultado.cards;
    if (!importadas) return 0;
    return [...this.col.cards().keys()].filter((id) => !importadas.has(id)).length;
  });

  protected async leerFichero(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const fichero = input.files?.[0];
    input.value = ''; // para poder volver a elegir el mismo fichero
    if (!fichero) return;
    if (fichero.size > 5_000_000) {
      this.error.set('El fichero pasa de 5 MB: no parece una colección exportada.');
      return;
    }
    await this.revisar(await fichero.text(), fichero.name);
  }

  protected async revisar(texto: string, nombre: string): Promise<void> {
    this.error.set(null);
    // Los enlaces de promos y "fuera del catálogo" dependen del catálogo cargado.
    await this.catalog.load();
    if (!this.catalog.loaded()) {
      this.error.set('No se pudo cargar el catálogo: sin él no se puede revisar el fichero.');
      return;
    }
    const resultado = importCsv(texto, this.catalog);
    this.modo.set('sumar');
    this.estado.set({ fase: 'revisando', fichero: nombre, resultado });
  }

  protected async importar(): Promise<void> {
    const r = this.revision();
    if (!r) return;
    const modo = this.col.totals().cards > 0 ? this.modo() : 'sustituir';
    if (
      modo === 'sustituir' &&
      this.seBorrarian() > 0 &&
      !confirm(
        `Se borrarán ${this.seBorrarian()} cartas de tu colección que no están en el fichero. ¿Seguir?`,
      )
    ) {
      return;
    }
    this.error.set(null);
    this.estado.set({ fase: 'importando', hechos: 0, total: 0 });
    try {
      const { escritas, borradas } = await this.col.importCollection(
        r.resultado.cards,
        modo,
        (hechos, total) => this.estado.set({ fase: 'importando', hechos, total }),
      );
      this.estado.set({ fase: 'hecho', escritas, borradas, cartas: this.col.totals().cards });
    } catch (e) {
      this.estado.set(r);
      this.error.set(
        `No se pudo terminar la importación: ${e instanceof Error ? e.message : String(e)}. ` +
          (modo === 'sumar'
            ? 'Una parte puede haberse sumado ya: revisa Mi colección antes de reintentar, o se duplicarían copias.'
            : 'Puedes reintentarlo sin miedo: sustituir deja la colección igual que el fichero.'),
      );
    }
  }

  protected reiniciar(): void {
    this.estado.set({ fase: 'inicio' });
    this.pegado.set('');
    this.error.set(null);
  }

  protected exportar(): void {
    const csv = exportDotgg(this.col.cards(), this.catalog);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `riftbound-coleccion-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    // Se libera después: algunos navegadores todavía están leyendo la URL tras el clic.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  protected nombre(cardId: string): string {
    return this.catalog.card(cardId)?.name ?? '';
  }
}
