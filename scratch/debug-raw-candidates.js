const { RouteOptimizationService } = require('../apps/api/dist/modules/routing/route-optimizer.service');
const { TollMatcherService } = require('../apps/api/dist/modules/tolls/toll-matcher.service');
const { TollCostService } = require('../apps/api/dist/modules/tolls/toll-cost.service');

async function debugRawCandidates() {
  const service = new RouteOptimizationService();
  const req = {
    origin: { latitude: 20.5888, longitude: -100.3899, label: 'Querétaro, Qro.' },
    destination: { latitude: 19.4326, longitude: -99.1332, label: 'Ciudad de México, CDMX' },
    vehicle: { vehicleType: 'automovil', fuelConsumption: 14.5, fuelPrice: 24.5 },
    preferences: { mode: 'BALANCED', timeValue: 100 }
  };

  // We temporarily hook or inspect raw candidates by calculating each manually
  const OSRM_URL = 'http://localhost:5005';
  const qro = req.origin;
  const cdmx = req.destination;
  const matcher = new TollMatcherService(new TollCostService());

  console.log('--- CALL 1: FAST BASE ---');
  const urlFast = `${OSRM_URL}/route/v1/driving/${qro.longitude},${qro.latitude};${cdmx.longitude},${cdmx.latitude}?overview=full&geometries=geojson&steps=true&alternatives=3`;
  const resFast = await fetch(urlFast).then(r => r.json());
  const fastRaw = resFast.routes[0];
  console.log('Fast dist:', (fastRaw.distance/1000).toFixed(2), 'km, dur:', (fastRaw.duration/60).toFixed(1), 'min');

  const fastTolls = await matcher.matchTollsAlongRoute(fastRaw.geometry.coordinates, { radiusMeters: 250, vehicleType: 'automovil' });
  console.log('Fast Tolls:', fastTolls.map(t => t.name));

  console.log('\n--- CALL 2: FREE BASE (Anchors Huichapan + Teoloyucan) ---');
  const anchors = [
    { latitude: 20.3742, longitude: -99.6521 },
    { latitude: 19.7450, longitude: -99.1650 }
  ];
  const urlFree = `${OSRM_URL}/route/v1/driving/${qro.longitude},${qro.latitude};${anchors[0].longitude},${anchors[0].latitude};${anchors[1].longitude},${anchors[1].latitude};${cdmx.longitude},${cdmx.latitude}?overview=full&geometries=geojson&steps=true`;
  const resFree = await fetch(urlFree).then(r => r.json());
  const freeRaw = resFree.routes[0];
  console.log('Free dist:', (freeRaw.distance/1000).toFixed(2), 'km, dur:', (freeRaw.duration/60).toFixed(1), 'min');
  const freeTolls = await matcher.matchTollsAlongRoute(freeRaw.geometry.coordinates, { radiusMeters: 250, vehicleType: 'automovil' });
  console.log('Free Tolls:', freeTolls.map(t => t.name));

  console.log('\n--- CALL 3: HYBRID Palmillas ---');
  const bpPalmillas = [
    { latitude: 20.3742, longitude: -99.6521 },
    { latitude: 20.2450, longitude: -99.5850 }
  ];
  const urlHyb1 = `${OSRM_URL}/route/v1/driving/${qro.longitude},${qro.latitude};${bpPalmillas[0].longitude},${bpPalmillas[0].latitude};${bpPalmillas[1].longitude},${bpPalmillas[1].latitude};${cdmx.longitude},${cdmx.latitude}?overview=full&geometries=geojson&steps=true`;
  const resHyb1 = await fetch(urlHyb1).then(r => r.json());
  const hyb1Raw = resHyb1.routes[0];
  console.log('Hybrid 1 dist:', (hyb1Raw.distance/1000).toFixed(2), 'km, dur:', (hyb1Raw.duration/60).toFixed(1), 'min');
  const hyb1Tolls = await matcher.matchTollsAlongRoute(hyb1Raw.geometry.coordinates, { radiusMeters: 250, vehicleType: 'automovil' });
  console.log('Hybrid 1 Tolls:', hyb1Tolls.map(t => t.name));

  console.log('\n--- CALL 4: HYBRID Tepotzotlán ---');
  const bpTepotzotlan = [
    { latitude: 19.8550, longitude: -99.2880 },
    { latitude: 19.7450, longitude: -99.1650 }
  ];
  const urlHyb2 = `${OSRM_URL}/route/v1/driving/${qro.longitude},${qro.latitude};${bpTepotzotlan[0].longitude},${bpTepotzotlan[0].latitude};${bpTepotzotlan[1].longitude},${bpTepotzotlan[1].latitude};${cdmx.longitude},${cdmx.latitude}?overview=full&geometries=geojson&steps=true`;
  const resHyb2 = await fetch(urlHyb2).then(r => r.json());
  const hyb2Raw = resHyb2.routes[0];
  console.log('Hybrid 2 dist:', (hyb2Raw.distance/1000).toFixed(2), 'km, dur:', (hyb2Raw.duration/60).toFixed(1), 'min');
  const hyb2Tolls = await matcher.matchTollsAlongRoute(hyb2Raw.geometry.coordinates, { radiusMeters: 250, vehicleType: 'automovil' });
  console.log('Hybrid 2 Tolls:', hyb2Tolls.map(t => t.name));

  console.log('\n--- CALL 5: COMBINED ---');
  const bpCombined = [
    bpPalmillas[0], bpPalmillas[1],
    bpTepotzotlan[0], bpTepotzotlan[1]
  ];
  const urlComb = `${OSRM_URL}/route/v1/driving/${qro.longitude},${qro.latitude};${bpCombined[0].longitude},${bpCombined[0].latitude};${bpCombined[1].longitude},${bpCombined[1].latitude};${bpCombined[2].longitude},${bpCombined[2].latitude};${bpCombined[3].longitude},${bpCombined[3].latitude};${cdmx.longitude},${cdmx.latitude}?overview=full&geometries=geojson&steps=true`;
  const resComb = await fetch(urlComb).then(r => r.json());
  const combRaw = resComb.routes[0];
  console.log('Combined dist:', (combRaw.distance/1000).toFixed(2), 'km, dur:', (combRaw.duration/60).toFixed(1), 'min');
  const combTolls = await matcher.matchTollsAlongRoute(combRaw.geometry.coordinates, { radiusMeters: 250, vehicleType: 'automovil' });
  console.log('Combined Tolls:', combTolls.map(t => t.name));

  process.exit(0);
}

debugRawCandidates().catch(console.error);
