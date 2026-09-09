# Guía de Despliegue de RouteWise (Producción Self-Hosted)

Esta guía documenta la preparación y los pasos para desplegar **RouteWise** en un servidor doméstico (procesador **Intel Celeron J1900**) y exponer la API a Internet mediante **Cloudflare Tunnel** de forma segura.

---

## 1. Requisitos del Servidor J1900

* **CPU**: Intel Celeron J1900 (4 núcleos / 4 hilos @ 2.0 GHz - 2.42 GHz).
* **RAM**: Mínimo 4 GB (el stack completo en ejecución consume ~1.8 GB - 2.1 GB RAM).
* **Almacenamiento**: SSD de al menos 20 GB de espacio libre (para base de datos PostgreSQL/PostGIS y archivos de mapas OSRM).
* **Sistema Operativo**: Linux (Debian 12, Ubuntu Server 22.04 LTS o Alpine Linux) con Docker Engine y Docker Compose v2+.

---

## 2. Estructura Esperada de `docker/osrm/data`

Dado que el procesador J1900 tiene recursos limitados de CPU y memoria, **los archivos de mapa de México deben extraerse y procesarse previamente en tu equipo de desarrollo** y copiarse al servidor.

La carpeta `./docker/osrm/data/` en el servidor debe contener la siguiente estructura de archivos procesados:

```text
docker/osrm/data/
├── mexico-latest.osrm
├── mexico-latest.osrm.cells
├── mexico-latest.osrm.ebg_nodes
├── mexico-latest.osrm.edges
├── mexico-latest.osrm.fileIndex
├── mexico-latest.osrm.geometry
├── mexico-latest.osrm.datasource_names
├── mexico-latest.osrm.icd
├── mexico-latest.osrm.maneuver_overrides
├── mexico-latest.osrm.names
├── mexico-latest.osrm.nbg_nodes
├── mexico-latest.osrm.partition
├── mexico-latest.osrm.properties
├── mexico-latest.osrm.ramIndex
├── mexico-latest.osrm.restrictions
├── mexico-latest.osrm.timestamp
└── mexico-latest.osrm.tls
```

---

## 3. Variables de Entorno de Producción (`.env`)

Crea un archivo `.env` en la raíz del proyecto en el servidor con los siguientes datos (cambiando contraseñas por valores seguros):

```env
# Servidor
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
CORS_ORIGIN=*

# PostgreSQL + PostGIS (Usar contraseña fuerte)
POSTGRES_USER=routewise
POSTGRES_PASSWORD=CAMBIAR_POR_PASSWORD_SEGURO
POSTGRES_DB=routewise
DATABASE_URL=postgresql://routewise:CAMBIAR_POR_PASSWORD_SEGURO@postgres:5432/routewise

# Enrutamiento OSRM (Nombre de contenedor interno en Docker)
ROUTING_PROVIDER=osrm
OSRM_URL=http://osrm:5000

# INEGI Sakbe API
INEGI_SAKBE_API_KEY=kqvCNH1V-keUF-rSVa-O1tf-gdqFN6DynMNN

# Caching y Rate Limit
CACHE_ENABLED=true
CACHE_TTL_SECONDS=3600
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000
```

---

## 4. Cómo Copiar el Proyecto al Servidor

Puedes clonar el repositorio o copiar el directorio mediante `rsync` o `scp`:

```bash
# Ejemplo usando rsync desde tu equipo de desarrollo hacia el servidor local:
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'dist' ./ usuario@192.168.1.X:/home/usuario/RouteWise/
```

---

## 5. Cómo Levantar el Stack

En el servidor doméstico, navega al directorio del proyecto y ejecuta Docker Compose:

```bash
cd /home/usuario/RouteWise
docker compose up -d --build
```

---

## 6. Ejecutar Migraciones de Base de Datos

Una vez que los contenedores estén corriendo y saludables, ejecuta la migración de esquemas de base de datos:

```bash
docker compose exec api npm run db:migrate
```

---

## 7. Ejecutar Sembrado de Casetas e Información Base (Seed)

Poblar la base de datos con las casetas preconfiguradas y la sincronización INEGI:

```bash
docker compose exec api npm run db:seed
```

---

## 8. Comprobar la Salud del Sistema (Health Check)

Valida que la API y sus dependencias (PostgreSQL y OSRM) respondan correctamente en la interfaz local del servidor:

```bash
curl -i http://127.0.0.1:3000/health
```

Debe retornar HTTP `200 OK` con un cuerpo JSON similar a:
```json
{
  "status": "ok",
  "timestamp": "2026-09-09T00:00:00.000Z",
  "services": {
    "database": "up",
    "osrm": "up"
  }
}
```

---

## 9. Cómo Revisar Logs

Para monitorear el estado y las solicitudes de la API o la base de datos:

```bash
# Ver logs de todos los servicios
docker compose logs -f

# Ver logs de un servicio específico
docker compose logs -f api
docker compose logs -f osrm
docker compose logs -f postgres
```

---

## 10. Puertos Accesibles en el Host

* **`127.0.0.1:3000`**: Escucha únicamente en la interfaz de bucle de retorno local (*loopback*) del host. Solo accesible por procesos del propio servidor (como Cloudflare Tunnel o cURL local). **NO está expuesto a la LAN ni a Internet**.
* **PostgreSQL (`5432`)**: **NO expuesto al host**. Comunicación exclusiva a través de la red interna Docker `routewise-network`.
* **OSRM (`5000`)**: **NO expuesto al host**. Comunicación exclusiva a través de la red interna Docker `routewise-network`.

---

## 11. Preparación para Cloudflare Tunnel

Para conectar la API con Internet sin abrir puertos en el módem/router:

1. Instala `cloudflared` en el servidor J1900 o corre el contenedor de Cloudflare.
2. Autentica `cloudflared` con tu cuenta de Cloudflare:
   ```bash
   cloudflared tunnel login
   ```
3. Crea un túnel para RouteWise:
   ```bash
   cloudflared tunnel create routewise-tunnel
   ```
4. Configura el archivo `config.yml` del túnel:
   ```yaml
   tunnel: <TUNNEL_UUID>
   credentials-file: /root/.cloudflared/<TUNNEL_UUID>.json

   ingress:
     - hostname: api.tudominio.com
       service: http://127.0.0.1:3000
     - service: http_status:444
   ```
5. Inicia el túnel como servicio del sistema:
   ```bash
   cloudflared tunnel run routewise-tunnel
   ```

Una vez activo, configura `EXPO_PUBLIC_API_URL=https://api.tudominio.com` en el `.env` de tu app móvil.
