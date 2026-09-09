import { getDbPool } from './apps/api/src/database';
import { TollMatcherService } from './apps/api/src/modules/tolls/toll-matcher.service';

async function testMatcherWithCoordinates() {
  const matcher = new TollMatcherService();
  const pool = getDbPool();

  // Probar coincidencia para Querétaro a Chihuahua directamente en DB con radio 500m
  const payload = {
    origin: { label: 'Santiago de Querétaro, Querétaro', latitude: 20.593546972, longitude: -100.391968613 },
    destination: { label: 'Chihuahua, Chihuahua', latitude: 28.632995, longitude: -106.0691 },
  };

  const res = await fetch('http://router.project-osrm.org/route/v1/driving/-100.391968613,20.593546972;-106.0691,28.632995?overview=full&geometries=geojson');
  const json: any = await res.json();
  const coords = json.routes?.[0]?.geometry?.coordinates as [number, number][];

  console.log(`Puntos OSRM Querétaro ➔ Chihuahua: ${coords.length}`);

  const events120 = await matcher.matchTollsAlongRoute(coords, { radiusMeters: 120 });
  console.log(`Casetas encontradas con radio 120m: ${events120.length}`);

  const events500 = await matcher.matchTollsAlongRoute(coords, { radiusMeters: 500 });
  console.log(`Casetas encontradas con radio 500m: ${events500.length}`);
  events500.forEach((e, i) => console.log(`   ${i + 1}. ${e.name} - $${e.price}`));

  await pool.end();
}

testMatcherWithCoordinates().catch(console.error);
