# Flujo conversacional WhatsApp (estado actual)

Documento que describe el flujo de estados (FSM) y ejemplos de conversación para el bot de WhatsApp por desarrollo (FUEGO, AMURA, PUNTO TIERRA).

---

## 1. Diagrama de estados (resumen)

```
                    +------------------+
                    |      INICIO      |
                    | (nueva convers.) |
                    +--------+---------+
                             |
                             v
                    +------------------+
                    | FILTRO_INTENCION  |  "¿Invertir o construir?"
                    +--------+---------+
                             |
         +-------------------+-------------------+
         |                   |                   |
         v                   v                   v
   [comprar/invertir]   [solo_info]        [no claro]
         |                   |                   |
         v                   v                   v
   +-----------+     +---------------+   +---------------+
   |CTA_PRIMARIO|     | INFO_REINTENTO |   | INFO_REINTENTO|
   |"Visitar o  |     | (reintento)   |   | (1ra vez)     |
   | contactado?"|    +-------+--------+   +-------^-------+
   +------+------+            |                    |
          |                   | [sí/quiero]       |
          |                   +-----------+       |
          |                   CTA_PRIMARIO <------+
          |
    +-----+-----+-----+-----+
    |     |     |     |     |
    v     v     v     v     v
[visitar] [llamada] [videollamada] [contactado] [negativo]
    |     |     |     |     |
    v     v     v     v     v
SOLICITUD  SOLICITUD  SOLICITUD  CTA_CANAL   SALIDA_
HORARIO    NOMBRE     HORARIO    "¿Llamada   ELEGANTE
    |     (skip       (fecha/     o video?"
    |     horario)    horario)         |
    |         |           |       +----+----+
    |         |           |       |         |
    |         |           |   [llamada] [videollamada]
    |         |           |       |         |
    v         v           v       v         v
    +---------+-----------+   SOLICITUD  SOLICITUD
              |                   NOMBRE   HORARIO
              v                       |         |
         SOLICITUD_NOMBRE <------------+         |
              |                                 |
              v                                 v
         SOLICITUD_NOMBRE <---------------------+
              |
              v
    +------------------+
    | CLIENT_ACCEPTA   |  Lead en Zoho + canal Cliq + brochure
    | (handover)       |
    +------------------+
```

---

## 2. Estados y qué hace cada uno

| Estado | Descripción | Siguiente(s) según respuesta |
|--------|-------------|-------------------------------|
| **INICIO** | Primera vez; se crea conversación. | FILTRO_INTENCION (con BIENVENIDA + hero image) |
| **FILTRO_INTENCION** | Pregunta si quiere invertir o construir. | CTA_PRIMARIO (comprar/invertir), INFO_REINTENTO (solo info o no claro) |
| **INFO_REINTENTO** | Reintento suave: datos + "¿invertir o vivir?". | CTA_PRIMARIO (si dice sí/quiero), SALIDA_ELEGANTE (si insiste en solo info) |
| **CTA_PRIMARIO** | "¿Visitar el desarrollo o que un agente te contacte?". | SOLICITUD_HORARIO (visitar), SOLICITUD_NOMBRE (llamada, short-circuit), SOLICITUD_HORARIO (videollamada, short-circuit), CTA_CANAL (contactado genérico), SALIDA_ELEGANTE (negativo) |
| **CTA_CANAL** | "¿Por llamada telefónica o por videollamada?". | SOLICITUD_NOMBRE (llamada), SOLICITUD_HORARIO (videollamada o "sí"), SALIDA_ELEGANTE (negativo) |
| **SOLICITUD_HORARIO** | Pide horario (visita) o día y horario (videollamada). | SOLICITUD_NOMBRE |
| **SOLICITUD_NOMBRE** | Pide nombre completo. | CLIENT_ACCEPTA (nombre válido 3+ caracteres), o se repite pedido |
| **CLIENT_ACCEPTA** | Handover: lead en Zoho, canal Cliq, brochure, despedida. El bot ya no responde; habla el asesor. | — |
| **SALIDA_ELEGANTE** | No califica; despedida amable. Si escribe de nuevo, se reinicia a INICIO. | INICIO (al siguiente mensaje) |

---

## 3. Datos que se guardan (user_data)

- **intencion**: `comprar` | `invertir` | `solo_info`
- **perfil_compra**: `construir_casa` | `inversion`
- **preferred_action**: `visita` | `contactado`
- **preferred_channel**: `llamada` | `videollamada` (solo si preferred_action = contactado)
- **horario_preferido**: texto libre (solo si pasó por SOLICITUD_HORARIO)
- **nombre** / **name**: nombre completo antes del handover

---

## 4. Ejemplos conversacionales

Los mensajes del bot dependen del desarrollo (FUEGO, AMURA, PUNTO TIERRA). Aquí se usa un estilo genérico; en producción salen los textos de `development-content.ts`.

---

### Ejemplo A: Usuario quiere visitar el desarrollo

| # | Quién | Mensaje | Estado después |
|---|--------|---------|-----------------|
| 1 | Usuario | Hola | (conversación nueva) |
| 2 | Bot | [BIENVENIDA] Hola, soy el asistente de AMURA. ¿Te interesa invertir o construir? [hero image] | FILTRO_INTENCION |
| 3 | Usuario | Construir / para vivir | |
| 4 | Bot | [CONFIRMACION_COMPRA] Excelente... Si buscas construir... [CTA_VISITA_O_CONTACTO] ¿Quieres visitar el desarrollo o que un agente te contacte? | CTA_PRIMARIO |
| 5 | Usuario | Visitar / ir a ver | |
| 6 | Bot | [SOLICITUD_HORARIO] ¿A qué hora te gustaría que te contactemos o que realicemos la llamada? | SOLICITUD_HORARIO |
| 7 | Usuario | Mañana a las 10 | |
| 8 | Bot | [SOLICITUD_NOMBRE] ¿Me compartes tu nombre completo, por favor? | SOLICITUD_NOMBRE |
| 9 | Usuario | Juan Pérez | |
| 10 | Bot | [Brochure PDF] [HANDOVER_EXITOSO] Gracias, Juan. Te conecto con un asesor... | CLIENT_ACCEPTA |

**Datos guardados:** intencion=comprar, perfil_compra=construir_casa, preferred_action=visita, horario_preferido="Mañana a las 10", nombre="Juan Pérez".

---

### Ejemplo B: Usuario quiere que lo contacten por llamada (sin horario)

| # | Quién | Mensaje | Estado después |
|---|--------|---------|-----------------|
| 1 | Usuario | Hola | FILTRO_INTENCION |
| 2 | Bot | [BIENVENIDA] ... ¿Invertir o construir? | FILTRO_INTENCION |
| 3 | Usuario | Invertir | |
| 4 | Bot | [CONFIRMACION_INVERSION] ... [CTA_VISITA_O_CONTACTO] ¿Visitar o que te contacte un agente? | CTA_PRIMARIO |
| 5 | Usuario | Por llamada / que me llamen | |
| 6 | Bot | [SOLICITUD_NOMBRE] ¿Me compartes tu nombre completo? | SOLICITUD_NOMBRE |
| 7 | Usuario | María García | |
| 8 | Bot | [Brochure] [HANDOVER_EXITOSO] Gracias, María. Un asesor te contactará. | CLIENT_ACCEPTA |

**Nota:** No se pide horario; va directo de CTA a nombre y handover.  
**Datos:** preferred_action=contactado, preferred_channel=llamada, sin horario_preferido.

---

### Ejemplo C: Usuario quiere videollamada (con fecha y horario)

| # | Quién | Mensaje | Estado después |
|---|--------|---------|-----------------|
| 1 | Usuario | Hola | FILTRO_INTENCION |
| 2 | Bot | [BIENVENIDA] ... | FILTRO_INTENCION |
| 3 | Usuario | Quiero invertir | |
| 4 | Bot | [CONFIRMACION_INVERSION] ... [CTA_VISITA_O_CONTACTO] ¿Visitar o que te contacte un agente? | CTA_PRIMARIO |
| 5 | Usuario | Que me contacte un agente | |
| 6 | Bot | [CTA_CANAL] ¿Por llamada telefónica o por videollamada? | CTA_CANAL |
| 7 | Usuario | Videollamada / por video | |
| 8 | Bot | [SOLICITUD_FECHA_HORARIO] ¿En qué día y horario te gustaría agendar la videollamada? | SOLICITUD_HORARIO |
| 9 | Usuario | El jueves a las 4 | |
| 10 | Bot | [SOLICITUD_NOMBRE] ¿Me compartes tu nombre completo? | SOLICITUD_NOMBRE |
| 11 | Usuario | Roberto López | |
| 12 | Bot | [Brochure] [HANDOVER_EXITOSO] ... | CLIENT_ACCEPTA |

**Datos:** preferred_action=contactado, preferred_channel=videollamada, horario_preferido="El jueves a las 4".

---

### Ejemplo D: Short-circuit desde CTA_PRIMARIO (dice "llamada" o "videollamada" ya en la primera CTA)

Si en CTA_PRIMARIO el usuario responde directamente el canal, no se muestra CTA_CANAL.

**Variante llamada:**

| # | Quién | Mensaje | Estado |
|---|--------|---------|--------|
| ... | ... | (igual hasta CTA_PRIMARIO) | CTA_PRIMARIO |
| 5 | Usuario | Llamada / por teléfono | |
| 6 | Bot | [SOLICITUD_NOMBRE] ¿Me compartes tu nombre completo? | SOLICITUD_NOMBRE |

**Variante videollamada:**

| 5 | Usuario | Videollamada | |
| 6 | Bot | [SOLICITUD_FECHA_HORARIO] ¿En qué día y horario te gustaría agendar la videollamada? | SOLICITUD_HORARIO |

---

### Ejemplo E: Solo información y luego se recupera

| # | Quién | Mensaje | Estado después |
|---|--------|---------|-----------------|
| 1 | Usuario | Hola | FILTRO_INTENCION |
| 2 | Bot | [BIENVENIDA] ... | FILTRO_INTENCION |
| 3 | Usuario | Solo quiero ver precios | |
| 4 | Bot | [INFO_REINTENTO] Claro. Precios desde $X... ¿Lo estás evaluando para invertir o para vivir? | INFO_REINTENTO |
| 5 | Usuario | Sí, me interesa invertir | |
| 6 | Bot | [CONFIRMACION_COMPRA] ... [CTA_VISITA_O_CONTACTO] ¿Visitar o que te contacte un agente? | CTA_PRIMARIO |

Si en INFO_REINTENTO insiste en solo info o dice no, se envía SALIDA_ELEGANTE.

---

### Ejemplo F: Rechazo en CTA (salida elegante)

| # | Quién | Mensaje | Estado después |
|---|--------|---------|-----------------|
| ... | ... | (en CTA_PRIMARIO o CTA_CANAL) | |
| 5 | Usuario | No gracias / luego / ahora no | |
| 6 | Bot | [SALIDA_ELEGANTE] Entiendo. Gracias por tu interés... Cuando decidas avanzar, aquí estaré. | SALIDA_ELEGANTE |

Si más adelante el usuario escribe de nuevo, la conversación se reinicia desde INICIO (nueva BIENVENIDA).

---

### Ejemplo G: Nombre muy corto (re-pedir)

| # | Quién | Mensaje | Estado después |
|---|--------|---------|-----------------|
| ... | Bot | [SOLICITUD_NOMBRE] ¿Nombre completo? | SOLICITUD_NOMBRE |
| 9 | Usuario | Juan | |
| 10 | Bot | Por favor, ¿me podrías decir tu nombre para decirle al asesor? | SOLICITUD_NOMBRE |
| 11 | Usuario | Juan Pérez García | |
| 12 | Bot | [Brochure] [HANDOVER_EXITOSO] ... | CLIENT_ACCEPTA |

Se exigen al menos 3 caracteres para aceptar el nombre.

---

## 5. Comando especial

- **/reset**: Reinicia la conversación (borra estado y datos, vuelve a INICIO). Respuesta: "Conversación reiniciada...".

---

## 6. Handover (CLIENT_ACCEPTA)

Cuando se llega a CLIENT_ACCEPTA:

1. Se crea/actualiza el lead en Zoho CRM (teléfono, desarrollo, nombre, origen WhatsApp, campo Datos con horario si aplica).
2. Se crea canal en Zoho Cliq y se invita al agente (y monitoreo según config).
3. Se envía un mensaje de contexto al canal (cliente, teléfono, intención, acción preferida, horario, enlace al CRM).
4. Se marca la conversación como calificada y estado CLIENT_ACCEPTA.
5. Se envía al usuario: brochure (PDF) + mensaje HANDOVER_EXITOSO con el nombre.

A partir de ahí el bot no responde en ese hilo; la conversación es entre asesor y cliente (Cliq ↔ WhatsApp).

---

## 7. Resumen por rama

| Rama | Pasos después de CTA | ¿Se pide horario? |
|------|----------------------|--------------------|
| **Visitar** | CTA_PRIMARIO → SOLICITUD_HORARIO → SOLICITUD_NOMBRE → handover | Sí (horario genérico) |
| **Contactado + Llamada** | CTA_PRIMARIO o CTA_CANAL → SOLICITUD_NOMBRE → handover | No |
| **Contactado + Videollamada** | CTA_PRIMARIO o CTA_CANAL → SOLICITUD_HORARIO (fecha/horario) → SOLICITUD_NOMBRE → handover | Sí (día y horario) |
