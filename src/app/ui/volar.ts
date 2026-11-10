/** Hay una carta marcada para volar hasta su ficha en la navegación que empieza ahora. */
let enVuelo = false;

/**
 * Marca la imagen pulsada para que la View Transition del router la lleve volando hasta
 * la imagen de la ficha (que tiene `view-transition-name: carta-activa`). Solo una
 * imagen puede llevar el nombre a la vez, así que se quita en cuanto termina el salto.
 */
export function volarA(img: HTMLElement): void {
  img.style.setProperty('view-transition-name', 'carta-activa');
  enVuelo = true;
  setTimeout(() => {
    img.style.removeProperty('view-transition-name');
    enVuelo = false;
  }, 600);
}

/**
 * Solo se anima la navegación que lleva una carta a su ficha. El resto de cambios de
 * sección son instantáneos: la transición de página añadía ~300 ms a cada clic, y
 * mientras dura no se puede tocar nada.
 */
export function hayVuelo(): boolean {
  return enVuelo;
}
