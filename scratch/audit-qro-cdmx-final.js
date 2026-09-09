const { RouteOptimizationService } = require('../apps/api/dist/modules/routing/route-optimizer.service');
const { getDbPool } = require('../apps/api/dist/database/index');

async function runAudit() {
  console.log('=== AUDITORÍA FINAL ROUTEWISE: QUERÉTARO -> CDMX ===\n');

  const pool = getDbPool();
  const dbBypasses = await pool.query(`
    SELECT
      b.id,
      b.toll_plaza_id,
      tp.name AS plaza_name,
      b.exit_lat, b.exit_lng, b.reentry_lat, b.reentry_lng,
      b.confidence,
      b.is_verified
    FROM toll_bypasses b
    JOIN toll_plazas tp ON tp.id = b.toll_plaza_id;
  `);

  console.log('--- BYPASSES ALMACENADOS EN DB ---');
  console.table(dbBypasses.rows.map(r => ({
    id: r.id,
    plaza: r.plaza_name.split(' (')[0],
    exit_point: `[${r.exit_lng}, ${r.exit_lat}]`,
    reentry_point: `[${r.reentry_lng}, ${r.reentry_lat}]`,
    confidence: r.confidence,
    verified: r.is_verified
  })));

  const service = new RouteOptimizationService();

  const req = {
    origin: { latitude: 20.5888, longitude: -100.3899, label: 'Querétaro, Qro.' },
    destination: { latitude: 19.4326, longitude: -99.1332, label: 'Ciudad de México, CDMX' },
    vehicle: { vehicleType: 'automovil', fuelConsumption: 14.5, fuelPrice: 24.5 },
    preferences: { mode: 'BALANCED', timeValue: 100 }
  };

  console.log('\n--- EJECUTANDO OPTIMIZADOR DE RUTAS ---');
  const startTime = Date.now();
  const res = await service.optimizeRoute(req);
  const durationMs = Date.now() - startTime;

  console.log(`\nRespuesta generada en ${durationMs}ms: ${res.routes.length} opciones devueltas.\n`);

  for (const r of res.routes) {
    console.log(`==================================================`);
    console.log(`ID: ${r.id} | Tipo: ${r.type} | Título: ${r.title}`);
    console.log(`Distancia: ${(r.distanceMeters / 1000).toFixed(2)} km`);
    console.log(`Duración: ${(r.durationSeconds / 60).toFixed(1)} min (${(r.durationSeconds / 3600).toFixed(2)} hrs)`);
    console.log(`Costo Casetas: $${r.tollCost} MXN (${r.tolls.length} casetas)`);
    console.log(`Costo Gasolina: $${r.fuelCost} MXN`);
    console.log(`Costo Directo Total: $${r.totalCost} MXN`);
    console.log(`Costo Generalizado: $${r.cost.generalized} MXN`);
    console.log(`Casetas Detectadas:`);
    if (r.tolls.length === 0) {
      console.log(`  (Ninguna - Ruta 100% Libre)`);
    } else {
      r.tolls.forEach(t => {
        console.log(`  - ${t.name} ($${t.price} MXN) | Distancia a ruta: ${t.distanceToRouteMeters?.toFixed(1)}m`);
      });
    }
  }

  process.exit(0);
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
