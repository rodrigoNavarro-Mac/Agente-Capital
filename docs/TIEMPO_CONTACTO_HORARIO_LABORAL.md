# Explicación: Cálculo de Tiempos de Contacto en Horario Laboral

## ¿Por qué filtrar por horario laboral?

- **Comparación justa**: Un lead creado a las 2:00 AM puede tardar más en contactarse que uno creado a las 10:00 AM, ya que fuera del horario laboral no hay personal disponible.
- **Métricas operativas**: Medir el desempeño durante las horas de trabajo (08:30 AM - 8:30 PM).
- **Metas realistas**: La meta de 30 minutos aplica a leads generados en horario laboral.

## ¿Cómo funciona el código?

### Paso 1: Configurar el horario laboral y timezone

```typescript
// Horario laboral: 08:30 - 20:30 (en minutos desde medianoche)
const businessStart = 8 * 60 + 30; // 08:30 = 510 minutos
const businessEnd = 20 * 60 + 30;  // 20:30 = 1230 minutos

// Offset UTC para Ciudad de México (UTC-06:00)
// Esto asegura que el cálculo no dependa de la zona horaria del servidor
const BUSINESS_UTC_OFFSET_MINUTES = -360;
const offsetMs = BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000;
```

**Explicación**:
- Convertimos horas a minutos para facilitar las comparaciones.
- Usamos un offset UTC fijo para evitar problemas cuando el servidor está en otra zona horaria.

### Paso 2: Convertir fechas a hora local de negocio

```typescript
const getLocalParts = (date: Date) => {
  // Aplicar el offset UTC para obtener la hora en zona horaria de negocio
  const local = new Date(date.getTime() + offsetMs);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
    dow: local.getUTCDay(),      // Día de la semana (0=Domingo, 6=Sábado)
    hour: local.getUTCHours(),    // Hora (0-23)
    minute: local.getUTCMinutes() // Minuto (0-59)
  };
};
```

**Explicación**:
- `date.getTime()` obtiene el timestamp en milisegundos.
- Sumamos el offset para convertir a la zona horaria de negocio.
- Extraemos las partes de la fecha usando métodos UTC (porque ya aplicamos el offset).

### Paso 3: Verificar si el lead fue creado en horario laboral

```typescript
const isCreatedWithinBusinessHours = (date: Date) => {
  const p = getLocalParts(date);
  const minutes = p.hour * 60 + p.minute; // Convertir hora:minuto a minutos totales
  return minutes >= businessStart && minutes <= businessEnd;
};
```

**Explicación**:
- Convertimos la hora y minuto a un número total de minutos desde medianoche.
- Verificamos si está entre 08:30 (510) y 20:30 (1230).
- Retorna `true` si está dentro del horario, `false` si no.

### Paso 4: Filtrar leads y calcular tiempo de contacto

```typescript
filteredLeads.forEach(lead => {
  // Obtener campos del lead (Zoho puede usar diferentes nombres)
  const createdTime = (lead as any).Creacion_de_Lead || lead.Created_Time;
  const firstContactTime = (lead as any).First_Contact_Time || (lead as any).Ultimo_conctacto;
  const tiempoEntreContacto = (lead as any).Tiempo_entre_primer_contacto;
  
  if (createdTime) {
    const created = new Date(createdTime);
    if (Number.isNaN(created.getTime())) return; // Fecha inválida, saltar
    
    // FILTRO: Solo procesar leads creados en horario laboral
    if (!isCreatedWithinBusinessHours(created)) return;
    
    // PRIORIDAD 1: Usar campo de Zoho si está disponible
    if (tiempoEntreContacto !== null && tiempoEntreContacto !== undefined) {
      const parsed = typeof tiempoEntreContacto === 'number' 
        ? tiempoEntreContacto 
        : parseFloat(tiempoEntreContacto);
      
      if (!Number.isFinite(parsed)) return; // Valor inválido
      if (parsed > 0 && parsed < 100000) {  // Validar rango razonable
        totalTimeToFirstContact += parsed;
        countWithFirstContact++;
      }
      return; // Ya tenemos el valor, no necesitamos calcular
    }
    
    // PRIORIDAD 2: Calcular diferencia entre fechas
    if (!firstContactTime) return; // No hay fecha de contacto
    const firstContact = new Date(firstContactTime);
    if (Number.isNaN(firstContact.getTime())) return;
    
    // Calcular diferencia en minutos (tiempo real, 24/7)
    const diffMinutes = (firstContact.getTime() - created.getTime()) / (1000 * 60);
    if (diffMinutes > 0 && diffMinutes < 100000) {
      totalTimeToFirstContact += diffMinutes;
      countWithFirstContact++;
    }
  }
});
```

**Explicación**:
- **Campos de Zoho**: El código busca en múltiples campos porque Zoho puede usar diferentes nombres.
- **Filtro de horario**: Solo procesa leads creados entre 08:30 y 20:30.
- **Prioridad de datos**: 
  1. Si existe `Tiempo_entre_primer_contacto`, se usa directamente (es más confiable).
  2. Si no, se calcula la diferencia entre `First_Contact_Time` y `Creacion_de_Lead`.
- **Validaciones**: Se verifica que los valores sean números válidos y estén en un rango razonable (< 100,000 minutos ≈ 69 días).

### Paso 5: Calcular el promedio

```typescript
const averageTimeToFirstContact = countWithFirstContact > 0
  ? Math.round((totalTimeToFirstContact / countWithFirstContact) * 10) / 10
  : 0;
```

**Explicación**:
- Dividimos la suma total entre el número de leads procesados.
- Redondeamos a 1 decimal usando `Math.round(... * 10) / 10`.
- Si no hay leads, retornamos 0.

## Ejemplo práctico

Supongamos estos leads:

| Lead | Hora Creación | Tiempo Contacto | ¿Dentro Horario? |
|------|---------------|-----------------|------------------|
| A    | 09:00 AM      | 25 min          | ✅ Sí (09:00)    |
| B    | 02:00 AM      | 180 min         | ❌ No (02:00)    |
| C    | 10:30 AM      | 30 min          | ✅ Sí (10:30)    |
| D    | 11:00 PM      | 240 min         | ❌ No (23:00)    |
| E    | 08:20 AM      | 45 min          | ❌ No (08:20 < 08:30) |

**Sin filtro**: promedio = (25 + 180 + 30 + 240 + 45) / 5 = 104 minutos

**Con filtro (08:30-20:30)**:
- A: 09:00 AM → ✅ dentro (25 min)
- B: 02:00 AM → ❌ fuera (excluido)
- C: 10:30 AM → ✅ dentro (30 min)
- D: 11:00 PM → ❌ fuera (excluido)
- E: 08:20 AM → ❌ fuera (antes de 08:30, excluido)

**Promedio solo de A y C**: (25 + 30) / 2 = **27.5 minutos**

## Conceptos de programación utilizados

1. **Manejo de timezone**: Uso de offset UTC fijo para consistencia independiente del servidor.
2. **Validación de datos**: Verificación de valores nulos, NaN, y rangos razonables.
3. **Priorización de fuentes**: Usar campo calculado de Zoho si existe, sino calcular manualmente.
4. **Conversión de tipos**: Manejo de strings y números en campos de Zoho.
5. **Operaciones con fechas**: `Date.getTime()` retorna milisegundos desde 1970-01-01.
6. **Redondeo preciso**: `Math.round(valor * 10) / 10` para 1 decimal.

## Diferencias importantes con la documentación anterior

### ❌ Documentación anterior (incorrecta):
- Lenguaje: Python/pandas
- Horario: 08:00-20:30
- Campos: `hora_creacion`, `fecha_1er_contacto`
- Sin manejo de timezone

### ✅ Documentación corregida (actual):
- Lenguaje: TypeScript/JavaScript
- Horario: **08:30-20:30** (no 08:00)
- Campos: `Creacion_de_Lead`, `First_Contact_Time`, `Tiempo_entre_primer_contacto`
- **Manejo de timezone**: Offset UTC-06:00 para Ciudad de México
- **Prioridad de campos**: Prefiere `Tiempo_entre_primer_contacto` si existe

## ¿Por qué es importante este enfoque?

1. **Precisión**: Métricas basadas en datos relevantes (solo horario laboral).
2. **Consistencia**: El offset UTC fijo asegura resultados iguales sin importar dónde esté el servidor.
3. **Confiabilidad**: Prioriza campos calculados por Zoho cuando están disponibles.
4. **Comparabilidad**: Permite comparar semanas de forma consistente.
5. **Toma de decisiones**: Refleja el desempeño real durante el horario laboral.




