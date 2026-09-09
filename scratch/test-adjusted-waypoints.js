const { getCumulativeDistanceToPoint } = require('../apps/api/dist/modules/tolls/toll-bypass-resolver.service');
const { routePassesThroughWaypoints } = require('../apps/api/dist/modules/routing/route-optimizer.service');
const { TollMatcherService } = require('../apps/api/dist/modules/tolls/toll-matcher.service');
const { TollCostService } = require('../apps/api/dist/modules/tolls/toll-cost.service');

async function testAdjustedWaypoints() {
  const OSRM_URL = 'http://localhost:5005';
  const qro = { lat: 20.5888, lng: -100.3899 };
  const cdmx = { lat: 19.4326, lng: -99.1332 };

  const bpPalmillas = [
    { latitude: 20.3742, longitude: -99.6521 },
    { latitude: 20.2450, longitude: -99.5850 }
  ];

  const bpTepotzotlan = [
    { latitude: 19.8550, longitude: -99.2880 },
    { latitude: 19.7480, longitude: -99.1650 }
  ];

  const matcher = new TollMatcherService(new TollCostService());

  console.log('--- HYBRID 1 (Palmillas) ---');
  const urlHyb1 = `${OSRM_URL}/route/v1/driving/${qro.lng},${qro.lat};${bpPalmillas[0].longitude},${bpPalmillas[0].latitude};${bpPalmillas[1].longitude},${bpPalmillas[1].latitude};${cdmx.lng},${cdmx.lat}?overview=full&geometries=geojson&steps=true`;
  const hyb1Raw = await fetch(urlHyb1).then(r => r.json()).then(r => r.routes[0]);
  console.log('Passes 200m:', routePassesThroughWaypoints(hyb1Raw.geometry.coordinates, bpPalmillas, 200));
  const tolls1 = await matcher.matchTollsAlongRoute(hyb1Raw.geometry.coordinates, { radiusMeters: 250, vehicleType: 'automovil' });
  console.log('Tolls matched:', tolls1.map(t => t.name));

  console.log('\n--- HYBRID 2 (Tepotzotlán) ---');
  const urlHyb2 = `${OSRM_URL}/route/v1/driving/${qro.lng},${qro.lat};${bpTepotzotlan[0].longitude},${bpTepotzotlan[0].latitude};${bpTepotzotlan[1].longitude},${bpTepotzotlan[1].latitude};${cdmx.lng},${cdmx.lat}?overview=full&geometries=geojson&steps=true`;
  const hyb2Raw = await fetch(urlHyb2).then(r => r.json()).then(r => r.routes[0]);
  console.log('Passes 200m:', routePassesThroughWaypoints(hyb2Raw.geometry.coordinates, bpTepotzotlan, 200));
  const tolls2 = await matcher.matchTollsAlongRoute(hyb2Raw.geometry.coordinates, { radiusMeters: 250, vehicleType: 'automovil' });
  console.log('Tolls matched:', tolls2.map(t => t.name));

  console.log('\n--- COMBINED ---');
  const bpCombined = [
    bpPalmillas[0], bpPalmillas[1],
    bpTepotzotlan[0], bpTepotzotlan[1]
  ];
  const urlComb = `${OSRM_URL}/route/v1/driving/${qro.lng},${qro.lat};${bpCombined[0].longitude},${bpCombined[0].latitude};${bpCombined[1].longitude},${bpCombined[1].latitude};${bpCombined[2].longitude},${bpCombined[2].latitude};${bpCombined[3].longitude},${bpCombined[3].latitude};${cdmx.lng},${cdmx.lat}?overview=full&geometries=geojson&steps=true`;
  const combRaw = await fetch(urlComb).then(r => r.json()).then(r => r.routes[0]);
  console.log('Passes 200m:', routePassesThroughWaypoints(combRaw.geometry.coordinates, bpCombined, 200));
  const tollsComb = await matcher.matchTollsAlongRoute(combRaw.geometry.coordinates, { radiusMeters: 250, vehicleType: 'automovil' });
  console.log('Tolls matched:', tollsComb.map(t => t.name));
}

testAdjustedWaypoints().catch(console.error);
