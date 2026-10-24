import { Injectable, inject } from '@angular/core';
import { CatalogService, Confianza } from './catalog.service';
import { CollectionMap, Finish } from './collection.service';
import { MappingOverridesService } from './mapping-overrides.service';
import { CardPrice, PricesService } from './prices.service';

/** Todo lo que hace falta para enseñar el precio de una carta. */
export interface CardPricing {
  idProduct: number | null;
  confianza: Confianza;
  motivo: string;
  /** Alguien del grupo eligió el producto a mano. */
  corregido: boolean;
  corregidoPor: string | null;
  /** Tendencia de Cardmarket. null = sin datos: nunca es 0 €. */
  normal: number | null;
  foil: number | null;
  /** El resto de cifras de Cardmarket, para la ficha. */
  detalle: CardPrice | null;
}

export interface CollectionValue {
  /** Suma de las copias que sí tienen precio. */
  total: number;
  /** Copias valoradas. */
  copiasValoradas: number;
  /** Cartas con al menos una copia sin precio, y cuántas copias son. No suman al total. */
  sinPrecio: { cardId: string; finish: Finish; copias: number }[];
  copiasSinPrecio: number;
  /** Guardadas pero ausentes del catálogo (ids de DotGG sin equivalente, tokens…). Aparte, para no mezclarlas. */
  fueraDeCatalogo: string[];
}

/**
 * Une el catálogo, el mapeo, las correcciones del grupo y los precios del día.
 * Los métodos leen signals, así que en una plantilla o un computed se recalculan solos.
 */
@Injectable({ providedIn: 'root' })
export class ValuationService {
  private readonly catalog = inject(CatalogService);
  private readonly prices = inject(PricesService);
  private readonly overrides = inject(MappingOverridesService);

  pricing(cardId: string): CardPricing {
    const mapeo = this.catalog.mapping(cardId);
    const manual = this.overrides.get(cardId);
    const idProduct = manual?.idProduct ?? mapeo.idProduct;
    const detalle = idProduct ? (this.prices.data()?.prices[idProduct] ?? null) : null;
    return {
      idProduct,
      // Una corrección manual la ha comprobado una persona: se trata como fiable.
      confianza: manual ? 'alta' : mapeo.confianza,
      motivo: manual ? `Corregido a mano por ${manual.by}` : mapeo.motivo,
      corregido: !!manual,
      corregidoPor: manual?.by ?? null,
      normal: detalle?.trend ?? null,
      foil: detalle?.trendFoil ?? null,
      detalle,
    };
  }

  /** Precio de un producto concreto, para comparar candidatos al corregir. */
  productPrice(idProduct: number): CardPrice | null {
    return this.prices.data()?.prices[idProduct] ?? null;
  }

  value(cards: CollectionMap): CollectionValue {
    const salida: CollectionValue = {
      total: 0,
      copiasValoradas: 0,
      sinPrecio: [],
      copiasSinPrecio: 0,
      fueraDeCatalogo: [],
    };
    for (const [cardId, qty] of cards) {
      if (!this.catalog.card(cardId)) {
        salida.fueraDeCatalogo.push(cardId);
        continue;
      }
      const p = this.pricing(cardId);
      for (const finish of ['normal', 'foil'] as const) {
        const copias = qty[finish];
        if (!copias) continue;
        const precio = p[finish];
        if (precio === null) {
          salida.sinPrecio.push({ cardId, finish, copias });
          salida.copiasSinPrecio += copias;
        } else {
          salida.total += precio * copias;
          salida.copiasValoradas += copias;
        }
      }
    }
    return salida;
  }
}
