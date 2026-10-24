import { firebaseConfig } from '../../environments/firebase.config';

/**
 * Modo demo: solo en localhost y solo mientras firebase.config.ts siga sin rellenar.
 * Permite probar la interfaz sin Firebase. En un despliegue real nunca se activa:
 * fuera de localhost, una config sin rellenar simplemente no deja entrar a nadie.
 *
 * La condición es doble a propósito. Vive aquí, y solo aquí, para que todos los
 * servicios que hablan con Firestore usen exactamente la misma comprobación.
 */
export const DEMO =
  firebaseConfig.apiKey === 'REEMPLAZAR' &&
  ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname ?? '');

/** Prefijo de las claves de localStorage que usan los almacenes falsos del modo demo. */
export const DEMO_PREFIJO = 'riftbound-demo';

export function leerDemo<T>(clave: string, porDefecto: T): T {
  try {
    const bruto = localStorage.getItem(`${DEMO_PREFIJO}-${clave}`);
    return bruto ? (JSON.parse(bruto) as T) : porDefecto;
  } catch {
    // Modo incógnito o almacenamiento bloqueado: la demo sigue, sin recordar nada.
    return porDefecto;
  }
}

export function escribirDemo(clave: string, valor: unknown): void {
  try {
    localStorage.setItem(`${DEMO_PREFIJO}-${clave}`, JSON.stringify(valor));
  } catch {
    // Igual que arriba: no poder guardar no debe romper la pantalla.
  }
}
