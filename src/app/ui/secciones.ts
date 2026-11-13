/** Rectángulo de esquinas redondeadas como trazo, para que cada icono sea un solo `path`. */
function caja(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}` +
    `h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`
  );
}

export interface Seccion {
  ruta: string;
  texto: string;
  /** Texto de la barra inferior del móvil, si el largo no cabe. */
  corto?: string;
  /** Trazo del icono (viewBox 0 0 24 24, sin relleno). */
  icono: string;
  /** Va en la barra inferior del móvil; el resto, en la hoja de "Más". */
  barra: boolean;
}

/**
 * Las secciones de la app, en el orden del menú. Las usan la barra de navegación y los
 * accesos de la página de inicio, para que iconos y nombres sean los mismos en los dos sitios.
 */
export const SECCIONES: readonly Seccion[] = [
  {
    ruta: '/inicio',
    texto: 'Inicio',
    icono: 'M4 11l8-7 8 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5z',
    barra: true,
  },
  {
    ruta: '/coleccion',
    texto: 'Mi colección',
    corto: 'Colección',
    icono: caja(3, 4, 7, 9, 1.5) + caja(14, 4, 7, 9, 1.5) + caja(3, 15, 18, 5, 1.5),
    barra: true,
  },
  {
    ruta: '/catalogo',
    texto: 'Catálogo',
    icono: 'M4.5 11a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0M16 16l4.5 4.5',
    barra: true,
  },
  {
    ruta: '/escanear',
    texto: 'Escanear',
    icono:
      'M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16' +
      caja(8.5, 7.5, 7, 9, 1),
    barra: true,
  },
  {
    ruta: '/deseos',
    texto: 'Deseos',
    icono: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
    barra: false,
  },
  {
    ruta: '/mazos',
    texto: 'Mazos',
    icono: caja(7, 3, 12, 16, 1.5) + 'M4 7v12.5A1.5 1.5 0 0 0 5.5 21H15',
    barra: false,
  },
  {
    ruta: '/sobres',
    texto: 'Sobres',
    icono: 'M5 4h14l-1.5 3H6.5zM5 7h14v13H5zM5 7l7 5 7-5',
    barra: false,
  },
  {
    ruta: '/bote',
    texto: 'Bote',
    icono: 'M5 9h14l-1 11H6zM8 9V6.5a4 4 0 0 1 8 0V9M9.5 14.5h5',
    barra: false,
  },
  {
    ruta: '/intercambios',
    texto: 'Intercambios',
    icono: 'M4 8h13l-3-3M20 16H7l3 3',
    barra: false,
  },
];

/** Solo en la hoja de "Más": en escritorio se llega desde Mi colección. */
export const IMPORTAR: Seccion = {
  ruta: '/importar',
  texto: 'Importar / exportar',
  icono: 'M12 4v11m0 0l-4-4m4 4l4-4M5 20h14',
  barra: false,
};
