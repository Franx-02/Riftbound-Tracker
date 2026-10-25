/**
 * Genera los vectores de imagen del catálogo para el escáner (red neuronal DINOv2).
 *
 *   npm run build:vectores
 *
 * Escribe public/data/vectores.json (modelo, dimensión y orden de las cartas) y
 * public/data/vectores.bin (un vector por carta, normalizado y cuantizado a int8:
 * 384 bytes por carta, unos 600 KB en total). La app calcula el vector de lo que ve la
 * cámara con el MISMO modelo y la misma zona (src/app/core/red.service.ts) y compara.
 * Hay que volver a ejecutarlo cada vez que se regenere el catálogo, como build:huellas.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RawImage, pipeline } from '@huggingface/transformers';
import sharp from 'sharp';
import { MODELO_RED, recortarZonaRed, vectorDeSalida } from '../src/app/core/red.ts';
import { Carta, imagen } from './medir-escaner.mts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const extractor = await pipeline('image-feature-extraction', MODELO_RED, { dtype: 'q8' });
  const { cards } = JSON.parse(readFileSync(join(RAIZ, 'public/data/catalog.json'), 'utf8')) as {
    cards: Carta[];
  };
  // Los campos de batalla (apaisados) no caben en la guía vertical: se quedan fuera.
  const cartas = cards.filter((c) => c.orientation !== 'landscape');
  const vectores: Float32Array[] = [];
  const t0 = Date.now();
  for (const [i, c] of cartas.entries()) {
    const { data, info } = await sharp(await imagen(c))
      .resize(372)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const px = { data, width: info.width, height: info.height };
    const r = recortarZonaRed(px, { x: 0, y: 0, w: info.width, h: info.height });
    const salida = await extractor(new RawImage(r.data, r.width, r.height, 3));
    vectores.push(vectorDeSalida(salida.data as Float32Array, salida.dims));
    if (i % 200 === 0)
      console.log(`${i}/${cartas.length} (${Math.round((Date.now() - t0) / (i + 1))} ms/carta)`);
  }
  const dim = vectores[0].length;
  const bin = new Int8Array(vectores.length * dim);
  vectores.forEach((v, i) => {
    for (let j = 0; j < dim; j++)
      bin[i * dim + j] = Math.max(-127, Math.min(127, Math.round(v[j] * 127)));
  });
  writeFileSync(join(RAIZ, 'public/data/vectores.bin'), Buffer.from(bin.buffer));
  writeFileSync(
    join(RAIZ, 'public/data/vectores.json'),
    JSON.stringify({
      generado: new Date().toISOString(),
      modelo: MODELO_RED,
      dim,
      ids: cartas.map((c) => c.cardId),
    }) + '\n',
  );
  console.log(`${vectores.length} vectores de ${dim} dimensiones en public/data/vectores.bin`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
