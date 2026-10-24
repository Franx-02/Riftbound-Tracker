import { Injectable, effect, signal } from '@angular/core';
import { ETIQUETAS_ES, claveTexto } from './traduccion';

export type Idioma = 'es' | 'en';

const CLAVE_IDIOMA = 'riftbound-idioma';

/**
 * Idioma del texto de las cartas y sus traducciones (/data/catalog_es.json, generado
 * por tools/traducir.mts). La interfaz va siempre en español; esto solo decide si el
 * texto de reglas, la ambientación y los tipos se enseñan traducidos o en inglés.
 */
@Injectable({ providedIn: 'root' })
export class TraduccionService {
  readonly idioma = signal<Idioma>(leerIdioma());
  private readonly traducciones = signal<Readonly<Record<string, string>>>({});
  private carga: Promise<void> | null = null;

  constructor() {
    // Preferencia del navegador: comodidad, no dato importante. Si no se puede guardar, da igual.
    effect(() => {
      try {
        localStorage.setItem(CLAVE_IDIOMA, this.idioma());
      } catch {
        /* modo incógnito o almacenamiento bloqueado */
      }
    });
  }

  load(): Promise<void> {
    this.carga ??= this.cargar();
    return this.carga;
  }

  private async cargar(): Promise<void> {
    try {
      const res = await fetch('/data/catalog_es.json');
      // Sin fichero de traducciones la app funciona igual, todo en inglés.
      if (!res.ok) return;
      const datos = (await res.json()) as { traducciones?: Record<string, string> };
      this.traducciones.set(datos.traducciones ?? {});
    } catch {
      this.carga = null;
    }
  }

  /** La traducción de un texto inglés, o null si todavía no está traducido. */
  traducir(en: string | null | undefined): string | null {
    if (!en) return null;
    return this.traducciones()[claveTexto(en)] ?? null;
  }

  /** Texto a enseñar según el idioma elegido, y si ha tenido que caer al inglés. */
  texto(en: string | null | undefined): { valor: string; sinTraducir: boolean } {
    const original = en ?? '';
    if (this.idioma() === 'en' || !original) return { valor: original, sinTraducir: false };
    const es = this.traducir(original);
    return es ? { valor: es, sinTraducir: false } : { valor: original, sinTraducir: true };
  }

  /** Tipo, dominio, rareza… según el idioma (docs/glosario.md). */
  etiqueta(termino: string): string {
    return this.idioma() === 'es' ? (ETIQUETAS_ES[termino] ?? termino) : termino;
  }
}

function leerIdioma(): Idioma {
  try {
    return localStorage.getItem(CLAVE_IDIOMA) === 'en' ? 'en' : 'es';
  } catch {
    return 'es';
  }
}
