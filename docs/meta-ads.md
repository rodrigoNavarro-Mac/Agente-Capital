# Módulo Meta Ads

Motor de recomendaciones determinista para la gestión de anuncios de Meta Ads, integrando datos de solo lectura desde Zoho CRM y Meta Ads.

---

## Propósito

El módulo proporciona un **Recommendation Engine** que:

- Lee datos de Zoho CRM (leads, deals, etc.) y Meta Ads (campañas, insights)
- Aplica reglas de negocio versionadas para generar recomendaciones
- No modifica datos externos; es de solo lectura

---

## Arquitectura

| Capa | Ubicación | Responsabilidad |
|------|-----------|------------------|
| **Domain** | `src/lib/modules/meta-ads/domain/` | Lógica de negocio pura, reglas, perfiles, templates. Sin efectos secundarios ni timestamps. |
| **Infrastructure** | `src/lib/modules/meta-ads/infrastructure/` | Adapters de solo lectura: Zoho CRM (`zoho/adapter.ts`), Meta Ads (`meta/adapter.ts`, `meta/graph-adapter.ts`). |
| **Application** | `src/lib/modules/meta-ads/application/` | Orquestación: `recommendation-service.ts`, `facade.ts`. Gobierno y auditoría. |

---

## Restricciones de diseño

- **Sin efectos secundarios** en el Rules Engine (dominio puro)
- **Sin timestamps** generados en la capa de dominio
- **Versionado estricto** de configuración y reglas

---

## Configuración

### 1. Habilitar adapters de producción

En `.env.local`:

```env
USE_REAL_ADAPTERS=true
```

### 2. Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `META_ACCESS_TOKEN` | Token de acceso a la Meta Marketing API (permisos: `ads_read`, `read_insights`) |
| `META_AD_ACCOUNT_ID` | ID de la cuenta de anuncios (formato `act_123456789`) |

### 3. Obtener credenciales

**META_ACCESS_TOKEN:**

1. Ir a [Meta for Developers](https://developers.facebook.com/)
2. Crear o seleccionar una App
3. Añadir el producto "Marketing API"
4. En **Tools > Graph API Explorer**: seleccionar la App, "Get Token" > "Get User Access Token"
5. Seleccionar permisos: `ads_read`, `read_insights`
6. Generar el token

*Para uso prolongado, generar un System User Token en Business Manager.*

**META_AD_ACCOUNT_ID:**

1. Ir a [Ads Manager](https://adsmanager.facebook.com/)
2. Revisar la URL o el selector de campañas
3. El ID suele comenzar con `act_` (ej.: `act_123456789`)

---

## Relación con otros módulos

- **Zoho CRM:** El adapter lee leads y deals para alimentar el contexto del motor de recomendaciones.
- **Meta Ads:** El adapter lee campañas e insights para evaluar rendimiento y sugerir ajustes.

---

*Documentación adicional del módulo: [src/lib/modules/meta-ads/README.md](../src/lib/modules/meta-ads/README.md)*
