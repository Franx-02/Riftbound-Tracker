import { Component, computed, input } from '@angular/core';

type Trozo =
  | { tipo: 'texto'; valor: string }
  | { tipo: 'keyword'; valor: string }
  | { tipo: 'energia'; valor: string }
  | { tipo: 'runa'; valor: string; dominio: string; letra: string }
  | { tipo: 'icono'; valor: string; titulo: string };

const ICONOS: Record<string, { valor: string; titulo: string }> = {
  might: { valor: '⚔', titulo: 'Might' },
  exhaust: { valor: '↷', titulo: 'Exhaust' },
};

/**
 * Texto de reglas con los símbolos del juego (`:rb_energy_2:`, `:rb_rune_fury:`,
 * `[Accelerate]`…) dibujados como fichas. Se trocea y se pinta con plantilla, nunca
 * con innerHTML: el texto viene de una API de terceros.
 */
@Component({
  selector: 'app-rules-text',
  template: `
    @for (parrafo of parrafos(); track $index) {
      <p>
        @for (t of parrafo; track $index) {
          @switch (t.tipo) {
            @case ('keyword') {
              <strong class="kw">{{ t.valor }}</strong>
            }
            @case ('energia') {
              <span class="ficha energia" [attr.aria-label]="t.valor + ' de energía'">{{
                t.valor
              }}</span>
            }
            @case ('runa') {
              <span
                class="ficha runa"
                [attr.data-dominio]="t.dominio"
                [attr.title]="t.valor"
                [attr.aria-label]="t.valor"
              >
                {{ t.letra }}
              </span>
            }
            @case ('icono') {
              <span class="ficha icono" [attr.title]="t.titulo" [attr.aria-label]="t.titulo">{{
                t.valor
              }}</span>
            }
            @default {
              {{ t.valor }}
            }
          }
        }
      </p>
    }
  `,
  styles: `
    p {
      margin: 0 0 8px;
    }
    p:last-child {
      margin-bottom: 0;
    }
    .kw {
      color: var(--accent);
    }
    .ficha {
      display: inline-grid;
      place-items: center;
      min-width: 1.35em;
      height: 1.35em;
      padding: 0 3px;
      margin: 0 1px;
      border-radius: 999px;
      font-size: 0.8em;
      font-weight: 700;
      line-height: 1;
      vertical-align: 0.05em;
      background: var(--surface-2);
      border: 1px solid var(--border);
    }
    .energia {
      background: #d8d8de;
      color: #15161b;
      border-color: transparent;
    }
    .runa {
      color: #15161b;
      border-color: transparent;
    }
    .runa[data-dominio='fury'] {
      background: #e0605a;
    }
    .runa[data-dominio='calm'] {
      background: #6cc28a;
    }
    .runa[data-dominio='mind'] {
      background: #5f9fe0;
    }
    .runa[data-dominio='body'] {
      background: #e89a4c;
    }
    .runa[data-dominio='chaos'] {
      background: #a77ad8;
    }
    .runa[data-dominio='order'] {
      background: #e5cf5c;
    }
    .runa[data-dominio='rainbow'] {
      background: conic-gradient(#e0605a, #e89a4c, #e5cf5c, #6cc28a, #5f9fe0, #a77ad8, #e0605a);
    }
  `,
})
export class RulesTextComponent {
  readonly text = input.required<string>();

  protected readonly parrafos = computed(() =>
    this.text()
      .split(/\n+/)
      .filter((p) => p.trim())
      .map(trocear),
  );
}

function trocear(parrafo: string): Trozo[] {
  const salida: Trozo[] = [];
  const patron = /:rb_([a-z0-9_]+):|\[([^\]]+)\]/g;
  let ultimo = 0;
  for (const m of parrafo.matchAll(patron)) {
    if (m.index! > ultimo) salida.push({ tipo: 'texto', valor: parrafo.slice(ultimo, m.index) });
    ultimo = m.index! + m[0].length;
    if (m[2]) {
      salida.push({ tipo: 'keyword', valor: m[2] });
      continue;
    }
    const simbolo = m[1];
    const energia = /^energy_(\d+)$/.exec(simbolo);
    const runa = /^rune_([a-z]+)$/.exec(simbolo);
    if (energia) {
      salida.push({ tipo: 'energia', valor: energia[1] });
    } else if (runa) {
      const dominio = runa[1];
      const arcoiris = dominio === 'rainbow';
      salida.push({
        tipo: 'runa',
        valor: arcoiris ? 'Runa de cualquier dominio' : `Runa ${capitalizar(dominio)}`,
        dominio,
        letra: arcoiris ? '★' : dominio.charAt(0).toUpperCase(),
      });
    } else if (ICONOS[simbolo]) {
      salida.push({ tipo: 'icono', ...ICONOS[simbolo] });
    } else {
      // Un símbolo nuevo de un set futuro: mejor enseñar su nombre que nada.
      salida.push({ tipo: 'icono', valor: capitalizar(simbolo), titulo: simbolo });
    }
  }
  if (ultimo < parrafo.length) salida.push({ tipo: 'texto', valor: parrafo.slice(ultimo) });
  return salida;
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replaceAll('_', ' ');
}
