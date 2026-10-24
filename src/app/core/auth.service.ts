import { Injectable, computed, inject, signal } from '@angular/core';
import {
  GoogleAuthProvider,
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { DEMO } from './demo';
import { auth } from './firebase';
import { UsersService } from './users.service';

/** Registro abierto: cualquier cuenta de Google entra. No hay estado de "no invitado". */
export type AccessState = 'loading' | 'signed-out' | 'signed-in';

export interface AppUser {
  uid: string;
  /** Solo para la sesión propia. Nunca se guarda en Firestore: lo leerían los demás. */
  email: string | null;
  displayName: string | null;
}

const DEMO_KEY = 'riftbound-demo-user';
const DEMO_USER: AppUser = { uid: 'demo', email: 'demo@localhost', displayName: 'Fran (demo)' };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly users = inject(UsersService);
  readonly user = signal<AppUser | null>(null);
  readonly access = signal<AccessState>('loading');
  readonly displayName = computed(() => this.user()?.displayName ?? this.user()?.email ?? '');
  readonly demo = DEMO;

  /** Se resuelve cuando se conoce el estado inicial de la sesión. */
  readonly ready: Promise<void>;

  constructor() {
    if (DEMO) {
      const signedIn = sessionStorage.getItem(DEMO_KEY) === '1';
      this.aplicar(signedIn ? DEMO_USER : null);
      this.ready = Promise.resolve();
      return;
    }
    this.ready = new Promise((resolve) => {
      onAuthStateChanged(auth, (user) => {
        this.aplicar(user ? toAppUser(user) : null);
        resolve();
      });
    });
  }

  /** Abre el popup de Google. La primera vez que entras, esto es el registro. */
  async signIn(): Promise<void> {
    if (DEMO) {
      sessionStorage.setItem(DEMO_KEY, '1');
      this.aplicar(DEMO_USER);
      return;
    }
    const { user } = await signInWithPopup(auth, new GoogleAuthProvider());
    this.aplicar(toAppUser(user));
  }

  async signOut(): Promise<void> {
    if (DEMO) {
      sessionStorage.removeItem(DEMO_KEY);
      this.aplicar(null);
      return;
    }
    await signOut(auth);
  }

  /**
   * Único sitio donde se fija el estado de sesión. En cuanto hay sesión se crea o
   * refresca `users/{uid}`, que es lo que hace que los demás te vean.
   * No se espera a que termine: si falla, la app sigue y el error queda en UsersService.
   */
  private aplicar(user: AppUser | null): void {
    this.user.set(user);
    this.access.set(user ? 'signed-in' : 'signed-out');
    if (user) void this.users.ensureProfile(user);
  }
}

function toAppUser(user: User): AppUser {
  return { uid: user.uid, email: user.email, displayName: user.displayName };
}
