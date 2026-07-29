# NYXORA — Hub multijugador de minijuegos

## 1. Configurar Firebase (lo único que tienes que tocar)

1. Crea una Realtime Database en la consola de Firebase (modo "bloqueado" o "prueba", da igual, vamos a sobrescribir las reglas).
2. Copia su URL, algo como `https://tu-proyecto-default-rtdb.firebaseio.com`.
3. Ábrelo en `js/config.js` y reemplaza:
   ```js
   const FIREBASE_DATABASE_URL = "https://TU-BASE-DE-DATOS-default-rtdb.firebaseio.com";
   ```
4. En la consola de Firebase → Realtime Database → Reglas, pega el contenido de `firebase-rules.json`.
5. Abre `index.html` (sirviéndolo con cualquier servidor estático; `EventSource`/`fetch` no funcionan bien con `file://`). Por ejemplo:
   ```bash
   npx serve .
   # o
   python3 -m http.server 8080
   ```

No necesitas API key, SDK de Firebase ni ningún otro archivo de configuración.

## 2. Probar el multijugador de verdad

Abre la página en dos pestañas/dispositivos distintos, crea un jugador en cada una y pulsa **⚡ JUGAR AHORA** en ambas. El sistema los empareja por rango, sincroniza la partida por Firebase y ambos ven el mismo minijuego, las mismas rondas y el mismo resultado en tiempo real.

## 3. Sobre la seguridad (léelo, es importante)

Como pediste, **no hay API key ni Firebase Auth** en este prototipo: el "identificador de jugador" (`PX-XXXXXX`) se genera en el dispositivo y se guarda en `localStorage`. Esto tiene un límite real que no se puede maquillar:

> **Una URL de Realtime Database, por sí sola, nunca autentica a nadie.** Cualquiera que conozca la URL y el formato de los datos podría, en teoría, escribir directamente contra la API REST sin pasar por esta web.

Lo que sí hicimos para que no sea "todo abierto":
- Las reglas en `firebase-rules.json` **no son `".read": true, ".write": true` globales**: validan tipos de datos, exigen que el `playerId` cumpla el formato `PX-XXXXXX`, e impiden que `level`, `exp`, `wins`, etc. **retrocedan** (nadie puede "bajarle" la puntuación a otro).
- El cliente nunca envía `score = 999999`: cada ronda se resuelve minijuego por minijuego con datos medidos localmente (ms de reacción, aciertos), y el marcador final se calcula sumando esas rondas, no de un solo valor arbitrario.
- La estructura ya está separada en `players/`, `rooms/`, `matchmaking/`, `games/` pensando en que, el día que actives **Firebase Authentication** (aunque sea anónima), solo tengas que añadir `"auth != null"` y `"auth.uid == $playerId"` a las reglas — no hay que rediseñar nada.

**Lo que un prototipo así nunca puede garantizar sin backend real** (te lo dejamos anotado también en los comentarios de `player.js` y `matchmaking.js`):
- Que un cliente modificado no pueda inflar su propia EXP o victorias.
- Que el emparejamiento de matchmaking sea 100% atómico (dos jugadores emparejándose a la vez con un tercero). Lo mitigamos con una regla determinista (el `playerId` menor "crea" la partida), suficiente para un prototipo, no para producción con miles de usuarios simultáneos.

Para una versión real: Firebase Auth (anónima como mínimo) + Cloud Functions que sean las únicas que puedan escribir `exp`, `wins`, `rankId` y resolver el matchmaking en el servidor.

## 4. Qué incluye esta entrega (Fases 1–3 del pedido original)

- ✅ Arquitectura completa + conexión Firebase por REST (`firebaseGet/Put/Patch/Post/Delete`) con streaming (`EventSource`) y **fallback automático a polling con backoff**.
- ✅ Perfil de jugador con ID generado localmente, EXP, nivel (independiente del rango) y estadísticas amplias (generales + por minijuego).
- ✅ **120 rangos únicos** generados proceduralmente (nombre + medalla SVG), en 8 niveles de rareza (Común → Trascendente), sin nombres repetidos.
- ✅ Salas públicas y privadas (con código), sala de espera con "listo/no listo", selección de minijuegos (todos / seleccionados / rotación), chat con anti-spam básico.
- ✅ Matchmaking automático por rango con ventana de búsqueda que se amplía con el tiempo.
- ✅ Partidas por rondas sincronizadas en tiempo real, pantalla de resultado con animación de ascenso de rango.
- ✅ 6 minijuegos reales y jugables, cada uno de una categoría distinta: **Reacción** (velocidad), **Semáforo** (precisión con penalización), **Secuencia** (memoria tipo Simon), **Cálculo** (lógica/matemáticas), **Objetivo** (puntería), **Colores** (Stroop/decisión).
- ✅ Modo práctica (no compite) además del modo competitivo.
- ✅ Diseño gaming oscuro con glassmorphism, medallas con glow por rareza, responsive mobile-first + sidebar en escritorio.

## 5. Lo que falta para el pedido completo original (Fases 4–6)

El pedido original pide 15+ minijuegos, sistema de amigos, invitaciones directas, retos desde perfil público, logros con progreso, rangos ocultos por hazañas, títulos seleccionables, espectadores, bloqueo/reporte de jugadores, y eventos temporales. La arquitectura ya está lista para todo eso (los nodos `friends/`, `invitations/`, `achievements/`, `events/`, `reports/` encajan directamente en el mismo esquema de `rooms`/`players`), pero completarlo con la misma calidad que lo ya entregado es otra tanda de trabajo. Dime cuáles quieres primero y seguimos con la Fase 4.
