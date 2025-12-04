# 🛠️ Solución: Error de Webpack con Módulos Nativos

## ❌ El Problema Original

```
Module parse failed: Unexpected character '�' (1:2)
./node_modules/@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node
```

### ¿Qué Pasó?

Next.js/Webpack intentó procesar archivos binarios nativos (`.node`) como si fueran código JavaScript, causando errores de compilación.

---

## 🔧 La Solución Implementada

### Cambios Realizados:

#### 1. **Cambio de Librería de Conversión PDF**

**Antes (Problemático):**
```javascript
import { pdfToPng } from 'pdf-to-png-converter';
// Esta librería usaba @napi-rs/canvas con binarios nativos
```

**Después (Compatible):**
```javascript
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from 'canvas';
// pdfjs-dist + canvas son más compatibles con Next.js
```

#### 2. **Configuración de Next.js (`next.config.js`)**

```javascript
webpack: (config, { isServer }) => {
  if (isServer) {
    // Manejar archivos .node con node-loader
    config.module.rules.push({
      test: /\.node$/,
      use: 'node-loader',
    });
    
    // Canvas como externo (se resuelve en runtime)
    config.externals.push('canvas');
  }
  
  // Cliente: deshabilitar canvas
  if (!isServer) {
    config.resolve.alias.canvas = false;
  }
  
  return config;
}
```

#### 3. **Dependencias Actualizadas**

**Desinstalado:**
- ❌ `pdf-to-png-converter` (causaba problemas con binarios)

**Instalado:**
- ✅ `pdfjs-dist` (procesamiento de PDF)
- ✅ `canvas` (renderizado de imágenes)
- ✅ `node-loader` (manejo de archivos .node)

---

## 📊 Comparación de Enfoques

| Aspecto | `pdf-to-png-converter` | `pdfjs-dist` + `canvas` |
|---------|------------------------|-------------------------|
| **Compatibilidad Next.js** | ❌ Problemas | ✅ Compatible |
| **Binarios Nativos** | Problemáticos | Manejados correctamente |
| **Velocidad** | Rápida | Similar |
| **Estabilidad** | ⚠️ Errores de webpack | ✅ Estable |
| **Mantenimiento** | Activo | Muy activo |

---

## 🎯 ¿Por Qué Funcionó?

### 1. **Separación Cliente/Servidor**

Next.js ejecuta código en dos ambientes:
- **Cliente (Browser)**: No tiene acceso a módulos nativos de Node.js
- **Servidor (Node.js)**: Puede usar módulos nativos

La configuración asegura que `canvas` solo se use en el servidor.

### 2. **Externalización de Canvas**

```javascript
config.externals.push('canvas');
```

Esto le dice a webpack: "No intentes bundlear canvas, resuélvelo en runtime desde node_modules"

### 3. **node-loader para Archivos .node**

```javascript
config.module.rules.push({
  test: /\.node$/,
  use: 'node-loader',
});
```

Esto le dice a webpack cómo manejar archivos binarios nativos correctamente.

---

## 🧪 Verificación

Para confirmar que funciona:

```bash
npm run dev
```

**Deberías ver:**
```
✓ Ready in 2s
○ Compiling /api/upload ...
✓ Compiled /api/upload in 5s
```

**NO deberías ver:**
```
❌ Module parse failed: Unexpected character '�'
```

---

## 💡 Lecciones Aprendidas

### 1. **Entornos Híbridos**
Next.js ejecuta código en cliente Y servidor - necesitas configurar webpack para ambos.

### 2. **Módulos Nativos**
Librerías con código nativo (C++, Rust) requieren configuración especial en entornos web.

### 3. **Externalización**
Algunas librerías funcionan mejor como "externas" en lugar de bundleadas.

### 4. **Alternativas Compatibles**
Siempre busca alternativas si una librería causa problemas - `pdfjs-dist` es el estándar de facto para PDFs en web.

---

## 🔍 Debugging Future Issues

Si encuentras errores similares con otras librerías:

### Paso 1: Identifica si es un módulo nativo
```bash
# Busca archivos .node en node_modules
find node_modules -name "*.node"
```

### Paso 2: Verifica si Next.js lo está bundleando
Revisa el error - si dice "Module parse failed" con un archivo .node, es el mismo problema.

### Paso 3: Opciones de Solución

1. **Externalizar** (mejor opción):
```javascript
config.externals.push('libreria-problematica');
```

2. **Usar node-loader**:
```javascript
config.module.rules.push({
  test: /\.node$/,
  use: 'node-loader',
});
```

3. **Buscar alternativa** compatible con Next.js

4. **Usar solo en servidor** (API Routes, no en cliente)

---

## 📚 Referencias

- [Next.js Webpack Config](https://nextjs.org/docs/api-reference/next.config.js/custom-webpack-config)
- [pdfjs-dist Documentation](https://mozilla.github.io/pdf.js/)
- [Canvas Node.js](https://github.com/Automattic/node-canvas)
- [Webpack Externals](https://webpack.js.org/configuration/externals/)

---

## ✅ Checklist de Verificación

- [ ] `npm run dev` inicia sin errores
- [ ] `/api/upload` compila exitosamente
- [ ] OCR funciona con PDFs escaneados
- [ ] No hay errores "Module parse failed"
- [ ] Canvas se usa solo en servidor

**¡Problema resuelto!** 🎉

