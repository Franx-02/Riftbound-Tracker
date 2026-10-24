import { Injectable, signal } from '@angular/core';
import type { Worker } from 'tesseract.js';

/** `linea`: un recorte con solo el código. `disperso`: una foto entera con texto suelto. */
export type ModoOcr = 'linea' | 'disperso';

/**
 * OCR en el navegador con Tesseract.js. Se carga solo al usarlo (son varios MB entre
 * el motor WebAssembly y el idioma, que Tesseract descarga de su CDN la primera vez y
 * guarda en el navegador) y se reutiliza el mismo worker para todas las lecturas.
 */
@Injectable({ providedIn: 'root' })
export class OcrService {
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  private worker: Promise<Worker> | null = null;

  private obtenerWorker(): Promise<Worker> {
    this.worker ??= (async () => {
      this.cargando.set(true);
      try {
        const { createWorker } = await import('tesseract.js');
        const w = await createWorker('eng');
        await w.setParameters({
          // Solo lo que puede salir en un código: letras del set, cifras, barra y separadores.
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/•·.-* ',
        });
        this.error.set(null);
        return w;
      } catch (e) {
        this.worker = null;
        this.error.set(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        this.cargando.set(false);
      }
    })();
    return this.worker;
  }

  /** Empieza a descargar el motor sin esperar, para que la primera lectura tarde menos. */
  precargar(): void {
    this.obtenerWorker().catch(() => {});
  }

  async leer(imagen: HTMLCanvasElement, modo: ModoOcr): Promise<string> {
    const w = await this.obtenerWorker();
    // 7 = una sola línea de texto; 11 = texto disperso, sin orden.
    await w.setParameters({ tessedit_pageseg_mode: (modo === 'linea' ? '7' : '11') as never });
    const { data } = await w.recognize(imagen);
    return data.text;
  }
}

/**
 * Prepara un recorte para el OCR: lo amplía (el código mide pocos píxeles), lo pasa a
 * grises, lo deja con texto oscuro sobre fondo claro (en la carta es claro sobre negro,
 * y Tesseract lee mucho peor así) y lo binariza con el umbral de Otsu.
 */
export function prepararParaOcr(
  origen: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  alturaObjetivo = 96,
): HTMLCanvasElement {
  const escala = Math.max(1, Math.min(6, alturaObjetivo / sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * escala);
  canvas.height = Math.round(sh * escala);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(origen, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  const grises = new Uint8ClampedArray(px.length / 4);
  const histograma = new Array<number>(256).fill(0);
  for (let i = 0; i < grises.length; i++) {
    const g = Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]);
    grises[i] = g;
    histograma[g]++;
  }
  const umbral = otsu(histograma, grises.length);
  // Si la mayoría de píxeles son oscuros, el fondo es oscuro: se invierte.
  let oscuros = 0;
  for (const g of grises) if (g < umbral) oscuros++;
  const invertir = oscuros > grises.length / 2;
  for (let i = 0; i < grises.length; i++) {
    const tinta = invertir ? grises[i] >= umbral : grises[i] < umbral;
    const v = tinta ? 0 : 255;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Umbral que mejor separa dos grupos de grises (método de Otsu). */
export function otsu(histograma: readonly number[], total: number): number {
  let suma = 0;
  for (let i = 0; i < 256; i++) suma += i * histograma[i];
  let sumaFondo = 0;
  let pesoFondo = 0;
  let mejor = 0;
  let umbral = 128;
  for (let i = 0; i < 256; i++) {
    pesoFondo += histograma[i];
    if (!pesoFondo) continue;
    const pesoFrente = total - pesoFondo;
    if (!pesoFrente) break;
    sumaFondo += i * histograma[i];
    const mediaFondo = sumaFondo / pesoFondo;
    const mediaFrente = (suma - sumaFondo) / pesoFrente;
    const entre = pesoFondo * pesoFrente * (mediaFondo - mediaFrente) ** 2;
    if (entre > mejor) {
      mejor = entre;
      umbral = i + 1;
    }
  }
  return umbral;
}
