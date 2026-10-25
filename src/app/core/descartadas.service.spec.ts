import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { DEMO } from './demo';
import { DescartadasService } from './descartadas.service';

/** Sobre el almacén del modo demo, como los demás servicios con datos del usuario. */
describe('DescartadasService (modo demo)', () => {
  let auth: AuthService;
  let desc: DescartadasService;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    auth = TestBed.inject(AuthService);
    desc = TestBed.inject(DescartadasService);
    await auth.signIn();
    await desc.load();
  });

  it('el modo demo está activo (si no, estos tests no prueban nada)', () => {
    expect(DEMO).toBe(true);
  });

  it('marca y desmarca sin distinguir mayúsculas', async () => {
    desc.alternar('ogn-001');
    await desc.flush();
    expect(desc.tiene('OGN-001')).toBe(true);
    desc.alternar('OGN-001');
    await desc.flush();
    expect(desc.tiene('OGN-001')).toBe(false);
  });

  it('guarda de verdad: otra instancia lo lee', async () => {
    desc.alternar('SFD-198');
    await desc.flush();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const auth2 = TestBed.inject(AuthService);
    const desc2 = TestBed.inject(DescartadasService);
    await auth2.signIn();
    await desc2.load();
    expect(desc2.tiene('SFD-198')).toBe(true);
  });
});
