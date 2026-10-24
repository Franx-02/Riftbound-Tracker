import { Injectable, signal } from '@angular/core';
import {
  Coincidencia,
  Huella,
  Pixeles,
  calcularHuella,
  distancia,
  huellasConMargen,
  leerHuella,
  masParecidas,
  regionIlustracion,
} from './huella';

/** Por debajo de esto, dos cartas tienen la misma ilustración (firmada, promo reimpresa…). */
const GEMELAS = 0.04;
/** Medido con tools/build-huellas.mts --medir: un acierto suele quedar por debajo. */
const DISTANCIA_SEGURA = 0.14;
/** Y con al menos este margen respecto a la siguiente carta de otra ilustración. */
const MARGEN_SEGURO = 0.03;

/** Dónde podría estar la carta entera dentro de la imagen, en píxeles. */
export interface Encuadre {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Encuadres con forma de carta alrededor de `centro`: distintos tamaños y pequeños
 * desplazamientos, porque nadie encaja la carta exactamente en la guía.
 */
export function encuadresAlrededor(
  centro: Encuadre,
  escalas = [0.85, 0.93, 1, 1.08, 1.16],
  desplazamiento = 0.07,
): Encuadre[] {
  const salida: Encuadre[] = [];
  for (const e of escalas)
    for (const dy of [-desplazamiento, 0, desplazamiento])
      for (const dx of [-desplazamiento, 0, desplazamiento]) {
        const w = centro.w * e;
        const h = centro.h * e;
        salida.push({
          x: centro.x + (centro.w - w) / 2 + dx * centro.w,
          y: centro.y + (centro.h - h) / 2 + dy * centro.h,
          w,
          h,
        });
      }
  return salida;
}

export interface Reconocimiento {
  /** Las más parecidas, de más a menos. */
  candidatas: Coincidencia[];
  /** La primera es casi seguro la buena: la cámara puede pararse sola. */
  segura: boolean;
}

/**
 * Reconoce una carta por la foto comparando la huella de su ilustración con las del
 * catálogo (public/data/huellas.json, generado por tools/build-huellas.mts).
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

  /**
   * Reconoce la carta de `px`. `encuadres` son los sitios donde podría estar la carta
   * entera (por defecto, la imagen entera). En dos pasos, para que probar muchos
   * encuadres no sea lento: primero una sola huella por encuadre, para quedarse con los
   * dos que más se parecen a alguna carta, y después, solo en esos, la búsqueda fina
   * con pequeños desplazamientos y escalas (`huellasConMargen`).
   */
  reconocer(
    px: Pixeles,
    encuadres: Encuadre[] = [{ x: 0, y: 0, w: px.width, h: px.height }],
  ): Reconocimiento {
    const ilustracion = (z: Encuadre) => {
      const ilus = regionIlustracion(z.w, z.h);
      return { ...ilus, x: z.x + ilus.x, y: z.y + ilus.y };
    };
    const mejores =
      encuadres.length <= 2
        ? encuadres
        : encuadres
            .map((z) => ({
              z,
              d:
                masParecidas([calcularHuella(px, ilustracion(z))], this.huellas, 1)[0]?.distancia ??
                1,
            }))
            .sort((a, b) => a.d - b.d)
            .slice(0, 2)
            .map((m) => m.z);
    const variantes = mejores.flatMap((z) => huellasConMargen(px, ilustracion(z)));
    const candidatas = masParecidas(variantes, this.huellas, 8);
    if (!candidatas.length) return { candidatas, segura: false };
    // Las gemelas de la primera no cuentan para el margen: son la misma imagen.
    const primera = this.huellas.get(candidatas[0].cardId)!;
    const ajena = candidatas.find(
      (c) => distancia(this.huellas.get(c.cardId)!, primera) >= GEMELAS,
    );
    const segura =
      candidatas[0].distancia <= DISTANCIA_SEGURA &&
      (!ajena || ajena.distancia - candidatas[0].distancia >= MARGEN_SEGURO);
    return { candidatas: candidatas.slice(0, 5), segura };
  }
}
