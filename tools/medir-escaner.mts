/**
 * Mide el escáner con "vídeos" simulados, con el mismo código que la app
 * (src/app/core/reconocimiento.ts): para cada carta, una escena como la de una cámara
 * de verdad y varios fotogramas seguidos, que pasan por el reconocimiento y la votación.
 *
 *   npm run medir:escaner              -> 150 cartas
 *   npm run medir:escaner -- 300       -> otro número de cartas
 *
 * La escena: la carta sobre una mesa, más pequeña o más grande que la guía y algo
 * desplazada, con perspectiva (cizalla), girada, con una dominante de color, a veces
 * un reflejo, desenfocada y en JPEG. Entre fotograma y fotograma, el temblor de la mano.
 * También se simulan cartas que NO están en el catálogo (ilustraciones espejadas), para
 * medir cuántas veces se para con una carta equivocada.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp, { type OverlayOptions } from 'sharp';
import { Huella, PROPORCION_CARTA, distancia, leerHuella } from '../src/app/core/huella.ts';
import {
  REGLAS_VOTO,
  Votacion,
  encuadresAlrededor,
  localizarCarta,
  reconocerEn,
} from '../src/app/core/reconocimiento.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(RAIZ, 'tools', '.cache', 'imagenes');
const FOTOGRAMAS = Number(process.env.FOTOGRAMAS ?? 6);
/** Tamaño de la guía en la captura, como en la app (ANCHO_MUESTRA y MARGEN de scanner.page). */
export const GUIA_W = Number(process.env.GUIA_W ?? 240);
export const GUIA_H = Math.round(GUIA_W / PROPORCION_CARTA);
export const MARGEN = 0.2;
const DURO = process.env.DURO === '1';

export interface Carta {
  cardId: string;
  imgUrl: string;
  orientation: string;
}

export async function imagen(c: Carta): Promise<Buffer> {
  const f = join(CACHE, `${c.cardId.replace(/[^A-Z0-9-]/gi, '_')}-744.webp`);
  if (existsSync(f)) return readFileSync(f);
  const u = new URL(c.imgUrl);
  u.searchParams.set('w', '744');
  u.searchParams.set('fm', 'webp');
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${c.cardId}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(f, buf);
  return buf;
}

export function azar(semilla: number) {
  let s = semilla;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

interface Escena {
  escala: number;
  dx: number;
  dy: number;
  angulo: number;
  cizalla: [number, number];
  ganancias: [number, number, number];
  brillo: number;
  reflejo: { x: number; y: number; fuerza: number } | null;
  fondo: { r: number; g: number; b: number };
}

export function escena(r: () => number): Escena {
  return {
    escala:
      Number(process.env.ESC_MIN ?? 0.75) +
      r() * (Number(process.env.ESC_MAX ?? 1.1) - Number(process.env.ESC_MIN ?? 0.75)), // tamaño de la carta respecto a la guía
    dx: (r() - 0.5) * 0.14,
    dy: (r() - 0.5) * 0.14,
    angulo: (r() - 0.5) * 12,
    // Con DURO=1: más perspectiva, reflejos más fuertes y frecuentes y peor luz.
    cizalla: [(r() - 0.5) * (DURO ? 0.3 : 0.12), (r() - 0.5) * (DURO ? 0.3 : 0.12)],
    ganancias: [0.82 + r() * 0.36, 0.82 + r() * 0.36, 0.82 + r() * 0.36],
    brillo: DURO ? 0.45 + r() * 0.9 : 0.6 + r() * 0.7,
    reflejo:
      r() < (DURO ? 0.8 : 0.4)
        ? { x: r(), y: r(), fuerza: DURO ? 0.5 + r() * 0.45 : 0.25 + r() * 0.45 }
        : null,
    fondo: { r: Math.round(r() * 200), g: Math.round(r() * 200), b: Math.round(r() * 200) },
  };
}

/** Un fotograma de la escena, del tamaño de lo que captura la app (guía + margen). */
export async function fotograma(carta: Buffer, e: Escena, r: () => number, espejo: boolean) {
  const W = Math.round(GUIA_W * (1 + 2 * MARGEN));
  const H = Math.round(GUIA_H * (1 + 2 * MARGEN));
  const cw = Math.round(GUIA_W * e.escala);
  const ch = Math.round(cw / PROPORCION_CARTA);
  let img = sharp(carta).resize(cw, ch);
  if (espejo) img = img.flop();
  const deformadaGrande = await img
    .affine(
      [
        [1, e.cizalla[0]],
        [e.cizalla[1], 1],
      ],
      { background: { r: 0, g: 0, b: 0, alpha: 0 } },
    )
    .rotate(e.angulo + (r() - 0.5) * 1.5, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer({ resolveWithObject: true });
  // Con mucha perspectiva la carta deformada puede no caber: se reduce hasta que quepa.
  const deformada =
    deformadaGrande.info.width > W - 2 || deformadaGrande.info.height > H - 2
      ? await sharp(deformadaGrande.data)
          .resize(W - 2, H - 2, { fit: 'inside' })
          .png()
          .toBuffer({ resolveWithObject: true })
      : deformadaGrande;
  const temblor = () => (r() - 0.5) * 0.04;
  const left = Math.round((W - deformada.info.width) / 2 + (e.dx + temblor()) * GUIA_W);
  const top = Math.round((H - deformada.info.height) / 2 + (e.dy + temblor()) * GUIA_H);
  const capas: OverlayOptions[] = [
    {
      input: deformada.data,
      left: Math.max(-deformada.info.width + 1, left),
      top: Math.max(-deformada.info.height + 1, top),
    },
  ];
  if (e.reflejo) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="g"><stop offset="0" stop-color="#fff" stop-opacity="${e.reflejo.fuerza}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><ellipse cx="${e.reflejo.x * W}" cy="${e.reflejo.y * H}" rx="${W * 0.35}" ry="${H * 0.2}" fill="url(#g)"/></svg>`;
    capas.push({ input: Buffer.from(svg), left: 0, top: 0 });
  }
  const [gr, gg, gb] = e.ganancias;
  const jpeg = await sharp({ create: { width: W, height: H, channels: 3, background: e.fondo } })
    .composite(capas.filter((c) => (c.left ?? 0) < W && (c.top ?? 0) < H))
    .recomb([
      [gr * e.brillo, 0, 0],
      [0, gg * e.brillo, 0],
      [0, 0, gb * e.brillo],
    ])
    .blur(0.4 + r() * 1.2)
    .jpeg({ quality: Math.round(50 + r() * 35) })
    .toBuffer();
  const { data, info } = await sharp(jpeg)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function main() {
  const muestras = Number(process.argv[2]) || 150;
  const { cards } = JSON.parse(readFileSync(join(RAIZ, 'public/data/catalog.json'), 'utf8')) as {
    cards: Carta[];
  };
  const { huellas: crudas } = JSON.parse(
    readFileSync(join(RAIZ, 'public/data/huellas.json'), 'utf8'),
  ) as { huellas: Record<string, string> };
  const huellas = new Map<string, Huella>(
    Object.entries(crudas).map(([id, s]) => [id, leerHuella(s)!]),
  );
  const gemelas = (id: string) => {
    const h = huellas.get(id)!;
    return new Set([...huellas].filter(([, o]) => distancia(h, o) < 0.04).map(([k]) => k));
  };

  const r = azar(7);
  const verticales = cards.filter((c) => c.orientation !== 'landscape');
  const guia = { x: GUIA_W * MARGEN, y: GUIA_H * MARGEN, w: GUIA_W, h: GUIA_H };
  const encuadres = encuadresAlrededor(guia);

  let top1 = 0;
  let top5 = 0;
  let lecturas = 0;
  let paraBien = 0;
  let paraMal = 0;
  let noPara = 0;
  let falsos = 0;
  let negativos = 0;
  const fotogramasHastaParar: number[] = [];
  const estBien: [number, number][] = [];
  const estNeg: [number, number][] = [];

  for (let i = 0; i < muestras; i++) {
    const c = verticales[Math.floor(r() * verticales.length)];
    const ok = gemelas(c.cardId);
    const buf = await imagen(c);
    // Una de cada cuatro escenas es una carta que no está en el catálogo (espejada).
    const espejo = i % 4 === 3;
    const e = escena(r);
    const voto = new Votacion({
      ventana: Number(process.env.V_VENTANA ?? REGLAS_VOTO.ventana),
      votos: Number(process.env.V_VOTOS ?? REGLAS_VOTO.votos),
      distancia: Number(process.env.V_DIST ?? REGLAS_VOTO.distancia),
      margen: Number(process.env.V_MARGEN ?? REGLAS_VOTO.margen),
    });
    let parada: string | null = null;
    let n = 0;
    for (let f = 0; f < FOTOGRAMAS && !parada; f++) {
      const px = await fotograma(buf, e, r, espejo);
      const modo = process.env.MODO ?? 'app';
      // 'app' es lo que hace el escáner: localizar la carta y, por si acaso, unos encuadres
      // centrados en la guía.
      const zonas =
        modo === 'rejilla'
          ? encuadres
          : modo === 'localizar'
            ? localizarCarta(px, guia, 6)
            : [...localizarCarta(px, guia, 6), ...encuadresAlrededor(guia, [0.6, 0.8, 1])];
      const res = reconocerEn(px, zonas, huellas, new Set(), Number(process.env.TOP_ENC ?? 6));
      n++;
      const d0 = res.candidatas[0]?.distancia ?? 1;
      if (espejo) estNeg.push([d0, res.margen]);
      else if (ok.has(res.candidatas[0]?.cardId)) estBien.push([d0, res.margen]);
      if (!espejo) {
        lecturas++;
        if (ok.has(res.candidatas[0]?.cardId)) top1++;
        if (res.candidatas.some((x) => ok.has(x.cardId))) top5++;
      }
      parada = voto.anadir(res);
    }
    if (espejo) {
      negativos++;
      if (parada) falsos++;
    } else if (!parada) noPara++;
    else if (ok.has(parada)) {
      paraBien++;
      fotogramasHastaParar.push(n);
    } else paraMal++;
  }

  const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)} %`;
  const positivos = muestras - negativos;
  const media =
    fotogramasHastaParar.reduce((a, b) => a + b, 0) / Math.max(1, fotogramasHastaParar.length);
  console.log(
    `Lecturas sueltas: primera ${pct(top1, lecturas)} · entre las 5 primeras ${pct(top5, lecturas)}`,
  );
  console.log(
    `Cámara (${FOTOGRAMAS} fotogramas por carta): se para bien ${pct(paraBien, positivos)} · ` +
      `se para con otra ${pct(paraMal, positivos)} · no se para ${pct(noPara, positivos)} · ` +
      `fotogramas hasta parar ${media.toFixed(1)}`,
  );
  console.log(`Cartas que no están en el catálogo: se para (mal) en ${pct(falsos, negativos)}`);
  const q = (v: number[], p: number) =>
    [...v].sort((a, b) => a - b)[Math.floor(p * (v.length - 1))]?.toFixed(3);
  console.log(
    `aciertos: distancia p50 ${q(
      estBien.map((x) => x[0]),
      0.5,
    )} p90 ${q(
      estBien.map((x) => x[0]),
      0.9,
    )} · margen p10 ${q(
      estBien.map((x) => x[1]),
      0.1,
    )} p50 ${q(
      estBien.map((x) => x[1]),
      0.5,
    )}`,
  );
  console.log(
    `no catalogadas: distancia p10 ${q(
      estNeg.map((x) => x[0]),
      0.1,
    )} p50 ${q(
      estNeg.map((x) => x[0]),
      0.5,
    )} · margen p50 ${q(
      estNeg.map((x) => x[1]),
      0.5,
    )} p90 ${q(
      estNeg.map((x) => x[1]),
      0.9,
    )}`,
  );
}

// Solo al ejecutarlo directamente, no al importarlo desde otro medidor.
if (process.argv[1]?.endsWith('medir-escaner.mts'))
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
