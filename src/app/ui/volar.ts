/**
 * Marca la imagen pulsada para que la View Transition del router la lleve volando hasta
 * la imagen de la ficha (que tiene `view-transition-name: carta-activa`). Solo una
 * imagen puede llevar el nombre a la vez, así que se quita en cuanto termina el salto.
 */
export function volarA(img: HTMLElement): void {
  img.style.setProperty('view-transition-name', 'carta-activa');
  setTimeout(() => img.style.removeProperty('view-transition-name'), 600);
}
