import { Injectable, computed, inject, signal } from '@angular/core';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { CatalogCard } from './catalog.service';
import { DEMO, escribirDemo, leerDemo } from './demo';
import { db } from './firebase';
import { Album, Sobre, abrirSobre, albumVacio, consumir, guardarEnAlbum, recargar } from './sobres';

/**
 * Álbum virtual del módulo Sobres: lo que has sacado abriendo sobres. Vive en un solo
 * documento (`users/{uid}/album/virtual`) y no tiene relación con la colección real.
 */
@Injectable({ providedIn: 'root' })
export class AlbumService {
  private readonly auth = inject(AuthService);

  readonly album = signal<Album>(albumVacio());
  readonly error = signal<string | null>(null);
  private readonly uid = signal<string | null>(null);
  readonly listo = computed(() => this.uid() !== null);

  private carga: Promise<void> | null = null;
  private sesion: string | null = null;
  private cola: Promise<unknown> = Promise.resolve();

  private comprobarSesion(): void {
    const uid = this.auth.user()?.uid ?? null;
    if (uid === this.sesion) return;
    this.sesion = uid;
    this.carga = null;
    this.album.set(albumVacio());
    this.uid.set(null);
    this.error.set(null);
  }

  load(): Promise<void> {
    this.comprobarSesion();
    this.carga ??= this.cargar();
    return this.carga;
  }

  private async cargar(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) return;
    try {
      const bruto = DEMO
        ? leerDemo<unknown>(`album-${uid}`, null)
        : ((await getDoc(referencia(uid))).data() ?? null);
      if (this.sesion !== uid) return;
      const album = normalizar(bruto);
      this.album.set({ ...album, aperturas: recargar(album.aperturas) });
      this.uid.set(uid);
      this.error.set(null);
    } catch (e) {
      this.carga = null;
      this.error.set(`No se pudo cargar el álbum: ${mensaje(e)}`);
    }
  }

  /** Copias de una carta en el álbum. */
  copias(cardId: string): number {
    return this.album().cartas[cardId] ?? 0;
  }

  /** Abre un sobre si queda alguno; devuelve las cartas o null (sin sobres o sin cartas del set). */
  abrir(
    set: string,
    catalogo: readonly CatalogCard[],
    azar: () => number = Math.random,
  ): Sobre | null {
    this.comprobarSesion();
    const uid = this.uid();
    if (!uid) {
      this.error.set('El álbum aún no se ha cargado');
      return null;
    }
    const ahora = new Date();
    const aperturas = consumir(this.album().aperturas, ahora);
    if (!aperturas) return null;
    const sobre = abrirSobre(set, catalogo, azar);
    if (!sobre) return null;
    const anterior = this.album();
    const nuevo = guardarEnAlbum({ ...anterior, aperturas }, sobre, ahora);
    this.album.set(nuevo);
    this.guardar(uid, nuevo, anterior);
    return sobre;
  }

  /** Reaplica la recarga por tiempo (para el contador en pantalla). */
  refrescar(): void {
    const a = this.album();
    const r = recargar(a.aperturas);
    if (r.restantes !== a.aperturas.restantes || r.desde !== a.aperturas.desde) {
      this.album.set({ ...a, aperturas: r });
    }
  }

  private guardar(uid: string, nuevo: Album, anterior: Album): void {
    const datos = { ...nuevo, actualizado: new Date().toISOString() };
    this.cola = this.cola
      .catch(() => {})
      .then(async () => {
        if (DEMO) escribirDemo(`album-${uid}`, datos);
        else await setDoc(referencia(uid), datos);
      })
      .then(() => this.error.set(null))
      .catch((e: unknown) => {
        if (this.uid() === uid) this.album.set(anterior);
        this.error.set(`No se pudo guardar el álbum: ${mensaje(e)}`);
      });
  }

  flush(): Promise<unknown> {
    return this.cola.catch(() => {});
  }
}

function normalizar(bruto: unknown): Album {
  const base = albumVacio();
  if (!bruto || typeof bruto !== 'object') return base;
  const o = bruto as Record<string, unknown>;
  const cartas: Record<string, number> = {};
  if (o['cartas'] && typeof o['cartas'] === 'object') {
    for (const [id, n] of Object.entries(o['cartas'] as Record<string, unknown>)) {
      if (typeof n === 'number' && n > 0) cartas[id] = Math.floor(n);
    }
  }
  const ap = (o['aperturas'] ?? {}) as Record<string, unknown>;
  return {
    cartas,
    aperturas: {
      restantes: typeof ap['restantes'] === 'number' ? ap['restantes'] : base.aperturas.restantes,
      desde: typeof ap['desde'] === 'string' ? ap['desde'] : base.aperturas.desde,
    },
    abiertos: typeof o['abiertos'] === 'number' ? o['abiertos'] : 0,
  };
}

const referencia = (uid: string) => doc(db, 'users', uid, 'album', 'virtual');
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
