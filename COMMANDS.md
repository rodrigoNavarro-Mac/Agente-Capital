# 🎯 Comandos Útiles - Capital Plus AI Agent

Referencia rápida de comandos para desarrollo y mantenimiento.

## 📦 NPM Scripts

```bash
# Desarrollo
npm run dev              # Iniciar servidor dev (puerto 3000)
npm run build            # Build de producción
npm run start            # Servidor de producción
npm run lint             # Ejecutar linter

# Database
npm run db:migrate       # Ejecutar migraciones
npm run db:migrate -- reset  # Reset completo de DB
npm run db:seed          # Insertar datos de prueba
```

## 🗄️ PostgreSQL

### Conexión

```bash
# Conectar a DB
psql -U capital_user -d capital_plus_agent

# Con Docker
docker exec -it capital-postgres psql -U capital_user -d capital_plus_agent
```

### Queries Útiles

```sql
-- Ver todas las tablas
\dt

-- Describir tabla
\d users

-- Ver usuarios
SELECT id, name, email FROM users;

-- Ver roles y permisos
SELECT r.name as role, p.name as permission
FROM roles r
JOIN role_permissions rp ON r.id = rp.role_id
JOIN permissions p ON rp.permission_id = p.id
ORDER BY r.name, p.name;

-- Ver documentos recientes
SELECT filename, zone, development, type, created_at
FROM documents_meta
ORDER BY created_at DESC
LIMIT 10;

-- Ver logs recientes
SELECT user_id, query, zone, development, created_at
FROM query_logs
ORDER BY created_at DESC
LIMIT 10;

-- Estadísticas de uploads
SELECT zone, development, COUNT(*) as docs
FROM documents_meta
GROUP BY zone, development
ORDER BY docs DESC;

-- Estadísticas de queries
SELECT zone, development, COUNT(*) as queries
FROM query_logs
GROUP BY zone, development
ORDER BY queries DESC;

-- Limpiar logs viejos (más de 30 días)
DELETE FROM query_logs
WHERE created_at < NOW() - INTERVAL '30 days';
```

### Backup y Restore

```bash
# Backup
pg_dump -U capital_user capital_plus_agent > backup_$(date +%Y%m%d).sql

# Restore
psql -U capital_user capital_plus_agent < backup_20241203.sql

# Backup con Docker
docker exec capital-postgres pg_dump -U capital_user capital_plus_agent > backup.sql
```

## 🐳 Docker

```bash
# Iniciar servicios
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener servicios
docker-compose down

# Rebuild
docker-compose build --no-cache
docker-compose up -d

# Ver contenedores corriendo
docker ps

# Entrar a contenedor
docker exec -it capital-postgres bash
docker exec -it capital-agent bash

# Limpiar todo
docker-compose down -v
docker system prune -a
```

## 🔍 Debug

### Ver Logs

```bash
# Next.js logs
npm run dev  # Ver en terminal

# PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log

# Con Docker
docker-compose logs -f postgres
docker-compose logs -f app

# PM2 logs (producción)
pm2 logs capital-agent
pm2 logs capital-agent --lines 100
```

### Test Endpoints

```bash
# Health check
curl http://localhost:3000/api/rag-query

# Get developments
curl http://localhost:3000/api/developments | jq

# Get config
curl http://localhost:3000/api/agent-config | jq

# Get documents
curl "http://localhost:3000/api/documents?zone=yucatan" | jq

# Get logs
curl "http://localhost:3000/api/logs?limit=5" | jq

# Test LM Studio
curl http://localhost:1234/v1/models

# Upload test (multipart form)
curl -X POST http://localhost:3000/api/upload \
  -F "file=@test.pdf" \
  -F "zone=yucatan" \
  -F "development=amura" \
  -F "type=brochure" \
  -F "uploaded_by=1"
```

## 🔧 Git

```bash
# Crear rama feature
git checkout -b feature/nombre-feature

# Commit con mensaje
git add .
git commit -m "feat: descripción del cambio"

# Push
git push origin feature/nombre-feature

# Ver cambios
git status
git diff

# Ver log
git log --oneline --graph --all

# Revert cambios
git checkout -- archivo.ts
git reset --hard HEAD

# Actualizar desde main
git checkout main
git pull origin main
git checkout feature/nombre-feature
git merge main
```

## 🚀 Deployment

### Vercel

```bash
# Login
vercel login

# Deploy preview
vercel

# Deploy producción
vercel --prod

# Ver logs
vercel logs capital-plus-agent

# Environment variables
vercel env add POSTGRES_HOST
```

### PM2 (Servidor)

```bash
# Iniciar app
pm2 start npm --name "capital-agent" -- start

# Ver status
pm2 status

# Reiniciar
pm2 restart capital-agent

# Detener
pm2 stop capital-agent

# Eliminar
pm2 delete capital-agent

# Ver logs
pm2 logs capital-agent

# Monitoreo
pm2 monit

# Guardar configuración
pm2 save

# Auto-start en boot
pm2 startup
```

## 🛠️ Troubleshooting

### Reset Completo

```bash
# 1. Limpiar node_modules
rm -rf node_modules package-lock.json
npm install

# 2. Limpiar Next.js
rm -rf .next
npm run build

# 3. Reset database
npm run db:migrate -- reset
npm run db:seed

# 4. Limpiar uploads
rm -rf tmp/*

# 5. Reiniciar dev server
npm run dev
```

### Fix de Problemas Comunes

```bash
# Puerto 3000 ocupado
lsof -ti:3000 | xargs kill -9

# PostgreSQL no conecta
sudo service postgresql restart
sudo systemctl status postgresql

# Permisos de archivos
sudo chown -R $USER:$USER .
chmod -R 755 .

# Cache de npm corrupto
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

## 📊 Monitoring

### Ver uso de recursos

```bash
# CPU y memoria
htop

# Espacio en disco
df -h

# Procesos de Node
ps aux | grep node

# Conexiones a PostgreSQL
sudo netstat -tulpn | grep 5432

# Conexiones activas
SELECT count(*) FROM pg_stat_activity;
```

### Performance

```bash
# Next.js build analysis
npm run build
# Ver reporte en terminal

# Bundle analyzer
npm install -g webpack-bundle-analyzer
# Agregar en next.config.js

# PostgreSQL slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

## 🔐 Seguridad

```bash
# Escanear vulnerabilidades
npm audit

# Fix automático
npm audit fix

# Ver dependencias
npm list --depth=0

# Actualizar dependencias
npm update

# Verificar env vars
cat .env | grep -v "^#" | grep -v "^$"

# Generar password seguro
openssl rand -base64 32
```

## 📝 Código

### Linter

```bash
# Ejecutar ESLint
npm run lint

# Fix automático
npm run lint -- --fix

# Verificar archivo específico
npx eslint src/app/page.tsx

# Prettier
npx prettier --write "**/*.{ts,tsx,js,jsx}"
```

### TypeScript

```bash
# Verificar tipos
npx tsc --noEmit

# Ver versión
npx tsc --version

# Watch mode
npx tsc --watch
```

## 🎯 Atajos VS Code

```
# Terminal
Ctrl + `      - Abrir/cerrar terminal
Ctrl + Shift + ` - Nueva terminal

# Navegación
Ctrl + P      - Quick open file
Ctrl + Shift + F - Buscar en proyecto
Ctrl + D      - Select next occurrence

# Refactor
F2            - Rename symbol
Ctrl + .      - Quick fix

# Debug
F5            - Start debugging
F9            - Toggle breakpoint
```

## 📚 Referencias Rápidas

```bash
# Ver versiones instaladas
node --version
npm --version
psql --version
docker --version

# IP del servidor
curl ifconfig.me

# Test de velocidad
speedtest-cli

# Ver uso de puertos
sudo netstat -tulpn

# Matar proceso por puerto
kill -9 $(lsof -t -i:3000)
```

---

## 🆘 Help

Para más información:

- README.md - Documentación general
- SETUP.md - Guía de instalación
- DEPLOYMENT.md - Guía de deployment
- CONTRIBUTING.md - Guía de contribución

---

**Capital Plus** © 2024 - Quick Reference Guide

