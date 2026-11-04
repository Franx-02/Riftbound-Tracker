import { Directive, ElementRef, NgZone, OnDestroy, OnInit, inject, input } from '@angular/core';

/**
 * Inclina en 3D lo que lleve `appInclinar` según dónde esté el puntero, con un brillo
 * que lo sigue (más fuerte con `[holo]="true"`, para las foil). Escribe solo variables
 * CSS (--rx, --ry, --mx, --my, --brillo) y el estilo vive en styles.scss (`.inclinable`).
 * Fuera de la zona de Angular: mover el ratón no dispara detección de cambios. Con
 * "reducir movimiento" o puntero táctil no hace nada.
 */
@Directive({
  selector: '[appInclinar]',
  host: { class: 'inclinable', '[class.holo]': 'holo()' },
})
export class InclinarDirective implements OnInit, OnDestroy {
  /** Grados máximos de giro. */
  readonly appInclinar = input<number | ''>(10);
  readonly holo = input(false);

  private readonly el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly zone = inject(NgZone);
  private frame = 0;
  private quitar: (() => void) | null = null;

  ngOnInit(): void {
    if (
      typeof matchMedia === 'undefined' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !matchMedia('(hover: hover)').matches
    )
      return;
    this.zone.runOutsideAngular(() => {
      const mover = (e: PointerEvent) => {
        const r = this.el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => {
          const max = Number(this.appInclinar()) || 10;
          const s = this.el.style;
          s.setProperty('--ry', `${(x - 0.5) * 2 * max}deg`);
          s.setProperty('--rx', `${(0.5 - y) * 2 * max}deg`);
          s.setProperty('--mx', `${x * 100}%`);
          s.setProperty('--my', `${y * 100}%`);
          s.setProperty('--brillo', '1');
        });
      };
      const salir = () => {
        cancelAnimationFrame(this.frame);
        const s = this.el.style;
        s.setProperty('--rx', '0deg');
        s.setProperty('--ry', '0deg');
        s.setProperty('--brillo', '0');
      };
      this.el.addEventListener('pointermove', mover);
      this.el.addEventListener('pointerleave', salir);
      this.quitar = () => {
        this.el.removeEventListener('pointermove', mover);
        this.el.removeEventListener('pointerleave', salir);
      };
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    this.quitar?.();
  }
}
