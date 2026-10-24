import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { CollectionService } from './collection.service';
import { DEMO } from './demo';
import { UsersService } from './users.service';

/**
 * Estos tests corren sobre el almacén falso del modo demo, que se activa porque
 * firebase.config.ts sigue sin rellenar y jsdom sirve en localhost. Cuando el
 * proyecto de Firebase esté configurado, DEMO será false y harán falta tests
 * contra el emulador de Firestore: lo avisa el primer `expect` de aquí.
 */
describe('CollectionService (modo demo)', () => {
  let auth: AuthService;
  let col: CollectionService;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    auth = TestBed.inject(AuthService);
    col = TestBed.inject(CollectionService);
    await auth.signIn();
    await col.loadMine();
  });

  it('el modo demo está activo (si no, estos tests no prueban nada)', () => {
    expect(DEMO).toBe(true);
  });

  it('empieza vacía y editable', () => {
    expect(col.editable()).toBe(true);
    expect(col.totals()).toEqual({ cards: 0, normal: 0, foil: 0, copies: 0 });
  });

  it('suma copias y trata el cardId sin distinguir mayúsculas', async () => {
    col.adjust('ogn-089', 'normal', 1);
    col.adjust('OGN-089', 'normal', 2);
    col.adjust('OGN-089', 'foil', 1);
    await col.flush();

    expect(col.qty('OGN-089')).toEqual({ normal: 3, foil: 1 });
    expect(col.qty('ogn-089')).toEqual({ normal: 3, foil: 1 });
    expect(col.totals()).toEqual({ cards: 1, normal: 3, foil: 1, copies: 4 });
    expect(col.error()).toBeNull();
  });

  it('nunca baja de cero', async () => {
    col.adjust('RAD-114', 'normal', 1);
    col.adjust('RAD-114', 'normal', -5);
    await col.flush();

    expect(col.qty('RAD-114')).toEqual({ normal: 0, foil: 0 });
  });

  it('a cero deja de ocupar sitio en la colección', async () => {
    col.adjust('RAD-114', 'foil', 1);
    await col.flush();
    expect(col.cards().has('RAD-114')).toBe(true);

    col.adjust('RAD-114', 'foil', -1);
    await col.flush();
    expect(col.cards().has('RAD-114')).toBe(false);
    expect(col.totals().cards).toBe(0);
  });

  it('guarda de verdad: otra instancia lo lee', async () => {
    col.adjust('SFD-198', 'normal', 2);
    await col.flush();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const auth2 = TestBed.inject(AuthService);
    const col2 = TestBed.inject(CollectionService);
    await auth2.signIn();
    await col2.loadMine();

    expect(col2.qty('SFD-198')).toEqual({ normal: 2, foil: 0 });
  });

  it('varios clics seguidos acaban en el último valor', async () => {
    for (let i = 0; i < 10; i++) col.adjust('OGN-001', 'normal', 1);
    for (let i = 0; i < 3; i++) col.adjust('OGN-001', 'normal', -1);
    await col.flush();

    expect(col.qty('OGN-001').normal).toBe(7);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const auth2 = TestBed.inject(AuthService);
    const col2 = TestBed.inject(CollectionService);
    await auth2.signIn();
    await col2.loadMine();
    expect(col2.qty('OGN-001').normal).toBe(7);
  });

  describe('colección de otro miembro', () => {
    beforeEach(() => {
      // Lo que Sans tendría guardado.
      localStorage.setItem(
        'riftbound-demo-collection-sans',
        JSON.stringify({ 'RAD-114': { normal: 2, foil: 1 } }),
      );
    });

    it('se lee aparte y no cambia la propia', async () => {
      col.adjust('OGN-089', 'normal', 1);
      await col.flush();

      await col.loadOther('sans');

      expect(col.other('sans')?.get('RAD-114')).toEqual({ normal: 2, foil: 1 });
      // La propia sigue siendo la que ven el catálogo y la ficha, y se sigue editando.
      expect(col.uid()).toBe('demo');
      expect(col.editable()).toBe(true);
      expect(col.qty('OGN-089').normal).toBe(1);
      expect(col.qty('RAD-114').normal).toBe(0);
    });

    it('tus +/− nunca escriben en la colección del otro', async () => {
      await col.loadOther('sans');
      col.adjust('RAD-114', 'normal', 5);
      await col.flush();

      expect(col.qty('RAD-114').normal).toBe(5);
      expect(col.other('sans')?.get('RAD-114')).toEqual({ normal: 2, foil: 1 });
      const guardadoSans = JSON.parse(localStorage.getItem('riftbound-demo-collection-sans')!);
      expect(guardadoSans['RAD-114']).toEqual({ normal: 2, foil: 1 });
    });

    it('queda cacheada y se puede forzar la relectura', async () => {
      await col.loadOther('sans');
      localStorage.setItem(
        'riftbound-demo-collection-sans',
        JSON.stringify({ 'RAD-114': { normal: 9, foil: 0 } }),
      );

      await col.loadOther('sans');
      expect(col.other('sans')?.get('RAD-114')?.normal).toBe(2);

      await col.loadOther('sans', true);
      expect(col.other('sans')?.get('RAD-114')?.normal).toBe(9);
    });

    it('pedir la propia como si fuera ajena devuelve la propia', async () => {
      col.adjust('OGN-089', 'foil', 1);
      await col.flush();
      await col.loadOther('demo');
      expect(col.other('demo')).toBe(col.cards());
    });
  });

  it('al cambiar de sesión no quedan datos del anterior', async () => {
    localStorage.setItem(
      'riftbound-demo-collection-sans',
      JSON.stringify({ 'RAD-114': { normal: 2, foil: 0 } }),
    );
    col.adjust('OGN-089', 'normal', 1);
    await col.flush();
    await col.loadOther('sans');
    expect(col.totals().cards).toBe(1);

    await auth.signOut();
    expect(auth.user()).toBeNull();
    await col.loadMine();

    expect(col.cards().size).toBe(0);
    expect(col.uid()).toBeNull();
    expect(col.other('sans')).toBeUndefined();
  });

  describe('importar', () => {
    const guardado = () =>
      JSON.parse(localStorage.getItem('riftbound-demo-collection-demo') ?? '{}') as Record<
        string,
        unknown
      >;

    beforeEach(async () => {
      col.adjust('OGN-001', 'normal', 2);
      col.adjust('OGN-089', 'foil', 1);
      await col.flush();
    });

    it('sumar añade a lo que ya tienes y no toca lo demás', async () => {
      const r = await col.importCollection(
        new Map([
          ['OGN-001', { normal: 1, foil: 1 }],
          ['RAD-114', { normal: 3, foil: 0 }],
        ]),
        'sumar',
      );
      expect(col.qty('OGN-001')).toEqual({ normal: 3, foil: 1 });
      expect(col.qty('OGN-089')).toEqual({ normal: 0, foil: 1 });
      expect(col.qty('RAD-114')).toEqual({ normal: 3, foil: 0 });
      expect(r).toEqual({ escritas: 2, borradas: 0 });
      expect(Object.keys(guardado()).sort()).toEqual(['OGN-001', 'OGN-089', 'RAD-114']);
    });

    it('sustituir deja la colección exactamente como el fichero', async () => {
      const r = await col.importCollection(
        new Map([['RAD-114', { normal: 3, foil: 0 }]]),
        'sustituir',
      );
      expect([...col.cards().keys()]).toEqual(['RAD-114']);
      expect(r).toEqual({ escritas: 1, borradas: 2 });
      expect(Object.keys(guardado())).toEqual(['RAD-114']);
    });

    it('solo escribe lo que cambia', async () => {
      const r = await col.importCollection(
        new Map([['OGN-001', { normal: 2, foil: 0 }]]),
        'sustituir',
      );
      expect(r).toEqual({ escritas: 0, borradas: 1 });
    });

    it('el alias de DotGG se guarda y sobrevive a los +/−', async () => {
      await col.importCollection(
        new Map([['OPP-004', { normal: 2, foil: 0, alias: 'OGS-004-P' }]]),
        'sumar',
      );
      col.adjust('OPP-004', 'normal', 1);
      await col.flush();

      expect(col.qty('OPP-004')).toEqual({ normal: 3, foil: 0, alias: 'OGS-004-P' });
      expect(guardado()['OPP-004']).toEqual({ normal: 3, foil: 0, alias: 'OGS-004-P' });
    });
  });
});

describe('UsersService (modo demo)', () => {
  it('crea el perfil al entrar y lo lista para el grupo', async () => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const auth = TestBed.inject(AuthService);
    const users = TestBed.inject(UsersService);

    await auth.signIn();
    // ensureProfile se dispara sin esperarla desde AuthService.
    await users.ensureProfile(auth.user()!);
    await users.loadProfiles();

    expect(users.profiles()).toHaveLength(1);
    expect(users.profile('demo')).toEqual({
      uid: 'demo',
      displayName: 'Fran (demo)',
    });
    expect(users.error()).toBeNull();
  });

  // Con registro abierto el perfil lo lee cualquiera: el email no puede acabar ahí.
  it('nunca publica el email, ni siquiera como sustituto del nombre', async () => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const users = TestBed.inject(UsersService);

    await users.ensureProfile({ uid: 'x', email: 'secreto@example.com', displayName: null });
    await users.loadProfiles();

    expect(users.profile('x')).toEqual({ uid: 'x', displayName: 'Sin nombre' });
    expect(localStorage.getItem('riftbound-demo-profiles')).not.toContain('secreto@example.com');
  });
});
