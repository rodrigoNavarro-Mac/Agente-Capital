# 🚀 Guía de Deployment - Capital Plus AI Agent

Esta guía cubre el deployment en diferentes entornos.

## 📋 Opciones de Deployment

1. **Vercel** (Recomendado para Next.js)
2. **Docker** (Self-hosted)
3. **VPS/Servidor** (Ubuntu/Linux)

---

## 🔷 Opción 1: Vercel (Más Fácil)

### Requisitos Previos
- PostgreSQL externo (Railway, Supabase, o AWS RDS)
- Pinecone con índice creado
- LM Studio **NO** funcionará (necesitas hosting local separado)

### Pasos

#### 1. Preparar el Proyecto

```bash
# Build local para verificar
npm run build

# Debería compilar sin errores
```

#### 2. Deploy a Vercel

```bash
# Instalar Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel
```

#### 3. Configurar Variables de Entorno en Vercel

En Vercel Dashboard → Settings → Environment Variables:

```
POSTGRES_HOST=tu-host.railway.app
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=***
POSTGRES_DB=railway

PINECONE_API_KEY=***
PINECONE_INDEX_NAME=capital-plus-docs

# Para LM Studio en servidor separado
LMSTUDIO_BASE_URL=https://tu-lm-studio-server.com/v1
```

#### 4. Deploy Migraciones

```bash
# Ejecutar migraciones en DB remota
DATABASE_URL="postgresql://user:pass@host:5432/db" npm run db:migrate -- reset
```

### Limitaciones en Vercel
- ❌ LM Studio debe estar en servidor separado
- ❌ Max 50MB para archivos (límite de Vercel)
- ✅ Frontend funciona perfecto
- ✅ APIs funcionan (excepto LM Studio si es local)

---

## 🐳 Opción 2: Docker (Recomendado para Self-Hosting)

### Requisitos
- Docker y Docker Compose instalados
- LM Studio en host o contenedor separado

### Pasos

#### 1. Crear Dockerfile

```dockerfile
# Crear archivo: Dockerfile
FROM node:18-alpine AS base

# Dependencias
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]
```

#### 2. Actualizar docker-compose.yml

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: capital_user
      POSTGRES_PASSWORD: capital_pass
      POSTGRES_DB: capital_plus_agent
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - POSTGRES_HOST=postgres
      - POSTGRES_PORT=5432
      - POSTGRES_USER=capital_user
      - POSTGRES_PASSWORD=capital_pass
      - POSTGRES_DB=capital_plus_agent
      - PINECONE_API_KEY=${PINECONE_API_KEY}
      - PINECONE_INDEX_NAME=capital-plus-docs
      - LMSTUDIO_BASE_URL=http://host.docker.internal:1234/v1
    depends_on:
      - postgres

volumes:
  postgres_data:
```

#### 3. Build y Run

```bash
# Build
docker-compose build

# Run
docker-compose up -d

# Ver logs
docker-compose logs -f app

# Ejecutar migraciones
docker-compose exec app npm run db:migrate -- reset
```

#### 4. Acceder

- App: `http://localhost:3000`
- PostgreSQL: `localhost:5432`

---

## 🖥️ Opción 3: VPS/Servidor Ubuntu

### Requisitos
- Ubuntu 22.04 o superior
- 4GB RAM mínimo
- Node.js 18+
- PostgreSQL 14+
- Nginx

### Pasos

#### 1. Preparar Servidor

```bash
# Conectar vía SSH
ssh user@tu-servidor.com

# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependencias
sudo apt install -y nginx postgresql postgresql-contrib nodejs npm git

# Verificar versiones
node --version  # v18+
psql --version  # 14+
```

#### 2. Configurar PostgreSQL

```bash
# Crear usuario y base de datos
sudo -u postgres psql

postgres=# CREATE USER capital_user WITH PASSWORD 'secure_password';
postgres=# CREATE DATABASE capital_plus_agent OWNER capital_user;
postgres=# GRANT ALL PRIVILEGES ON DATABASE capital_plus_agent TO capital_user;
postgres=# \q
```

#### 3. Clonar y Configurar Proyecto

```bash
# Crear directorio
cd /var/www/
sudo git clone <tu-repo> capital-plus-agent
cd capital-plus-agent

# Instalar dependencias
sudo npm install

# Crear .env
sudo nano .env
# Pegar configuración

# Ejecutar migraciones
sudo npm run db:migrate -- reset

# Build
sudo npm run build
```

#### 4. Configurar PM2 (Process Manager)

```bash
# Instalar PM2
sudo npm install -g pm2

# Iniciar app
pm2 start npm --name "capital-agent" -- start

# Auto-start en boot
pm2 startup
pm2 save

# Ver logs
pm2 logs capital-agent
```

#### 5. Configurar Nginx

```bash
sudo nano /etc/nginx/sites-available/capital-agent
```

Contenido:

```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Activar:

```bash
sudo ln -s /etc/nginx/sites-available/capital-agent /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 6. Configurar SSL (Opcional pero Recomendado)

```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx

# Obtener certificado
sudo certbot --nginx -d tu-dominio.com

# Auto-renewal
sudo certbot renew --dry-run
```

#### 7. Configurar LM Studio

En el mismo servidor:

```bash
# Descargar LM Studio para Linux
# Ver: https://lmstudio.ai/

# Ejecutar en modo headless
lmstudio server start --port 1234 --model llama-3.2-3B-Instruct-Q4_K_M
```

O usar PM2:

```bash
pm2 start "lmstudio server start --port 1234" --name lm-studio
pm2 save
```

---

## 🔐 Seguridad en Producción

### Checklist

- [ ] Cambiar todas las contraseñas por defecto
- [ ] Usar HTTPS/SSL
- [ ] Configurar firewall (UFW)
- [ ] Limitar acceso a PostgreSQL
- [ ] Rate limiting en APIs
- [ ] Backups automáticos
- [ ] Logs centralizados
- [ ] Monitoring (Uptime, Performance)

### Configurar Firewall

```bash
# Habilitar UFW
sudo ufw enable

# Permitir SSH
sudo ufw allow 22/tcp

# Permitir HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Verificar
sudo ufw status
```

### Backups Automáticos

```bash
# Crear script de backup
sudo nano /usr/local/bin/backup-capital.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/capital-agent"
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
pg_dump -U capital_user capital_plus_agent > $BACKUP_DIR/db_$DATE.sql

# Backup uploads
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz /var/www/capital-plus-agent/tmp

# Limpiar backups viejos (más de 7 días)
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
```

```bash
# Hacer ejecutable
sudo chmod +x /usr/local/bin/backup-capital.sh

# Agregar a cron (diario a las 2am)
sudo crontab -e
0 2 * * * /usr/local/bin/backup-capital.sh
```

---

## 📊 Monitoring

### PM2 Monitoring

```bash
# Dashboard web
pm2 plus

# Métricas básicas
pm2 monit

# Logs
pm2 logs
```

### Logs

```bash
# Logs de Next.js
pm2 logs capital-agent

# Logs de PostgreSQL
sudo tail -f /var/log/postgresql/postgresql-14-main.log

# Logs de Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## 🆘 Troubleshooting Producción

### App no inicia

```bash
# Verificar logs
pm2 logs capital-agent --lines 100

# Verificar puerto
sudo lsof -i :3000

# Reiniciar
pm2 restart capital-agent
```

### PostgreSQL no conecta

```bash
# Verificar servicio
sudo systemctl status postgresql

# Reiniciar
sudo systemctl restart postgresql

# Verificar conexión
psql -U capital_user -d capital_plus_agent -h localhost
```

### LM Studio no responde

```bash
# Verificar proceso
pm2 status lm-studio

# Verificar endpoint
curl http://localhost:1234/v1/models

# Reiniciar
pm2 restart lm-studio
```

---

## 📈 Escalabilidad

Para manejar más carga:

1. **Load Balancer** - Nginx con múltiples instancias
2. **Redis** - Cache de consultas frecuentes
3. **CDN** - CloudFlare para assets estáticos
4. **Database Replica** - PostgreSQL read replicas
5. **Queue System** - Bull/BullMQ para procesar uploads

---

## 🎯 Checklist Final

- [ ] App corriendo en producción
- [ ] PostgreSQL backups configurados
- [ ] SSL/HTTPS activo
- [ ] Firewall configurado
- [ ] LM Studio funcionando
- [ ] Monitoring activo
- [ ] Logs centralizados
- [ ] Dominio configurado
- [ ] PM2 auto-restart habilitado
- [ ] Documentación actualizada

---

**Capital Plus** © 2024 - Deployment Guide

