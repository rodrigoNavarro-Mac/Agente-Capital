# 🤝 Guía de Contribución - Capital Plus AI Agent

¡Gracias por tu interés en contribuir! Esta guía te ayudará a mantener el código limpio y consistente.

## 📋 Tabla de Contenidos

- [Código de Conducta](#código-de-conducta)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Convenciones de Código](#convenciones-de-código)
- [Proceso de Desarrollo](#proceso-de-desarrollo)
- [Testing](#testing)
- [Documentación](#documentación)

## 🤝 Código de Conducta

- Sé respetuoso y profesional
- Colabora de manera constructiva
- Este es un proyecto interno corporativo

## 📁 Estructura del Proyecto

```
/src
  /app
    /api           → Backend endpoints (Next.js API Routes)
    /dashboard     → Frontend pages
    /layout.tsx    → Root layout
    /globals.css   → Global styles
  
  /components
    /ui            → ShadCN components (NO modificar)
    /*.tsx         → Custom components
  
  /lib
    /api.ts        → API client
    /pinecone.ts   → Pinecone integration
    /postgres.ts   → Database queries
    /utils.ts      → Utility functions
    /constants.ts  → Constants & configs
  
  /types
    /documents.ts  → TypeScript types
```

## 🎨 Convenciones de Código

### TypeScript

```typescript
// ✅ CORRECTO
interface User {
  id: number;
  name: string;
  email: string;
}

export async function getUserById(id: number): Promise<User | null> {
  // ...
}

// ❌ INCORRECTO
function getUserById(id) {  // Sin tipos
  // ...
}
```

### Naming Conventions

| Tipo | Convención | Ejemplo |
|------|------------|---------|
| **Componentes** | PascalCase | `UserProfile.tsx` |
| **Funciones** | camelCase | `getUserById()` |
| **Constants** | UPPER_SNAKE_CASE | `MAX_FILE_SIZE` |
| **Types/Interfaces** | PascalCase | `UserProfile` |
| **Archivos** | kebab-case | `user-profile.tsx` |

### Imports

Orden de imports:

```typescript
// 1. React/Next
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// 2. External libraries
import { z } from 'zod';

// 3. Internal components
import { Button } from '@/components/ui/button';
import { UserCard } from '@/components/user-card';

// 4. Internal utilities
import { cn, formatDate } from '@/lib/utils';
import { API_ENDPOINTS } from '@/lib/constants';

// 5. Types
import type { User } from '@/types/documents';
```

### Componentes React

```typescript
// ✅ CORRECTO
'use client';  // Si usa hooks

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface UserCardProps {
  user: User;
  onEdit?: () => void;
}

export function UserCard({ user, onEdit }: UserCardProps) {
  const [loading, setLoading] = useState(false);

  return (
    <div className="p-4 border rounded-lg">
      <h3 className="font-bold">{user.name}</h3>
      {onEdit && (
        <Button onClick={onEdit} disabled={loading}>
          Editar
        </Button>
      )}
    </div>
  );
}
```

### API Routes

```typescript
// src/app/api/example/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Lógica aquí
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('❌ Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error message' },
      { status: 500 }
    );
  }
}
```

## 🔄 Proceso de Desarrollo

### 1. Crear una Rama

```bash
git checkout -b feature/nombre-feature
# o
git checkout -b fix/nombre-bug
```

### 2. Hacer Cambios

- Escribe código limpio y documentado
- Sigue las convenciones
- Prueba localmente

### 3. Commit

```bash
# Commits descriptivos
git commit -m "feat: agregar filtro de documentos por fecha"
git commit -m "fix: corregir error en upload de CSV"
git commit -m "docs: actualizar README con nuevas instrucciones"
```

Prefijos de commit:
- `feat:` Nueva funcionalidad
- `fix:` Corrección de bug
- `docs:` Documentación
- `style:` Formato (no afecta código)
- `refactor:` Refactorización
- `test:` Tests
- `chore:` Mantenimiento

### 4. Push y PR

```bash
git push origin feature/nombre-feature
```

Crea un Pull Request con:
- Título descriptivo
- Descripción de cambios
- Screenshots (si aplica)

## 🧪 Testing

### Probar Localmente

```bash
# Iniciar dev server
npm run dev

# En otro terminal, probar APIs
curl http://localhost:3000/api/developments

# Verificar UI en navegador
open http://localhost:3000
```

### Checklist antes de PR

- [ ] El código compila sin errores
- [ ] Las páginas cargan correctamente
- [ ] Los API endpoints responden
- [ ] No hay errores en consola
- [ ] El linter pasa (`npm run lint`)
- [ ] La UI se ve bien en desktop y mobile
- [ ] Los colores corporativos se mantienen
- [ ] Las migraciones funcionan

## 📝 Documentación

### Comentar Código

```typescript
/**
 * Obtiene un usuario por su ID
 * 
 * @param id - ID del usuario
 * @returns Usuario encontrado o null
 * @throws Error si hay problema de conexión
 */
export async function getUserById(id: number): Promise<User | null> {
  // ...
}
```

### Documentar Componentes

```typescript
/**
 * Card para mostrar información de usuario
 * 
 * @example
 * ```tsx
 * <UserCard 
 *   user={user} 
 *   onEdit={() => handleEdit(user.id)} 
 * />
 * ```
 */
export function UserCard({ user, onEdit }: UserCardProps) {
  // ...
}
```

## 🎨 Estilos y UI

### Usar Colores Corporativos

```tsx
// ✅ CORRECTO
<div className="bg-capital-navy text-white">
<Button variant="default">  {/* Navy background */}
<Badge variant="secondary">  {/* Gold background */}

// ❌ INCORRECTO
<div className="bg-blue-900">  {/* No usar colores genéricos */}
```

### TailwindCSS

```tsx
// ✅ CORRECTO - Mobile first
<div className="p-4 md:p-8 lg:p-12">

// ✅ CORRECTO - Usar utilidades
<div className="flex items-center justify-between gap-4">

// ❌ INCORRECTO - Estilos inline
<div style={{ display: 'flex', padding: '16px' }}>
```

## 🗄️ Base de Datos

### Crear Nueva Tabla

1. Edita `scripts/migrate.js`
2. Agrega migración:

```javascript
{
  name: 'create_nueva_tabla',
  sql: `
    CREATE TABLE IF NOT EXISTS nueva_tabla (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_nueva_nombre ON nueva_tabla(nombre);
  `,
},
```

3. Ejecuta: `npm run db:migrate -- reset`

### Queries

```typescript
// ✅ CORRECTO - Usar prepared statements
const result = await query(
  'SELECT * FROM users WHERE email = $1',
  [email]
);

// ❌ INCORRECTO - SQL injection risk
const result = await query(
  `SELECT * FROM users WHERE email = '${email}'`
);
```

## 📦 Agregar Dependencia

```bash
# Backend dependency
npm install nombre-paquete

# Dev dependency
npm install -D nombre-paquete

# Actualizar README con nueva dependencia
```

## 🐛 Reportar Bugs

Incluye:
- Descripción del bug
- Pasos para reproducir
- Comportamiento esperado
- Comportamiento actual
- Screenshots
- Logs de consola

## 🎯 Prioridades

1. **Seguridad** - Siempre primero
2. **Estabilidad** - No romper lo existente
3. **Performance** - Optimizar cuando sea posible
4. **UX** - Mantener interfaz intuitiva
5. **Features** - Nuevas funcionalidades

## ✅ Code Review Checklist

- [ ] Código sigue convenciones
- [ ] Sin console.logs innecesarios
- [ ] Tipos TypeScript correctos
- [ ] Componentes reutilizables
- [ ] No hay código duplicado
- [ ] Performance optimizado
- [ ] Seguro (sin SQL injection, XSS, etc.)
- [ ] Accesible (a11y)
- [ ] Responsive
- [ ] Documentado

## 🚀 Deploy

```bash
# Build de producción
npm run build

# Verificar que compile
npm run start
```

## 📞 Contacto

Para dudas sobre contribución:
- Slack: #capital-plus-ai
- Email: dev@capitalplus.com

---

**¡Gracias por contribuir a Capital Plus AI Agent!** 🙏

