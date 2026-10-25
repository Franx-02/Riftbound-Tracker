import { Injectable, signal } from '@angular/core';
import { Huella, Pixeles, leerHuella } from './huella';
import { Encuadre, Reconocimiento, reconocerEn } from './reconocimiento';

export { Votacion, encuadresAlrededor, localizarCarta } from './reconocimiento';
export type { Encuadre, Reconocimiento } from './reconocimiento';

/**
 * Reconoce una carta por la foto comparando la huella de su ilustración con las del
 * catálogo (public/data/huellas.json, generado por tools/build-huellas.mts). La lógica
 * está en ./reconocimiento.ts; aquí solo se cargan las huellas.
 */
@Injectable({ providedIn: 'root' })
export class ReconocimientoService {
  readonly listo = signal(false);
  readonly error = signal<string | null>(null);
  private huellas = new Map<string, Huella>();
  private carga: Promise<void> | null = null;

  load(): Promise<void> {
    this.carga ??= (async () => {
      try {
        const r = await fetch('/data/huellas.json');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const { huellas } = (await r.json()) as { huellas: Record<string, string> };
        for (const [cardId, s] of Object.entries(huellas)) {
          const h = leerHuella(s);
          if (h) this.huellas.set(cardId, h);
        }
        this.listo.set(true);
        this.error.set(null);
      } catch (e) {
        this.carga = null;
        this.error.set(e instanceof Error ? e.message : String(e));
      }
    })();
    return this.carga;
  }

  reconocer(
    px: Pixeles,
    encuadres: Encuadre[] = [{ x: 0, y: 0, w: px.width, h: px.height }],
    descartadas: ReadonlySet<string> = new Set(),
  ): Reconocimiento {
    return reconocerEn(px, encuadres, this.huellas, descartadas);
  }
}
