import { Injectable, signal } from '@angular/core';
import { Pixeles } from './huella';
import { CatalogoRed, MODELO_RED, puntuarRed, recortarZonaRed, vectorDeSalida } from './red';
import { Encuadre } from './reconocimiento';

type Extractor = (img: unknown) => Promise<{ data: ArrayLike<number>; dims: number[] }>;

/**
 * La red neuronal del escáner (DINOv2-small, ver ./red.ts). Se carga solo al abrir el
 * escáner: el modelo (unos 24 MB) lo descarga transformers.js de Hugging Face la primera
 * vez y queda en la caché del navegador; los vectores del catálogo (600 KB) salen de
 * /data/vectores.*. Mientras carga, el escáner funciona solo con la huella.
 */
@Injectable({ providedIn: 'root' })
export class RedService {
  readonly cargando = signal(false);
  readonly listo = signal(false);
  readonly error = signal<string | null>(null);
  private carga: Promise<void> | null = null;
  private extractor: Extractor | null = null;
  private RawImage:
    (new (d: Uint8ClampedArray, w: number, h: number, c: number) => unknown) | null = null;
  private catalogo: CatalogoRed | null = null;

  load(): Promise<void> {
    this.carga ??= (async () => {
      this.cargando.set(true);
      try {
        const [modulo, meta, bin] = await Promise.all([
          import('@huggingface/transformers'),
          fetch('/data/vectores.json').then((r) =>
            r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
          ),
          fetch('/data/vectores.bin').then((r) =>
            r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`)),
          ),
        ]);
        const { ids, dim, modelo } = meta as { ids: string[]; dim: number; modelo: string };
        if (modelo !== MODELO_RED)
          throw new Error('Los vectores son de otro modelo: hay que regenerarlos');
        this.catalogo = { ids, dim, datos: new Int8Array(bin) };
        modulo.env.allowLocalModels = false;
        this.extractor = (await modulo.pipeline('image-feature-extraction', MODELO_RED, {
          dtype: 'q8',
        })) as unknown as Extractor;
        this.RawImage = modulo.RawImage as unknown as typeof this.RawImage;
        this.listo.set(true);
        this.error.set(null);
      } catch (e) {
        this.carga = null;
        this.error.set(e instanceof Error ? e.message : String(e));
      } finally {
        this.cargando.set(false);
      }
    })();
    return this.carga;
  }

  /** Parecido de cada carta con lo que hay en los encuadres dados (el mejor de ellos). */
  async puntuar(px: Pixeles, encuadres: readonly Encuadre[]): Promise<Map<string, number> | null> {
    if (!this.extractor || !this.RawImage || !this.catalogo) return null;
    const vectores: Float32Array[] = [];
    for (const e of encuadres) {
      const r = recortarZonaRed(px, e);
      const salida = await this.extractor(new this.RawImage(r.data, r.width, r.height, 3));
      vectores.push(vectorDeSalida(salida.data, salida.dims));
    }
    return puntuarRed(vectores, this.catalogo);
  }
}
