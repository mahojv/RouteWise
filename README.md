# RouteWise

## Smart Toll & Route Optimizer (México)

> "¿Cuál es la combinación de autopista y carretera libre que me ofrece el mejor balance entre tiempo y dinero?"

RouteWise es un optimizador inteligente de viajes por carretera para México que calcula y compara rutas considerando autopistas de cuota, carreteras libres, costo de casetas (CAPUFE/FONADIN), combustible, distancia y el valor estimado de tu tiempo.

---

## 🏛️ Arquitectura del Monorepo

```text
RouteWise/
├── apps/
│   ├── api/                  # Fastify + TypeScript + Drizzle + PostGIS + Pino
│   │   ├── src/
│   │   │   ├── config/       # Variables de entorno y configuraciones tipadas
│   │   │   ├── database/     # Esquemas Drizzle, migraciones PostGIS y seed
│   │   │   ├── modules/
│   │   │   │   ├── health/   # GET /health y GET /api/v1/health con telemetría de servicios
│   │   │   │   ├── routing/  # RouteOptimizationService (scoring híbrido y explainability)
│   │   │   │   ├── tolls/    # Gestión de casetas y matching geoespacial
│   │   │   │   ├── vehicles/ # Catálogo de vehículos y consumos
│   │   │   │   └── geocoding/# Búsqueda Nominatim con caché y rate limiting
│   │   │   └── server.ts     # Fastify app builder (Helmet, CORS, Rate Limit)
│   │   └── Dockerfile
│   └── mobile/               # React Native + Expo + Expo Router + MapLibre + Zustand
│       ├── app/              # Pantallas (Home, Comparativa de Rutas)
│       └── src/              # Componentes UI Dark-First, estado Zustand y API client
│
├── packages/
│   ├── types/                # @routewise/types (DTOs y modelos de dominio compartidos)
│   ├── validation/           # @routewise/validation (Esquemas Zod para request/responses)
│   ├── routing/              # @routewise/routing (Abstracción de OSRM, ORS y Mocks)
│   └── config/               # @routewise/config (Fórmulas de combustible, pesos y colores)
│
├── docker/
│   └── osrm/                 # Scripts para descarga y preprocesamiento de datos OSM de México
├── docker-compose.dev.yml    # PostgreSQL + PostGIS y OSRM para desarrollo local
├── docker-compose.yml        # Orquestación lista para producción
└── package.json              # Monorepo con npm workspaces
```

---

## 🚀 Inicio Rápido (Desarrollo Local)

### 1. Prerrequisitos
- **Node.js**: v20 o superior
- **Docker & Docker Compose**: (Para PostGIS y OSRM)

### 2. Instalación de dependencias
```bash
npm install
```

### 3. Levantar servicios de desarrollo (PostgreSQL + PostGIS)
```bash
npm run docker:dev
```

### 4. Ejecutar migraciones y datos iniciales de casetas mexicanas
```bash
npm run db:migrate
npm run db:seed
```

### 5. Iniciar el API de Fastify (con Hot Reload)
```bash
npm run dev:api
```
El servidor estará disponible en `http://localhost:3000`.
- Health Check: `http://localhost:3000/health`
- Health Check API v1: `http://localhost:3000/api/v1/health`
- Listar casetas: `http://localhost:3000/api/v1/tolls`
- Listar vehículos: `http://localhost:3000/api/v1/vehicles`

### 6. Iniciar la App Móvil (Expo)
```bash
npm run dev:mobile
```

---

## 🧪 Ejecución de Pruebas Unitarias y de Integración

El monorepo cuenta con suites de pruebas usando **Vitest** sin dependencias externas:

```bash
# Ejecutar todas las pruebas del monorepo
npm run test
```

Casos probados:
- Abstracción e inmutabilidad de la interfaz `RoutingProvider`.
- Cálculo de costos directos (combustible + casetas) y costos generalizados con valor del tiempo.
- Validación de coordenadas y esquemas de entrada con Zod.
- Endpoints de salud y cálculo de rutas en Fastify con explicabilidad contextual.

---

## 🐳 Despliegue en Producción con Docker

Para levantar toda la arquitectura en contenedores (`routewise-api`, `routewise-postgres`, `routewise-osrm`):

```bash
docker compose up -d --build
```

---

## 🗺️ Proveedores de Datos y Routing

1. **Routing:**
   - **OSRM** (Instancia local auto-hospedada con datos OSM).
   - **ORS** (OpenRouteService como adapter alternativo).
   - **Mock** (Para entornos de testing offline o CI/CD).
2. **Casetas:**
   - Base de datos PostGIS propia (`toll_plazas`) con tarifas oficiales de México (CAPUFE/FONADIN) y matching espacial por proximidad de coordenadas.
3. **Geocoding:**
   - Nominatim / OpenStreetMap con rate limiting estricto (1 req/s) y caché en memoria para proteger el servicio.
4. **Mapas:**
   - **MapLibre React Native** con fuentes de tiles basadas en OpenStreetMap.
