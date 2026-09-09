async function testFreeAnchor() {
  const OSRM_URL = 'http://localhost:5005';
  const qro = { lat: 20.5888, lng: -100.3899 };
  const cdmx = { lat: 19.4326, lng: -99.1332 };

  // Anchor 1: Huichapan
  const huichapan = { lat: 20.3742, lng: -99.6521 };
  // Anchor 2: Jorobas
  const jorobas = { lat: 19.8550, lng: -99.2880 };
  // Anchor 3: Teoloyucan / Cuautitlán
  const cuautitlan = { lat: 19.7450, lng: -99.1650 };

  const { TollMatcherService } = require('../apps/api/dist/modules/tolls/toll-matcher.service');
  const { TollCostService } = require('../apps/api/dist/modules/tolls/toll-cost.service');
  const matcher = new TollMatcherService(new TollCostService());

  console.log('\nTesting anchors: Huichapan + Cuautitlán...');
  const url3 = `${OSRM_URL}/route/v1/driving/${qro.lng},${qro.lat};${huichapan.lng},${huichapan.lat};${cuautitlan.lng},${cuautitlan.lat};${cdmx.lng},${cdmx.lat}?overview=full&geometries=geojson&steps=true`;
  const res3 = await fetch(url3).then(r => r.json());
  const route3 = res3.routes[0];
  console.log('Route 3 dist:', (route3.distance/1000).toFixed(2), 'km, dur:', (route3.duration/60).toFixed(1), 'min');

  const tolls3 = await matcher.matchTollsAlongRoute(route3.geometry.coordinates, { radiusMeters: 120, vehicleType: 'automovil' });
  console.log('Tolls detected with (Huichapan + Cuautitlán):', tolls3.map(t => t.name));
}

testFreeAnchor().catch(console.error);
