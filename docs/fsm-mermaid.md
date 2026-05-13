# Diagrama Mermaid: Máquina de Estados Finitos (FSM) - Bot WhatsApp

Diagrama completo de la FSM con todos los flujos y transiciones. Basado en `conversation-flows.ts`, `fsm-transiciones-detalle.md` y `whatsapp-bot.md`.

---

## Flujo de entrada completo (horario + interceptores)

Muestra qué pasa desde que llega un mensaje hasta que se procesa, incluyendo la lógica de horario laboral y los interceptores especiales.

```mermaid
flowchart TD
    MSG([Mensaje entrante WhatsApp]) --> RESET_CHECK{¿Es /reset?}
    RESET_CHECK -->|Sí| RESET_ACTION[Reiniciar conversación<br/>Responder confirmación]
    RESET_ACTION --> FIN_RESET([Fin])

    RESET_CHECK -->|No| HORARIO{¿isBusinessHours?<br/>Lun–Vie 09:00–19:00<br/>Sáb 10:00–14:00}

    HORARIO -->|DENTRO de horario| CALIFICADO{¿Lead ya<br/>calificado /<br/>CLIENT_ACCEPTA?}
    CALIFICADO -->|Sí| SILENCIO[Bot silencioso<br/>Asesor maneja en Cliq]
    CALIFICADO -->|No| MSG_ASESOR[Enviar mensaje:<br/>asesor disponible ahora]
    SILENCIO --> FIN_HORARIO([Fin])
    MSG_ASESOR --> FIN_HORARIO

    HORARIO -->|FUERA de horario| CONV_EXIST{¿Conversación<br/>existente?}

    CONV_EXIST -->|No existe| NEW_CONV[Crear conversación<br/>estado = INICIO]
    NEW_CONV --> SOLO_SALUDO{¿Solo saludo?}
    SOLO_SALUDO -->|Sí| BIENVENIDA[Enviar BIENVENIDA + hero image<br/>Ir a FILTRO_INTENCION]
    SOLO_SALUDO -->|No| INTENTO_1{¿Mensaje con<br/>intención clara?}
    INTENTO_1 -->|Sí| FSM_FILTRO[Procesar en<br/>FILTRO_INTENCION]
    INTENTO_1 -->|No| BIENVENIDA

    CONV_EXIST -->|Existe| ESTADO_CHECK{¿Estado actual?}
    ESTADO_CHECK -->|CLIENT_ACCEPTA<br/>o is_qualified| SILENCIO
    ESTADO_CHECK -->|SALIDA_ELEGANTE| REINICIO[Reiniciar → INICIO<br/>enviar BIENVENIDA]
    ESTADO_CHECK -->|Cualquier otro| FAQ_CHECK

    BIENVENIDA --> FIN_BOT([Respuesta enviada])
    REINICIO --> FIN_BOT

    FAQ_CHECK{¿FAQ<br/>interceptada?} -->|Sí| FAQ_RESP[Responder FAQ<br/>mantener estado actual]
    FAQ_RESP --> FIN_BOT
    FAQ_CHECK -->|No| ANTI_LOOP{¿stuck_count >= 3?}
    ANTI_LOOP -->|Sí| SALIDA_LOOP[Forzar SALIDA_ELEGANTE<br/>reset contador]
    SALIDA_LOOP --> FIN_BOT
    ANTI_LOOP -->|No| LLM_CHECK{¿Estado usa<br/>LLM selector?}

    LLM_CHECK -->|Sí: FILTRO_INTENCION<br/>INFO_REINTENTO<br/>CTA_PRIMARIO<br/>SOLICITUD_HORARIO<br/>SOLICITUD_NOMBRE| LLM[LLM elige respuesta<br/>y siguiente estado]
    LLM -->|nextState válido| FSM_TRANS[Transición + respuesta]
    LLM -->|fallo o estado inválido| FSM_KW[Fallback: keywords + FSM]

    LLM_CHECK -->|No| FSM_KW
    FSM_KW --> FSM_TRANS
    FSM_TRANS --> PERSON[Personalización emocional<br/>response-personalizer]
    PERSON --> FIN_BOT

    style MSG fill:#e3f2fd
    style FIN_BOT fill:#e8f5e9
    style FIN_HORARIO fill:#fff3e0
    style SILENCIO fill:#f5f5f5
    style SALIDA_LOOP fill:#fce4ec
```

> **Nota:** `isBusinessHours()` en `conversation-flows.ts` retorna `false` de forma forzada (modo testing). El comportamiento real depende de `src/lib/business-hours.ts`.

---

---

## Diagrama principal (stateDiagram-v2)

```mermaid
stateDiagram-v2
    direction TB

    [*] --> INICIO

    state INICIO {
    }

    state FILTRO_INTENCION {
    }

    state INFO_REINTENTO {
    }

    state CTA_PRIMARIO {
    }

    state CTA_CANAL {
    }

    state SOLICITUD_HORARIO {
    }

    state SOLICITUD_NOMBRE {
    }

    state CLIENT_ACCEPTA {
        note right of CLIENT_ACCEPTA : Bot no responde.<br/>Handover a asesor.
    }

    state SALIDA_ELEGANTE {
        note right of SALIDA_ELEGANTE : Lead descalificado.<br/>Siguiente mensaje reinicia a INICIO.
    }

    %% INICIO: solo transición automática
    INICIO --> FILTRO_INTENCION : [automático] Bienvenida + hero

    %% FILTRO_INTENCION
    FILTRO_INTENCION --> FILTRO_INTENCION : Solo saludo (hola, buenas)
    FILTRO_INTENCION --> CTA_PRIMARIO : Alta intención (comprar/invertir/construir)
    FILTRO_INTENCION --> INFO_REINTENTO : Solo info o no claro (1ra vez)
    FILTRO_INTENCION --> SALIDA_ELEGANTE : Solo info o no claro (retry >= 1)

    %% INFO_REINTENTO
    INFO_REINTENTO --> CTA_PRIMARIO : Sí / comprar / invertir (recuperado)
    INFO_REINTENTO --> SALIDA_ELEGANTE : Sigue solo info o duda

    %% CTA_PRIMARIO
    CTA_PRIMARIO --> SALIDA_ELEGANTE : Negativo (no gracias, luego, etc.)
    CTA_PRIMARIO --> SOLICITUD_HORARIO : Visitar / videollamada
    CTA_PRIMARIO --> SOLICITUD_NOMBRE : Llamada (short-circuit)
    CTA_PRIMARIO --> CTA_CANAL : Contactado genérico o sí sin canal
    CTA_PRIMARIO --> SALIDA_ELEGANTE : Ambiguo

    %% CTA_CANAL
    CTA_CANAL --> SALIDA_ELEGANTE : Negativo o ambiguo
    CTA_CANAL --> SOLICITUD_NOMBRE : Llamada
    CTA_CANAL --> SOLICITUD_HORARIO : Videollamada o sí (default)

    %% SOLICITUD_HORARIO
    SOLICITUD_HORARIO --> SOLICITUD_NOMBRE : Cualquier texto (horario)

    %% SOLICITUD_NOMBRE
    SOLICITUD_NOMBRE --> SOLICITUD_NOMBRE : Nombre < 3 caracteres
    SOLICITUD_NOMBRE --> CLIENT_ACCEPTA : Nombre válido (3+ chars)

    %% CLIENT_ACCEPTA: estado final (sin transición saliente)
    %% SALIDA_ELEGANTE: en siguiente mensaje se fuerza INICIO
    SALIDA_ELEGANTE --> INICIO : Usuario escribe de nuevo
```

---

## Versión simplificada (solo transiciones, sin notas)

```mermaid
stateDiagram-v2
    [*] --> INICIO
    INICIO --> FILTRO_INTENCION
    FILTRO_INTENCION --> FILTRO_INTENCION : saludo
    FILTRO_INTENCION --> CTA_PRIMARIO : comprar/invertir
    FILTRO_INTENCION --> INFO_REINTENTO : solo info / no claro (1ra)
    FILTRO_INTENCION --> SALIDA_ELEGANTE : solo info / no claro (2da)
    INFO_REINTENTO --> CTA_PRIMARIO : recuperado
    INFO_REINTENTO --> SALIDA_ELEGANTE : insiste solo info
    CTA_PRIMARIO --> SALIDA_ELEGANTE : negativo/ambiguo
    CTA_PRIMARIO --> SOLICITUD_HORARIO : visitar/videollamada
    CTA_PRIMARIO --> SOLICITUD_NOMBRE : llamada
    CTA_PRIMARIO --> CTA_CANAL : contactado/sí sin canal
    CTA_CANAL --> SALIDA_ELEGANTE : negativo/ambiguo
    CTA_CANAL --> SOLICITUD_NOMBRE : llamada
    CTA_CANAL --> SOLICITUD_HORARIO : videollamada/sí
    SOLICITUD_HORARIO --> SOLICITUD_NOMBRE : horario
    SOLICITUD_NOMBRE --> SOLICITUD_NOMBRE : nombre corto
    SOLICITUD_NOMBRE --> CLIENT_ACCEPTA : nombre válido
    SALIDA_ELEGANTE --> INICIO : mensaje usuario
```

---

## Flujo de éxito (camino feliz)

Camino desde entrada hasta lead calificado (CLIENT_ACCEPTA):

```mermaid
flowchart LR
    A[INICIO] --> B[FILTRO_INTENCION]
    B --> C[CTA_PRIMARIO]
    C --> D[SOLICITUD_HORARIO]
    D --> E[SOLICITUD_NOMBRE]
    E --> F[CLIENT_ACCEPTA]

    style A fill:#e8f5e9
    style F fill:#c8e6c9
```

Variantes del camino feliz:
- **Visita:** CTA_PRIMARIO (visitar) -> SOLICITUD_HORARIO -> SOLICITUD_NOMBRE -> CLIENT_ACCEPTA
- **Videollamada:** CTA_PRIMARIO (videollamada) -> SOLICITUD_HORARIO -> SOLICITUD_NOMBRE -> CLIENT_ACCEPTA
- **Llamada (short-circuit):** CTA_PRIMARIO (llamada) -> SOLICITUD_NOMBRE -> CLIENT_ACCEPTA
- **Contactado sin canal:** CTA_PRIMARIO -> CTA_CANAL -> (SOLICITUD_HORARIO o SOLICITUD_NOMBRE) -> CLIENT_ACCEPTA

---

## Flujos hacia SALIDA_ELEGANTE

```mermaid
flowchart TD
    subgraph Entradas a SALIDA_ELEGANTE
        F[FILTRO_INTENCION] --> S[SALIDA_ELEGANTE]
        I[INFO_REINTENTO] --> S
        C1[CTA_PRIMARIO] --> S
        C2[CTA_CANAL] --> S
    end

    S --> N[Usuario escribe]
    N --> IN[INICIO]

    F -->|info_loop / unclear_intent| S
    I -->|insiste_solo_info| S
    C1 -->|rechazo / ambiguo| S
    C2 -->|rechazo / ambiguo| S
```

---

## Allowlist (referencia)

Estados a los que se puede pasar desde cada estado (validación en código):

| Estado actual       | Siguientes permitidos |
|---------------------|------------------------|
| INICIO              | FILTRO_INTENCION       |
| FILTRO_INTENCION    | CTA_PRIMARIO, INFO_REINTENTO, SALIDA_ELEGANTE |
| INFO_REINTENTO      | CTA_PRIMARIO, SALIDA_ELEGANTE |
| CTA_PRIMARIO        | SOLICITUD_HORARIO, SOLICITUD_NOMBRE, CTA_CANAL, SALIDA_ELEGANTE |
| CTA_CANAL           | SOLICITUD_HORARIO, SOLICITUD_NOMBRE, SALIDA_ELEGANTE |
| SOLICITUD_HORARIO   | SOLICITUD_NOMBRE       |
| SOLICITUD_NOMBRE    | CLIENT_ACCEPTA, SOLICITUD_NOMBRE |
| CLIENT_ACCEPTA      | (ninguno)              |
| SALIDA_ELEGANTE     | (siguiente mensaje -> INICIO) |

---

*Generado a partir de `conversation-flows.ts`, `fsm-transiciones-detalle.md` y `whatsapp-bot.md`.*
