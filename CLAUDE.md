# Riftbound Collection

App PWA (Angular 22 + Netlify + Firebase) para colecciones de cartas de Riftbound con precios de Cardmarket. Registro abierto con Google (cualquiera entra), coste 0 €.

**Lee `docs/HANDOFF.md` antes de empezar cualquier tarea.** Contiene las decisiones, los datos externos, el algoritmo de mapeo y el plan por fases. Desplegada en https://riftboundtracker.netlify.app con F1 a F3 hechas. F4 (traducción) y F5 (lista de deseos) están hechas; F4 a falta de la revisión del usuario: el glosario de `docs/glosario.md` manda sobre cualquier traducción.

## Comandos
- `npm install`
- `npx netlify dev` → Angular + funciones en http://localhost:8888 (no usar `ng serve`: no levanta `/api/*`)
- `npm run build` → debe compilar sin errores antes de dar algo por terminado (**necesita Node 22+**; con Node 20 el CLI de Angular ni arranca)
- `npm run build:catalog -- --check` → regenera public/data/*.json y valida el mapeo con collection1.csv
- `npm run check:tools` → typecheck de tools/*.mts
- `npm test` → tests con vitest y jsdom, siempre en modo demo (también necesita Node 22+)
- `npm run start:demo` → `netlify dev` en modo demo, para probar en local sin tocar el Firestore real
- `npm run check:import` → ida y vuelta de tools/collection1.csv (criterio de salida de F3)
- `npm run traducir -- pendientes|aplicar` → flujo de traducción de F4 (ver docs/glosario.md antes de traducir)

## Reglas del proyecto
- Angular moderno: componentes standalone, signals, control flow `@if/@for`, `inject()`.
- La seguridad está en `firestore.rules`, no en el front. Todo dato nuevo en Firestore necesita su regla, que valide la forma del documento: escribe cualquiera. Tras cambiar el fichero, el usuario tiene que publicarlo en la consola de Firebase.
- Nunca guardar el email ni otros datos personales en documentos que lean otros usuarios.
- Mantener el **modo demo**: solo con `firebaseConfig.apiKey === 'REEMPLAZAR'` y host localhost. Cada servicio que use Firestore necesita su equivalente en modo demo. El flag vive solo en `src/app/core/demo.ts`.
- Cardmarket usa `0` para "sin datos": nunca valorar una carta a 0 € sin indicarlo.
- Catálogo: usar **RiftHunt** (`api.rifthunt.com/bulk/cards`), no Riftcodex: Riftcodex no tiene Radiance.
- No scrapear `www.cardmarket.com`. Usar solo los JSON públicos de `downloads.s3.cardmarket.com` (juego 22).
- Herramientas y scripts nuevos en TypeScript/Node, no en Python.
- Interfaz en español de España. Nombres de cartas, sets y keywords en inglés.
- Nada de pagos, store ni servicios con coste.
