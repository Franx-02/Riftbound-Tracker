/**
 * Prueba de reconocimiento con una red neuronal (vectores de imagen) en vez de la huella
 * pHash + color. Usa la misma simulación de cámara que tools/medir-escaner.mts.
 *
 *   MODELO=Xenova/mobilevit-small ZONA=carta npx tsx tools/medir-red.mts 120
 *
 * ZONA: 'carta' (la carta entera) o 'ilustracion' (solo la ilustración).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RawImage, pipeline } from '@huggingface/transformers';
import sharp from 'sharp';
import { PROPORCION_CARTA, ZONA_ILUSTRACION } from '../src/app/core/huella.ts';
import { encuadresAlrededor, localizarCarta, reconocerEn } from '../src/app/core/reconocimiento.ts';
import { Huella, leerHuella } from '../src/app/core/huella.ts';
import {
  Carta,
  GUIA_H,
  GUIA_W,
  MARGEN,
  azar,
  escena,
  fotograma,
  imagen,
} from './medir-escaner.mts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODELO = process.env.MODELO ?? 'Xenova/mobilevit-small';
const ZONA = process.env.ZONA ?? 'carta';
const CACHE = join(RAIZ, 'tools', '.cache');

type Px = { data: ArrayLike<number>; width: number; height: number };
type Caja = { x: number; y: number; w: number; h: number };

const extractor = await pipeline('image-feature-extraction', MODELO, { dtype: 'q8' });

function recortar(px: Px, c: Caja): RawImage {
  const z =
    ZONA === 'ilustracion'
      ? {
          x: c.x + ZONA_ILUSTRACION.x * c.w,
          y: c.y + ZONA_ILUSTRACION.y * c.h,
          w: ZONA_ILUSTRACION.w * c.w,
          h: ZONA_ILUSTRACION.h * c.h,
        }
      : c;
  const x0 = Math.max(0, Math.round(z.x));
  const y0 = Math.max(0, Math.round(z.y));
  const w = Math.max(1, Math.min(px.width - x0, Math.round(z.w)));
  const h = Math.max(1, Math.min(px.height - y0, Math.round(z.h)));
  const out = new Uint8ClampedArray(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * px.width + x0 + x) * 4;
      const o = (y * w + x) * 3;
      out[o] = px.data[i];
      out[o + 1] = px.data[i + 1];
      out[o + 2] = px.data[i + 2];
    }
  return new RawImage(out, w, h, 3);
}

async function vector(img: RawImage): Promise<Float32Array> {
  const t = await extractor(img);
  const d = t.dims;
  const datos = t.data as Float32Array;
  // [1, dim] (agrupado), [1, tokens, dim] (token CLS, el primero) o [1, C, H, W]
  // (mapa de características: se promedia cada canal).
  let v: Float32Array;
  if (d.length === 4) {
    const [, C, H, W] = d;
    v = new Float32Array(C);
    for (let c = 0; c < C; c++) {
      let s = 0;
      for (let i = 0; i < H * W; i++) s += datos[c * H * W + i];
      v[c] = s / (H * W);
    }
  } else v = datos.slice(0, d[d.length - 1]);
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

const coseno = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

async function main() {
  const muestras = Number(process.argv[2]) || 120;
  const { cards } = JSON.parse(readFileSync(join(RAIZ, 'public/data/catalog.json'), 'utf8')) as {
    cards: (Carta & { name: string })[];
  };
  const verticales = cards.filter((c) => c.orientation !== 'landscape');
  const slug = `${MODELO.replace(/\W+/g, '_')}-${ZONA}`;
  const fichero = join(CACHE, `vectores-${slug}.json`);
  let catalogo: Map<string, Float32Array>;
  if (existsSync(fichero)) {
    catalogo = new Map(
      Object.entries(JSON.parse(readFileSync(fichero, 'utf8')) as Record<string, number[]>).map(
        ([k, v]) => [k, Float32Array.from(v)],
      ),
    );
  } else {
    catalogo = new Map();
    const t0 = Date.now();
    for (const [i, c] of verticales.entries()) {
      const { data, info } = await sharp(await imagen(c))
        .resize(372)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      catalogo.set(
        c.cardId,
        await vector(
          recortar(
            { data, width: info.width, height: info.height },
            { x: 0, y: 0, w: info.width, h: info.height },
          ),
        ),
      );
      if (i % 200 === 0)
        console.log(
          `${i}/${verticales.length} (${Math.round((Date.now() - t0) / (i + 1))} ms/carta)`,
        );
    }
    writeFileSync(
      fichero,
      JSON.stringify(
        Object.fromEntries([...catalogo].map(([k, v]) => [k, Array.from(v, (x) => +x.toFixed(4))])),
      ),
    );
  }
  const huellas = new Map<string, Huella>(
    Object.entries(
      (
        JSON.parse(readFileSync(join(RAIZ, 'public/data/huellas.json'), 'utf8')) as {
          huellas: Record<string, string>;
        }
      ).huellas,
    ).map(([k, v]) => [k, leerHuella(v)!]),
  );
  const PESO = Number(process.env.PESO ?? 0);
  const base = (id: string) =>
    cards.find((c) => c.cardId === id)!.name.replace(/\s*\([^)]*\)\s*$/, '');

  const r = azar(7);
  const guia = { x: GUIA_W * MARGEN, y: GUIA_H * MARGEN, w: GUIA_W, h: GUIA_H };
  let top1 = 0,
    top5 = 0,
    n = 0,
    tiempo = 0;
  const bien: number[][] = [],
    mal: number[][] = [],
    neg: number[][] = [];
  for (let i = 0; i < muestras; i++) {
    const c = verticales[Math.floor(r() * verticales.length)];
    const e = escena(r);
    const espejo = i % 4 === 3;
    const px = await fotograma(await imagen(c), e, r, espejo);
    const w = guia.w * 0.75;
    const h = guia.h * 0.75;
    const centro = { x: guia.x + (guia.w - w) / 2, y: guia.y + (guia.h - h) / 2, w, h };
    const loc = localizarCarta(px, guia, 6);
    const rh = PESO
      ? reconocerEn(px, [...loc, ...encuadresAlrededor(guia, [0.6, 0.8, 1])], huellas)
      : null;
    const zonas = process.env.UNO
      ? [rh?.encuadre ?? loc[0] ?? centro]
      : [...loc.slice(0, 2), rh?.encuadre ?? centro];
    const t0 = Date.now();
    const puntos = new Map<string, number>();
    for (const z of zonas) {
      const q = await vector(recortar(px, z));
      for (const [id, v] of catalogo) puntos.set(id, Math.max(puntos.get(id) ?? -1, coseno(q, v)));
    }
    tiempo += Date.now() - t0;
    if (rh)
      for (const c of rh.candidatas)
        puntos.set(c.cardId, (puntos.get(c.cardId) ?? 0) + PESO * Math.max(0, 0.25 - c.distancia));
    const ordenados = [...puntos].sort((a, b) => b[1] - a[1]);
    const orden = ordenados.slice(0, 5).map(([id]) => id);
    const ok = (id: string) => base(id) === base(c.cardId);
    const otra = ordenados.find(([id]) => base(id) !== base(ordenados[0][0]))!;
    const est = [ordenados[0][1], ordenados[0][1] - otra[1]];
    if (espejo) {
      neg.push(est);
      continue;
    }
    (ok(orden[0]) ? bien : mal).push(est);
    n++;
    if (ok(orden[0])) top1++;
    if (orden.some(ok)) top5++;
  }
  const q = (v: number[][], k: number, p: number) =>
    [...v.map((x) => x[k])].sort((a, b) => a - b)[Math.floor(p * (v.length - 1))]?.toFixed(3);
  console.log(
    `aciertos: coseno p10 ${q(bien, 0, 0.1)} p50 ${q(bien, 0, 0.5)} · margen p10 ${q(bien, 1, 0.1)} p50 ${q(bien, 1, 0.5)}`,
  );
  console.log(
    `fallos: coseno p50 ${q(mal, 0, 0.5)} p90 ${q(mal, 0, 0.9)} · margen p50 ${q(mal, 1, 0.5)} p90 ${q(mal, 1, 0.9)}`,
  );
  console.log(
    `no catalogadas: coseno p50 ${q(neg, 0, 0.5)} p90 ${q(neg, 0, 0.9)} · margen p50 ${q(neg, 1, 0.5)} p90 ${q(neg, 1, 0.9)}`,
  );
  console.log(
    `${MODELO} (${ZONA}, carta al ${process.env.ESC_MIN ?? 0.75}-${process.env.ESC_MAX ?? 1.1}): primera ${((100 * top1) / n).toFixed(1)} % · entre 5 ${((100 * top5) / n).toFixed(1)} % · ${Math.round(tiempo / n)} ms por fotograma (${3} recortes)`,
  );
}

await main();
