# Plan: Ciclo en conversaciones y nuevo flujo CTA (visita vs contactado / WhatsApp vs llamada)

## 1. Estado actual

### 1.1 Flujo de estados (FSM actual)

```
INICIO
  -> FILTRO_INTENCION   ("Que te interesa? Comprar / Invertir / Solo ver")
       -> [comprar|invertir] -> CTA_PRIMARIO
       -> [solo_info]       -> INFO_REINTENTO -> (recuperado) CTA_PRIMARIO o SALIDA_ELEGANTE
  -> CTA_PRIMARIO        ("Prefieres visita al desarrollo o llamada con asesor?")
       -> [afirmativo]      -> SOLICITUD_HORARIO
       -> [negativo]       -> SALIDA_ELEGANTE
  -> SOLICITUD_HORARIO   ("A que hora te contactamos?")
       -> [cualquier texto] -> SOLICITUD_NOMBRE
  -> SOLICITUD_NOMBRE    ("Nombre completo?")
       -> [nombre 3+ chars] -> CLIENT_ACCEPTA (handover)
```

- **CTA actual**: En `CTA_PRIMARIO` se pregunta de una sola vez: "visita al desarrollo o llamada con asesor". No se distingue después si eligio "contactado" entre WhatsApp vs llamada.
- **Datos guardados**: `preferred_action` se rellena en `CTA_PRIMARIO` con `classifyAccion()` (cita | visita | cotizacion) y se persiste al pasar a `SOLICITUD_HORARIO`.

### 1.2 Quien decide el siguiente estado

- **Estados con LLM**: `FILTRO_INTENCION`, `INFO_REINTENTO`, `CTA_PRIMARIO`, `SOLICITUD_HORARIO`, `SOLICITUD_NOMBRE`.
- En esos estados primero se llama a `selectResponseAndState()` (LLM). Si devuelve resultado valido, se usa ese `responseKey` y `nextState` y se hace `updateState(..., nextState)`.
- Si el LLM falla o devuelve invalido, se usa el **fallback por keywords/FSM** en `conversation-flows.ts` (handlers como `handleCtaPrimario`, `handleFiltroIntencion`, etc.).

### 1.3 Donde esta el CTA hoy

- **Texto CTA**: `development-content.ts` -> `CTA_AYUDA` por desarrollo (ej: "Prefieres agendar una visita al desarrollo o una llamada breve con un asesor?").
- **Logica CTA**: `handleCtaPrimario()` en `conversation-flows.ts`: `classifyAccion()` (intent-classifier) + `matchAffirmativeByKeywords` / `matchNegativeByKeywords` (conversation-keywords). Si afirmativo -> `SOLICITUD_HORARIO`; si negativo -> `SALIDA_ELEGANTE`.

---

## 2. Problema del ciclo

### 2.1 Causas probables (identificacion de estados y respuestas)

1. **LLM sin restriccion por estado actual**  
   En `response-selector.ts` las reglas no dicen explicitamente: "Si `currentState === CTA_PRIMARIO`, solo puedes devolver `nextState`: `SOLICITUD_HORARIO` o `SALIDA_ELEGANTE`."  
   El LLM puede aplicar reglas 1 o 2 (INVERTIR/COMPRAR -> CONFIRMACION_* + CTA_PRIMARIO) tambien cuando el usuario ya esta en CTA_PRIMARIO. Entonces:
   - Usuario en CTA_PRIMARIO escribe "quiero una llamada".
   - LLM devuelve por ejemplo CONFIRMACION_COMPRA + nextState CTA_PRIMARIO.
   - Se vuelve a enviar texto de confirmacion + CTA_AYUDA y el estado sigue en CTA_PRIMARIO -> **ciclo**: misma pregunta repetida.

2. **Doble camino LLM vs FSM**  
   Si el LLM devuelve algo valido pero "equivocado" (ej. desde CTA_PRIMARIO mandar a FILTRO_INTENCION o INFO_REINTENTO), el estado retrocede y el usuario vuelve a ver preguntas anteriores. Eso puede sentirse como ciclo o como flujo roto.

3. **Ambiguedad del mensaje del usuario**  
   En CTA_PRIMARIO el usuario puede decir algo que el LLM interpreta como "intencion de compra/inversion" en lugar de "acepto visita/llamada". Entonces el LLM elige CONFIRMACION_* y nextState CTA_PRIMARIO, y no avanza a SOLICITUD_HORARIO.

4. **Keywords y LLM desalineados**  
   El fallback (`handleCtaPrimario`) usa `classifyAccion()` (cita/visita/cotizacion) y afirmativo/negativo. Si el LLM se usa primero y devuelve un nextState que no es SOLICITUD_HORARIO ni SALIDA_ELEGANTE, se persiste ese estado y nunca se ejecuta el handler FSM que si enviaria a SOLICITUD_HORARIO.

### 2.2 Resumen de causas

| Causa | Donde | Efecto |
|-------|--------|--------|
| Reglas del LLM no restringen nextState por estado | response-selector.ts | Desde CTA_PRIMARIO se puede volver a CTA_PRIMARIO o a FILTRO/INFO_REINTENTO |
| LLM interpreta mensaje en CTA como "intencion" | selectResponseAndState | responseKey CONFIRMACION_* + nextState CTA_PRIMARIO -> misma pantalla |
| No hay validacion "estado actual -> nextState permitidos" | conversation-flows.ts | Se acepta cualquier nextState valido del LLM |

---

## 3. Propuesta

### 3.1 Cambio de flujo CTA (visita vs contactado; luego WhatsApp vs llamada)

- **Paso 1 – CTA primario (como ahora, pero con copy nuevo)**  
  Pregunta: **"Quieres visitar el desarrollo o que un agente te contacte?"**  
  Opciones: **visitar** | **ser contactado por agente**.

- **Paso 2 – Solo si elige "ser contactado"**  
  Pregunta: **"Por WhatsApp o por llamada?"**  
  Opciones: **WhatsApp** | **llamada**.

- **Si elige "visitar"**  
  Ir directo a pedir horario (equivalente a SOLICITUD_HORARIO) y luego nombre, sin preguntar canal.

Flujo propuesto:

```
CTA_PRIMARIO
  "Visitar o que te contacte un agente?"
  -> visitar           -> SOLICITUD_HORARIO (preferred_action = visita)
  -> ser contactado    -> CTA_CANAL (nuevo estado)

CTA_CANAL
  "Por WhatsApp o por llamada?"
  -> whatsapp          -> SOLICITUD_HORARIO (preferred_action = whatsapp o cita por WA)
  -> llamada           -> SOLICITUD_HORARIO (preferred_action = cita/llamada)
```

### 3.2 Cambios de implementacion

1. **Estados**  
   - Añadir en `conversation-state.ts`: `CTA_CANAL` (elegir canal: WhatsApp vs llamada).

2. **Copy**  
   - En `development-content.ts`:  
     - Nuevo mensaje (ej. `CTA_VISITA_O_CONTACTO`): "Quieres visitar el desarrollo o que un agente te contacte?"  
     - Nuevo mensaje (ej. `CTA_CANAL`): "Por WhatsApp o por llamada?"  
   - Mantener o reemplazar `CTA_AYUDA` segun si quieres un solo texto para el primer CTA o dos variantes.

3. **Flujo**  
   - En `conversation-flows.ts`:  
     - `handleCtaPrimario`: detectar "visitar" vs "ser contactado / que me contacten / agente".  
       - Visitar -> `SOLICITUD_HORARIO`, `preferred_action: 'visita'`.  
       - Contactado -> transicion a `CTA_CANAL`, enviar mensaje "Por WhatsApp o por llamada?".  
     - Nuevo handler `handleCtaCanal`: solo desde `CTA_CANAL`; detectar "WhatsApp" vs "llamada"; en ambos casos ir a `SOLICITUD_HORARIO` con `preferred_action` correspondiente (ej. `whatsapp` | `llamada`).
   - En `processState`, añadir `case 'CTA_CANAL': return await handleCtaCanal(...)`.
   - Para estados que usan LLM, incluir `CTA_CANAL` en `useLLMSelector` solo si quieres que el LLM tambien resuelva esa pantalla; si no, solo FSM con keywords.

4. **Intent / clasificacion**  
   - En `intent-classifier.ts`:  
     - Nueva funcion (ej. `classifyCtaPrimario`) que devuelva `'visitar' | 'contactado' | null`.  
     - Nueva funcion (ej. `classifyCtaCanal`) que devuelva `'whatsapp' | 'llamada' | null`.  
   - En `conversation-keywords.ts`: terminos para "visitar" (visita, ir a ver, conocer, etc.) y "contactado" (contacten, llamada, asesor, que me contacte, etc.); y para "whatsapp" vs "llamada".

5. **UserData**  
   - Mantener o ampliar `preferred_action` para incluir: `'visita' | 'whatsapp' | 'llamada'` (y legacy 'cita'/'cotizacion' si se siguen usando en otros lados).

6. **Evitar ciclo**  
   - En `response-selector.ts`:  
     - Reglas explicitas por estado:  
       - Si `currentState === 'CTA_PRIMARIO'` -> solo permitir `nextState`: `SOLICITUD_HORARIO` o `CTA_CANAL` o `SALIDA_ELEGANTE`.  
       - Si `currentState === 'CTA_CANAL'` -> solo permitir `nextState`: `SOLICITUD_HORARIO` o `SALIDA_ELEGANTE`.  
     - No aplicar reglas de CONFIRMACION_* + CTA_PRIMARIO cuando el estado actual ya es CTA_PRIMARIO o CTA_CANAL.
   - Opcional en `conversation-flows.ts`: despues de `selectResponseAndState`, validar que `nextState` sea un estado permitido desde `state` (tabla estado actual -> estados siguientes). Si no, ignorar el resultado del LLM y usar el fallback FSM (handlers por keyword).

### 3.3 Tabla allowlist `allowedNextStatesByState` y validacion post-LLM

Definir una allowlist explicita: para cada estado actual, solo se aceptan ciertos siguientes estados. Si el LLM devuelve un `nextState` que no esta en la lista, **descartar** el resultado del LLM y usar el fallback FSM (handlers por keyword).

**Tabla propuesta:**

| Estado actual       | nextState permitidos                                      |
|---------------------|------------------------------------------------------------|
| INICIO              | FILTRO_INTENCION                                          |
| FILTRO_INTENCION    | CTA_PRIMARIO, INFO_REINTENTO, SALIDA_ELEGANTE             |
| INFO_REINTENTO      | CTA_PRIMARIO, SALIDA_ELEGANTE                             |
| CTA_PRIMARIO        | SOLICITUD_HORARIO, CTA_CANAL, SALIDA_ELEGANTE              |
| CTA_CANAL           | SOLICITUD_HORARIO, SALIDA_ELEGANTE                         |
| SOLICITUD_HORARIO   | SOLICITUD_NOMBRE                                          |
| SOLICITUD_NOMBRE    | CLIENT_ACCEPTA, SOLICITUD_NOMBRE (re-pedir nombre)        |
| CLIENT_ACCEPTA      | (no aplica; bot no responde)                              |
| SALIDA_ELEGANTE     | (reinicio a INICIO desde handleIncomingMessage)             |

**Implementacion:** En `conversation-flows.ts`, despues de obtener `selection` de `selectResponseAndState`, comprobar `allowedNextStatesByState[state].includes(nextState)`. Si no esta permitido, no usar `selection` y continuar con el `switch (state)` y los handlers FSM.

### 3.4 Short-circuit en CTA_PRIMARIO: si detectas canal (WA/llamada), saltar CTA_CANAL

Si en **CTA_PRIMARIO** el usuario responde directamente con el canal (ej. "por WhatsApp", "llamada", "que me llamen"), no mostrar la pantalla CTA_CANAL: ir directo a **SOLICITUD_HORARIO** con `preferred_channel` ya rellenado.

- Orden sugerido en `handleCtaPrimario`:  
  1. Negativo -> SALIDA_ELEGANTE.  
  2. Detectar "visitar" -> SOLICITUD_HORARIO, preferred_action = visita.  
  3. Detectar canal explicito (whatsapp | llamada) -> **short-circuit**: SOLICITUD_HORARIO, preferred_action = contactado, preferred_channel = whatsapp | llamada.  
  4. Detectar "contactado" generico (sin canal) -> CTA_CANAL.  
  5. Afirmativo ambiguo -> CTA_CANAL o re-preguntar segun criterio.

Asi se evita una pregunta innecesaria cuando el usuario ya dijo "por llamada" o "por WhatsApp".

### 3.5 Separar preferred_action vs preferred_channel (mapping claro)

- **preferred_action**: que quiere hacer a nivel macro. Valores: `'visita' | 'contactado'`.  
  - `visita` = ir al desarrollo.  
  - `contactado` = que un agente lo contacte (por algun canal).

- **preferred_channel**: solo relevante cuando `preferred_action === 'contactado'`. Valores: `'whatsapp' | 'llamada'`.  
  - Si el usuario ya esta en WhatsApp y elige "contactado" sin especificar, se puede defaultar `preferred_channel = 'whatsapp'` o preguntar en CTA_CANAL.

**Mapping a legacy / CRM / Cliq:**  
- Para mostrar en Cliq o en el lead: si hay `preferred_channel`, mostrar "Contacto: WhatsApp" o "Contacto: Llamada"; si hay `preferred_action === 'visita'`, mostrar "Visita al desarrollo".  
- Campo unificado para reportes (opcional): `preferred_contact` = `visita` | `whatsapp` | `llamada`, derivado de action + channel para no romper integraciones que esperan un solo valor.

### 3.6 Anti-repeat: responseKey repetido + state repetido => ruta alternativa

Si el LLM devuelve **el mismo estado** que el actual (`nextState === state`) y ademas la respuesta es la misma que se mostraria en ese estado (ej. responseKey que lleva a CTA_AYUDA de nuevo), interpretar que no hubo avance y **no aplicar** esa seleccion: usar en su lugar la ruta alternativa (fallback FSM).

Criterio concreto:  
- Si `nextState === currentState` **y** el `responseKey` corresponde a la pregunta tipica de ese estado (ej. CTA_AYUDA en CTA_PRIMARIO, INFO_REINTENTO en INFO_REINTENTO), considerar "anti-repeat": ignorar LLM y ejecutar el handler FSM con el mensaje del usuario. El FSM puede entonces clasificar por keywords y avanzar o llevar a SALIDA_ELEGANTE.

---

## 4. Checklist de tareas

- [ ] Añadir estado `CTA_CANAL` en `conversation-state.ts`.
- [ ] Añadir mensajes `CTA_VISITA_O_CONTACTO` y `CTA_CANAL` (o equivalentes) en `development-content.ts` por desarrollo.
- [ ] Implementar `classifyCtaPrimario` y `classifyCtaCanal` (o keywords) en intent-classifier / conversation-keywords.
- [ ] Modificar `handleCtaPrimario` para: visitar -> SOLICITUD_HORARIO; contactado -> CTA_CANAL; short-circuit canal (WA/llamada) -> SOLICITUD_HORARIO.
- [ ] Implementar `handleCtaCanal` y registrarlo en `processState`.
- [ ] Definir `allowedNextStatesByState` (allowlist) y validacion post-LLM en `processState`: si `nextState` no permitido, usar fallback FSM.
- [ ] Restringir en `response-selector.ts` los nextState permitidos cuando currentState es CTA_PRIMARIO y CTA_CANAL.
- [ ] Implementar anti-repeat: si LLM devuelve mismo state + responseKey de pregunta actual, ignorar y usar fallback FSM.
- [ ] Separar o mapear `preferred_action` (visita | contactado) y `preferred_channel` (whatsapp | llamada) en UserData y en copy para Cliq/CRM.
- [ ] Actualizar `buildOutboundFromSelection` y referencias a CTA_AYUDA si se cambian las claves de mensaje.
- [ ] Pruebas: flujo visitar; flujo contactado -> CTA_CANAL -> WhatsApp/llamada; short-circuit; anti-ciclo; tests con inputs mixtos y ruidosos (ver seccion 5).

---

## 5. Tests con inputs mixtos y ruidosos

Cubrir casos donde el usuario no responde de forma limpia, para evitar ciclos, salidas bruscas o estados incoherentes.

| Tipo de input        | Ejemplos                                              | Comportamiento esperado                                                                 |
|----------------------|--------------------------------------------------------|------------------------------------------------------------------------------------------|
| Insultos / ofensas   | "no mames", "pinche bot", etc.                         | No entrar en ciclo; respuesta neutra o SALIDA_ELEGANTE suave; no repetir la misma CTA.  |
| "No se" / ambiguo    | "no se", "tal vez", "no estoy seguro"                  | En CTA: re-preguntar una vez (ej. CTA_AYUDA) o llevar a INFO_REINTENTO/SALIDA segun estado. |
| Stickers / solo emoji| Mensaje sin texto (solo sticker o emoji)              | Tratar como "no entendido": mensaje fijo ("¿Podrías escribir tu respuesta?") o no cambiar estado. |
| Audios transcritos   | Transcripcion incompleta o con errores ("...", "eh")   | Usar LLM/fallback para intentar extraer intencion; si imposible, no avanzar estado o re-preguntar. |
| Mezcla visita/canal  | "quiero visitar o por whatsapp"                        | Decidir prioridad (ej. visita) o pedir aclaracion en un solo mensaje.                   |
| Respuestas largas   | Parrafo con varias intenciones                         | Priorizar la mas alineada al estado actual (CTA_PRIMARIO -> visita/contactado/canal).    |
| Comandos / jerga     | "/reset", "hablar con humano"                          | /reset ya manejado; "humano" puede ir a SOLICITUD_HORARIO o handover segun regla.       |

**Recomendacion:** Tests automatizados (jest/vitest) que simulen `handleIncomingMessage` o los handlers con estos inputs y comprueben: (1) no ciclo (no dos mensajes seguidos con la misma pregunta), (2) estado final coherente, (3) no crash ni estado invalido.

---

## 6. Resumen

- **Estado actual**: Un solo CTA "visita o llamada"; el ciclo puede deberse a que el LLM, sin restriccion por estado, devuelve CONFIRMACION_* + CTA_PRIMARIO desde CTA_PRIMARIO, o nextState que retrocede a FILTRO_INTENCION / INFO_REINTENTO.
- **Propuesta**: CTA en dos pasos (visita vs contactado; si contactado, WhatsApp vs llamada) con estado nuevo `CTA_CANAL` y copy nuevo.
- **Controles**: (1) Tabla allowlist `allowedNextStatesByState` y validacion post-LLM; (2) short-circuit en CTA_PRIMARIO si el usuario ya dice canal (WA/llamada); (3) separar `preferred_action` (visita | contactado) y `preferred_channel` (whatsapp | llamada) con mapping claro; (4) anti-repeat cuando el LLM devuelve mismo state + responseKey de pregunta actual; (5) tests con inputs mixtos y ruidosos (insultos, "no se", stickers, audios transcritos incompletos).
