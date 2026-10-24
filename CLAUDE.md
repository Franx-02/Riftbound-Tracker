# Riftbound Collection

App PWA (Angular 22 + Netlify + Firebase) para colecciones de cartas de Riftbound con precios de Cardmarket. Uso privado de un grupo de amigos, por invitación, coste 0 €.

**Lee `docs/HANDOFF.md` antes de empezar cualquier tarea.** Contiene las decisiones, los datos externos, el algoritmo de mapeo y el plan por fases. La siguiente fase es **F2**, con los pasos 1 a 5 hechos. Falta el 6: ver la colección de otro miembro del grupo.

## Comandos
- `npm install`
- `npx netlify dev` → Angular + funciones en http://localhost:8888 (no usar `ng serve`: no levanta `/api/*`)
- `npm run build` → debe compilar sin errores antes de dar algo por terminado (**necesita Node 22+**; con Node 20 el CLI de Angular ni arranca)
- `npm run build:catalog -- --check` → regenera public/data/*.json y valida el mapeo con collection1.csv
- `npm run check:tools` → typecheck de tools/*.mts
- `npm test` → tests con vitest y jsdom (también necesita Node 22+)

## Reglas del proyecto
- Angular moderno: componentes standalone, signals, control flow `@if/@for`, `inject()`.
- La seguridad está en `firestore.rules`, no en el front. Todo dato nuevo en Firestore necesita su regla.
- Mantener el **modo demo**: solo con `firebaseConfig.apiKey === 'REEMPLAZAR'` y host localhost. Cada servicio que use Firestore necesita su equivalente en modo demo. El flag vive solo en `src/app/core/demo.ts`.
- Cardmarket usa `0` para "sin datos": nunca valorar una carta a 0 € sin indicarlo.
- Catálogo: usar **RiftHunt** (`api.rifthunt.com/bulk/cards`), no Riftcodex: Riftcodex no tiene Radiance.
- No scrapear `www.cardmarket.com`. Usar solo los JSON públicos de `downloads.s3.cardmarket.com` (juego 22).
- Herramientas y scripts nuevos en TypeScript/Node, no en Python.
- Interfaz en español de España. Nombres de cartas, sets y keywords en inglés.
- Nada de pagos, store ni servicios con coste.
