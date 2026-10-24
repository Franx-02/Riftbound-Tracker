import { Pipe, PipeTransform } from '@angular/core';

const EUROS = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

/** `1.23` → `1,23 €`. null → `sin precio`: Cardmarket usa 0 para "sin datos" y nunca es 0 €. */
@Pipe({ name: 'eur' })
export class EurPipe implements PipeTransform {
  transform(valor: number | null | undefined, vacio = 'sin precio'): string {
    return valor === null || valor === undefined ? vacio : EUROS.format(valor);
  }
}

/**
 * Pide la imagen al CDN de Riot ya reducida y en WebP. La original es un PNG de
 * 744×1039 que pesa unos 780 KB; a 240 px de ancho en WebP son unos 14 KB.
 */
@Pipe({ name: 'thumb' })
export class ThumbPipe implements PipeTransform {
  transform(url: string, ancho: number): string {
    try {
      const u = new URL(url);
      u.searchParams.set('w', String(ancho));
      u.searchParams.set('fm', 'webp');
      return u.toString();
    } catch {
      return url;
    }
  }
}
