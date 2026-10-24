# Riftbound Collection

App PWA (Angular 22 + Netlify + Firebase) para colecciones de cartas de Riftbound con precios de Cardmarket. Uso privado de un grupo de amigos, por invitación, coste 0 €.

**Lee `docs/HANDOFF.md` antes de empezar cualquier tarea.** Contiene las decisiones, los datos externos, el algoritmo de mapeo y el plan por fases. La siguiente fase es **F2**.

## Comandos
- `npm install`
- `npx netlify dev` → Angular + funciones en http://localhost:8888 (no usar `ng serve`: no levanta `/api/*`)
- `npm run build` → debe compilar sin errores antes de dar algo por terminado

## Reglas del proyecto
- Angular moderno: componentes standalone, signals, control flow `@if/@for`, `inject()`.
- La seguridad está en `firestore.rules`, no en el front. Todo dato nuevo en Firestore necesita su regla.
- Mantener el **modo demo**: solo con `firebaseConfig.apiKey === 'REEMPLAZAR'` y host localhost. Cada servicio que use Firestore necesita su equivalente en modo demo.
- Cardmarket usa `0` para "sin datos": nunca valorar una carta a 0 € sin indicarlo.
- No scrapear `www.cardmarket.com`. Usar solo los JSON públicos de `downloads.s3.cardmarket.com` (juego 22).
- Herramientas y scripts nuevos en TypeScript/Node, no en Python.
- Interfaz en español de España. Nombres de cartas, sets y keywords en inglés.
- Nada de pagos, store ni servicios con coste.
