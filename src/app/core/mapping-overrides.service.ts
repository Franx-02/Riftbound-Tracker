import { Injectable, inject, signal } from '@angular/core';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { DEMO, escribirDemo, leerDemo } from './demo';
import { db } from './firebase';

/**
 * Corrección manual del producto de Cardmarket de una carta. `mappingOverrides/{cardId}`.
 * Es compartida: la corrige uno y vale para todo el grupo, y manda sobre el cálculo
 * automático de mapping.json (docs/HANDOFF.md, sección 6).
 */
export interface MappingOverride {
  idProduct: number;
  /** Nombre de quien la hizo, para que el resto sepa de dónde sale. */
  by: string;
  /** ISO 8601. */
  at: string;
}

const CLAVE_DEMO = 'mapping-overrides';

@Injectable({ providedIn: 'root' })
export class MappingOverridesService {
  private readonly auth = inject(AuthService);

  readonly overrides = signal<ReadonlyMap<string, MappingOverride>>(new Map());
  readonly error = signal<string | null>(null);
  private carga: Promise<void> | null = null;

  /** Una sola lectura de la colección entera: son pocas y caben de sobra en memoria. */
  load(): Promise<void> {
    this.carga ??= this.cargar();
    return this.carga;
  }

  private async cargar(): Promise<void> {
    try {
      if (DEMO) {
        this.overrides.set(
          new Map(Object.entries(leerDemo<Record<string, MappingOverride>>(CLAVE_DEMO, {}))),
        );
        return;
      }
      const snap = await getDocs(collection(db, 'mappingOverrides'));
      this.overrides.set(new Map(snap.docs.map((d) => [d.id, d.data() as MappingOverride])));
      this.error.set(null);
    } catch (e) {
      this.carga = null;
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  get(cardId: string): MappingOverride | undefined {
    return this.overrides().get(cardId.toUpperCase());
  }

  /** Fija el producto de una carta para todo el grupo. Optimista, como la colección. */
  async set(cardId: string, idProduct: number): Promise<void> {
    const user = this.auth.user();
    const valor: MappingOverride = {
      idProduct,
      // Solo el nombre: lo lee cualquiera, y el email no se publica.
      by: (user?.displayName?.trim() || 'Alguien').slice(0, 80),
      at: new Date().toISOString(),
    };
    await this.cambiar(cardId.toUpperCase(), valor);
  }

  /** Vuelve al cálculo automático. */
  async clear(cardId: string): Promise<void> {
    await this.cambiar(cardId.toUpperCase(), null);
  }

  private async cambiar(cardId: string, valor: MappingOverride | null): Promise<void> {
    const anterior = this.overrides().get(cardId);
    this.aplicar(cardId, valor);
    try {
      if (DEMO) {
        const todos = leerDemo<Record<string, MappingOverride>>(CLAVE_DEMO, {});
        if (valor) todos[cardId] = valor;
        else delete todos[cardId];
        escribirDemo(CLAVE_DEMO, todos);
      } else {
        const ref = doc(db, 'mappingOverrides', cardId);
        await (valor ? setDoc(ref, valor) : deleteDoc(ref));
      }
      this.error.set(null);
    } catch (e) {
      this.aplicar(cardId, anterior ?? null);
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  private aplicar(cardId: string, valor: MappingOverride | null): void {
    const copia = new Map(this.overrides());
    if (valor) copia.set(cardId, valor);
    else copia.delete(cardId);
    this.overrides.set(copia);
  }
}
