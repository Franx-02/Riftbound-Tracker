import {
  Pixeles,
  calcularHuella,
  distancia,
  huellasConMargen,
  leerHuella,
  masParecidas,
  serializarHuella,
} from './huella';

/** Una imagen de prueba que depende de la semilla y escala bien (coordenadas relativas). */
function imagen(semilla: number, w = 120, h = 168, brillo = 1): Pixeles {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const u = x / w;
      const v = y / h;
      const bloque = (Math.floor(u * 6) * 7 + Math.floor(v * 7) * 13 + semilla * 31) % 255;
      data[i] = ((bloque + u * 120) % 256) * brillo;
      data[i + 1] = ((bloque * 3 + v * 120) % 256) * brillo;
      data[i + 2] = ((semilla * 50 + (u + v) * 100) % 256) * brillo;
      data[i + 3] = 255;
    }
  return { data, width: w, height: h };
}

describe('huella', () => {
  it('se serializa y se vuelve a leer igual', () => {
    const h = calcularHuella(imagen(1));
    const leida = leerHuella(serializarHuella(h))!;
    expect(leida.hash).toEqual(h.hash);
    expect(Array.from(leida.color)).toEqual(Array.from(h.color));
    expect(distancia(h, leida)).toBe(0);
  });

  it('una misma imagen con otra luz queda más cerca que una imagen distinta', () => {
    const a = calcularHuella(imagen(1));
    const aOscura = calcularHuella(imagen(1, 120, 168, 0.7));
    const b = calcularHuella(imagen(2));
    expect(distancia(a, aOscura)).toBeLessThan(distancia(a, b));
  });

  it('encuentra la carta aunque esté a otro tamaño', () => {
    const catalogo = new Map([1, 2, 3, 4, 5].map((s) => [`C-${s}`, calcularHuella(imagen(s))]));
    const foto = imagen(3, 240, 336);
    const r = masParecidas(huellasConMargen(foto, { x: 0, y: 0, w: 240, h: 336 }), catalogo, 3);
    expect(r[0].cardId).toBe('C-3');
  });
});
