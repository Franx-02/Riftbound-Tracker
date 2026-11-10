import {
  Pixeles,
  calcularHuella,
  distancia,
  huellasConMargen,
  leerHuella,
  masParecidas,
  menorDistancia,
  prepararPixeles,
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

  // Las tres siguientes fijan que las optimizaciones del escáner no cambian ningún resultado.
  it('con la imagen preparada sale exactamente la misma huella', () => {
    const regiones = [
      { x: 0, y: 0, w: 240, h: 336 },
      { x: 19.2, y: 23.5, w: 201.6, h: 144.5 }, // la ilustración de una carta
      { x: -30, y: -12, w: 150, h: 90 }, // se sale por arriba y por la izquierda
      { x: 200, y: 300, w: 120, h: 120 }, // se sale por abajo y por la derecha
      { x: 10.4, y: 7.7, w: 13.3, h: 9.5 }, // más pequeña que la rejilla de 32×32
      { x: 500, y: 500, w: 40, h: 40 }, // fuera del todo
    ];
    for (const semilla of [1, 2, 3]) {
      const sinPreparar = regiones.map((r) => calcularHuella(imagen(semilla, 240, 336), r));
      const foto = imagen(semilla, 240, 336);
      prepararPixeles(foto);
      regiones.forEach((r, i) => {
        const h = calcularHuella(foto, r);
        expect(h.hash).toEqual(sinPreparar[i].hash);
        expect(Array.from(h.color)).toEqual(Array.from(sinPreparar[i].color));
      });
    }
  });

  it('masParecidas da las mismas distancias y el mismo orden que comparar una a una', () => {
    const catalogo = new Map(
      Array.from({ length: 40 }, (_, s) => [`C-${s}`, calcularHuella(imagen(s))] as const),
    );
    const variantes = huellasConMargen(imagen(7, 240, 336), { x: 0, y: 0, w: 240, h: 336 });
    const aMano = [...catalogo]
      .map(([cardId, h]) => ({
        cardId,
        distancia: Math.min(...variantes.map((q) => distancia(q, h))),
      }))
      .sort((a, b) => a.distancia - b.distancia);
    expect(masParecidas(variantes, catalogo, 40)).toEqual(aMano);
    // Con otro peso del color también (lo usa la herramienta de medir).
    const conPeso = [...catalogo]
      .map(([cardId, h]) => ({
        cardId,
        distancia: Math.min(...variantes.map((q) => distancia(q, h, 0.5))),
      }))
      .sort((a, b) => a.distancia - b.distancia);
    expect(masParecidas(variantes, catalogo, 5, 0.5)).toEqual(conPeso.slice(0, 5));
  });

  it('menorDistancia es la distancia de la primera de masParecidas', () => {
    const catalogo = new Map(
      Array.from({ length: 40 }, (_, s) => [`C-${s}`, calcularHuella(imagen(s))] as const),
    );
    for (const semilla of [3, 11, 99]) {
      const q = calcularHuella(imagen(semilla, 200, 280, 0.8));
      expect(menorDistancia(q, catalogo)).toBe(masParecidas([q], catalogo, 1)[0].distancia);
      expect(menorDistancia(q, catalogo)).toBe(
        Math.min(...[...catalogo.values()].map((h) => distancia(q, h))),
      );
    }
    expect(menorDistancia(calcularHuella(imagen(1)), new Map())).toBeUndefined();
  });
});
