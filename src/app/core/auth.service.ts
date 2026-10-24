import { Injectable, computed, signal } from '@angular/core';
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { firebaseConfig } from '../../environments/firebase.config';
import { auth, db } from './firebase';

export type AccessState = 'loading' | 'signed-out' | 'not-invited' | 'allowed';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

/**
 * Modo demo: solo en localhost y solo mientras firebase.config.ts siga sin rellenar.
 * Permite probar la interfaz sin Firebase. En un despliegue real nunca se activa:
 * fuera de localhost, una config sin rellenar simplemente no deja entrar a nadie.
 */
const DEMO =
  firebaseConfig.apiKey === 'REEMPLAZAR' &&
  ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname ?? '');
const DEMO_KEY = 'riftbound-demo-user';
const DEMO_USER: AppUser = { uid: 'demo', email: 'demo@localhost', displayName: 'Fran (demo)' };

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<AppUser | null>(null);
  readonly access = signal<AccessState>('loading');
  readonly displayName = computed(() => this.user()?.displayName ?? this.user()?.email ?? '');
  readonly demo = DEMO;

  /** Se resuelve cuando se conoce el estado inicial de la sesión. */
  readonly ready: Promise<void>;

  constructor() {
    if (DEMO) {
      const signedIn = sessionStorage.getItem(DEMO_KEY) === '1';
      this.user.set(signedIn ? DEMO_USER : null);
      this.access.set(signedIn ? 'allowed' : 'signed-out');
      this.ready = Promise.resolve();
      return;
    }
    this.ready = new Promise((resolve) => {
      onAuthStateChanged(auth, async (user) => {
        this.user.set(user ? toAppUser(user) : null);
        this.access.set(await this.resolveAccess(user));
        resolve();
      });
    });
  }

  /** Abre el popup de Google y devuelve si la cuenta está invitada. */
  async signIn(): Promise<AccessState> {
    if (DEMO) {
      sessionStorage.setItem(DEMO_KEY, '1');
      this.user.set(DEMO_USER);
      this.access.set('allowed');
      return 'allowed';
    }
    const { user } = await signInWithPopup(auth, new GoogleAuthProvider());
    const access = await this.resolveAccess(user);
    this.user.set(toAppUser(user));
    this.access.set(access);
    return access;
  }

  async signOut(): Promise<void> {
    if (DEMO) {
      sessionStorage.removeItem(DEMO_KEY);
      this.user.set(null);
      this.access.set('signed-out');
      return;
    }
    await signOut(auth);
  }

  /** Un usuario entra solo si existe allowed/{email}. Las reglas de Firestore aplican lo mismo en servidor. */
  private async resolveAccess(user: User | null): Promise<AccessState> {
    if (!user?.email) return 'signed-out';
    try {
      const snap = await getDoc(doc(db, 'allowed', user.email.toLowerCase()));
      return snap.exists() ? 'allowed' : 'not-invited';
    } catch {
      // Las reglas deniegan la lectura a quien no está invitado.
      return 'not-invited';
    }
  }
}

function toAppUser(user: User): AppUser {
  return { uid: user.uid, email: user.email, displayName: user.displayName };
}
