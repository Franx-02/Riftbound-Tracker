/**
 * Genera public/data/huellas.json: la huella visual de la ilustración de cada carta,
 * para que el escáner la reconozca por la foto (ver src/app/core/huella.ts).
 *
 *   npm run build:huellas              -> descarga las imágenes y escribe el fichero
 *   npm run build:huellas -- --medir   -> además simula fotos (encuadre torcido, luz,
 *                                         desenfoque, JPEG) y mide cuántas acierta
 *
 * Las imágenes se piden al CDN de Riot ya reducidas (como hace la app) y se guardan en
 * tools/.cache/imagenes para no volver a bajarlas.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  Huella,
  PROPORCION_CARTA,
  calcularHuella,
  distancia,
  huellasConMargen,
  leerHuella,
  masParecidas,
  regionIlustracion,
  serializarHuella,
} from '../src/app/core/huella.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOGO = join(RAIZ, 'public', 'data', 'catalog.json');
const SALIDA = join(RAIZ, 'public', 'data', 'huellas.json');
const CACHE = join(RAIZ, 'tools', '.cache', 'imagenes');
/** Ancho al que se bajan las imágenes: de sobra para una huella de 32×32. */
const ANCHO = 372;

interface Carta {
  cardId: string;
  imgUrl: string;
  orientation: string;
}

function urlReducida(url: string, ancho: number): string {
  const u = new URL(url);
  u.searchParams.set('w', String(ancho));
  u.searchParams.set('fm', 'webp');
  return u.toString();
}

async function imagen(carta: Carta, ancho = ANCHO): Promise<Buffer> {
  const fichero = join(CACHE, `${carta.cardId.replace(/[^A-Z0-9-]/gi, '_')}-${ancho}.webp`);
  if (existsSync(fichero)) return readFileSync(fichero);
  for (let intento = 1; ; intento++) {
    try {
      const r = await fetch(urlReducida(carta.imgUrl, ancho));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      writeFileSync(fichero, buf);
      return buf;
    } catch (e) {
      if (intento >= 3) throw new Error(`${carta.cardId}: ${e instanceof Error ? e.message : e}`);
      await new Promise((ok) => setTimeout(ok, 1000 * intento));
    }
  }
}

/** Píxeles RGBA de una imagen, girada a vertical si la carta es apaisada (campos de batalla). */
async function pixeles(buf: Buffer, apaisada: boolean) {
  let img = sharp(buf).ensureAlpha();
  if (apaisada) img = img.rotate(90);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function huellaDe(buf: Buffer, apaisada: boolean): Promise<Huella> {
  const px = await pixeles(buf, apaisada);
  return calcularHuella(px, regionIlustracion(px.width, px.height));
}

/** Ejecuta `tarea` sobre la lista con como mucho `n` a la vez. */
async function enParalelo<T, R>(lista: T[], n: number, tarea: (x: T) => Promise<R>): Promise<R[]> {
  const salida: R[] = new Array(lista.length);
  let siguiente = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (siguiente < lista.length) {
        const i = siguiente++;
        salida[i] = await tarea(lista[i]);
      }
    }),
  );
  return salida;
}

// ---------------------------------------------------------------- simulación de fotos

/** Generador pseudoaleatorio con semilla, para que la medición sea repetible. */
function azar(semilla: number) {
  let s = semilla;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/**
 * Una "foto" de la carta: la imagen oficial con un encuadre que no coincide del todo
 * con la guía (hasta un 6 % de desplazamiento y tamaño), un poco girada, con otra luz,
 * otra saturación, algo desenfocada y comprimida en JPEG.
 */
async function fotoSimulada(buf: Buffer, apaisada: boolean, r: () => number): Promise<Buffer> {
  const base = await sharp(buf)
    .rotate(apaisada ? 90 : 0)
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = base.info;
  const angulo = (r() - 0.5) * 8;
  const girada = await sharp(base.data)
    .rotate(angulo, { background: '#444' })
    .toBuffer({ resolveWithObject: true });
  // Recorte con forma de carta, desplazado y escalado al azar respecto a la carta real.
  const escala = 1 + (r() - 0.5) * 0.12;
  const cw = Math.round(w * escala);
  const ch = Math.round(cw / PROPORCION_CARTA);
  const left = Math.round((girada.info.width - cw) / 2 + (r() - 0.5) * 0.12 * w);
  const top = Math.round((girada.info.height - ch) / 2 + (r() - 0.5) * 0.12 * h);
  const ext = {
    left: Math.max(0, -left),
    top: Math.max(0, -top),
    right: Math.max(0, left + cw - girada.info.width),
    bottom: Math.max(0, top + ch - girada.info.height),
  };
  // Dos pasos: en una misma cadena, sharp recorta antes de ampliar el lienzo.
  const ampliada = await sharp(girada.data)
    .extend({ ...ext, background: '#444' })
    .toBuffer();
  return sharp(ampliada)
    .extract({ left: left + ext.left, top: top + ext.top, width: cw, height: ch })
    .modulate({ brightness: 0.7 + r() * 0.6, saturation: 0.75 + r() * 0.5 })
    .blur(0.3 + r() * 1.5)
    .resize(Math.round(300 + r() * 300))
    .jpeg({ quality: Math.round(45 + r() * 40) })
    .toBuffer();
}

async function medir(cartas: Carta[], huellas: Map<string, Huella>, muestras: number) {
  const r = azar(42);
  const elegidas = Array.from({ length: muestras }, () => cartas[Math.floor(r() * cartas.length)]);
  const fotos = await enParalelo(elegidas, 8, async (c) => {
    const original = await imagen(c, 744);
    const foto = await fotoSimulada(original, c.orientation === 'landscape', r);
    const px = await pixeles(foto, false);
    return {
      cardId: c.cardId,
      variantes: huellasConMargen(px, regionIlustracion(px.width, px.height)),
    };
  });
  // Cartas con la misma ilustración que la buscada (firmadas, promos reimpresas…): son
  // indistinguibles por la imagen, así que cualquiera de ellas cuenta como acierto.
  const gemelas = (id: string) => {
    const h = huellas.get(id)!;
    return new Set([...huellas].filter(([, o]) => distancia(h, o) < 0.04).map(([k]) => k));
  };
  const dBien: number[] = [];
  const dMal: number[] = [];
  const margenes: number[] = [];
  for (const f of fotos) {
    const ok = gemelas(f.cardId);
    const orden = masParecidas(f.variantes, huellas, 20);
    const primeraAjena = orden.find((o) => !ok.has(o.cardId))!;
    if (ok.has(orden[0].cardId)) {
      dBien.push(orden[0].distancia);
      margenes.push(primeraAjena.distancia - orden[0].distancia);
    } else dMal.push(orden[0].distancia);
  }
  const q = (v: number[], p: number) =>
    [...v].sort((a, b) => a - b)[Math.floor(p * (v.length - 1))]?.toFixed(3);
  console.log(
    `distancia acierto: p50 ${q(dBien, 0.5)} p90 ${q(dBien, 0.9)} · fallo: p10 ${q(dMal, 0.1)} p50 ${q(dMal, 0.5)} · margen con la siguiente en aciertos: p10 ${q(margenes, 0.1)} p50 ${q(margenes, 0.5)}`,
  );
  for (const peso of [1]) {
    let top1 = 0;
    let top5 = 0;
    for (const f of fotos) {
      const ok = gemelas(f.cardId);
      const orden = masParecidas(f.variantes, huellas, 5, peso);
      if (ok.has(orden[0].cardId)) top1++;
      if (orden.some((o) => ok.has(o.cardId))) top5++;
    }
    const pct = (n: number) => `${((100 * n) / fotos.length).toFixed(1)} %`;
    console.log(`peso color ${peso}: primera ${pct(top1)} · entre las 5 primeras ${pct(top5)}`);
  }
}

// ---------------------------------------------------------------- principal

async function main() {
  mkdirSync(CACHE, { recursive: true });
  const { cards } = JSON.parse(readFileSync(CATALOGO, 'utf8')) as { cards: Carta[] };
  let hechas = 0;
  const lista = await enParalelo(cards, 12, async (c) => {
    const h = await huellaDe(await imagen(c), c.orientation === 'landscape');
    if (++hechas % 200 === 0) console.log(`${hechas}/${cards.length}`);
    return [c.cardId, serializarHuella(h)] as const;
  });
  const huellas = Object.fromEntries(lista);
  writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), huellas }) + '\n');
  console.log(`${lista.length} huellas en public/data/huellas.json`);

  if (process.argv.includes('--medir')) {
    const mapa = new Map(lista.map(([id, s]) => [id, leerHuella(s)!]));
    await medir(cards, mapa, 300);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
