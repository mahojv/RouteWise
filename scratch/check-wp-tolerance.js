const { getCumulativeDistanceToPoint } = require('../apps/api/dist/modules/tolls/toll-bypass-resolver.service');
const { routePassesThroughWaypoints } = require('../apps/api/dist/modules/routing/route-optimizer.service');

async function checkWaypointsTolerance() {
  const OSRM_URL = 'http://localhost:5005';
  const qro = { lat: 20.5888, lng: -100.3899 };
  const cdmx = { lat: 19.4326, lng: -99.1332 };

  const bpPalmillas = [
    { latitude: 20.3742, longitude: -99.6521 },
    { latitude: 20.2450, longitude: -99.5850 }
  ];

  const bpTepotzotlan = [
    { latitude: 19.8550, longitude: -99.2880 },
    { latitude: 19.7450, longitude: -99.1650 }
  ];

  console.log('--- HYBRID 1 (Palmillas) ---');
  const urlHyb1 = `${OSRM_URL}/route/v1/driving/${qro.lng},${qro.lat};${bpPalmillas[0].longitude},${bpPalmillas[0].latitude};${bpPalmillas[1].longitude},${bpPalmillas[1].latitude};${cdmx.lng},${cdmx.lat}?overview=full&geometries=geojson&steps=true`;
  const hyb1Raw = await fetch(urlHyb1).then(r => r.json()).then(r => r.routes[0]);
  
  const p1_exit = getCumulativeDistanceToPoint(bpPalmillas[0], hyb1Raw.geometry.coordinates);
  const p1_reentry = getCumulativeDistanceToPoint(bpPalmillas[1], hyb1Raw.geometry.coordinates);
  console.log('Palmillas exit min distance:', p1_exit.minDistanceToPolyline.toFixed(2), 'm');
  console.log('Palmillas reentry min distance:', p1_reentry.minDistanceToPolyline.toFixed(2), 'm');
  console.log('Passes 200m tolerance:', routePassesThroughWaypoints(hyb1Raw.geometry.coordinates, bpPalmillas, 200));

  console.log('\n--- HYBRID 2 (Tepotzotlán) ---');
  const urlHyb2 = `${OSRM_URL}/route/v1/driving/${qro.lng},${qro.lat};${bpTepotzotlan[0].longitude},${bpTepotzotlan[0].latitude};${bpTepotzotlan[1].longitude},${bpTepotzotlan[1].latitude};${cdmx.lng},${cdmx.lat}?overview=full&geometries=geojson&steps=true`;
  const hyb2Raw = await fetch(urlHyb2).then(r => r.json()).then(r => r.routes[0]);

  const p2_exit = getCumulativeDistanceToPoint(bpTepotzotlan[0], hyb2Raw.geometry.coordinates);
  const p2_reentry = getCumulativeDistanceToPoint(bpTepotzotlan[1], hyb2Raw.geometry.coordinates);
  console.log('Tepotzotlan exit min distance:', p2_exit.minDistanceToPolyline.toFixed(2), 'm');
  console.log('Tepotzotlan reentry min distance:', p2_reentry.minDistanceToPolyline.toFixed(2), 'm');
  console.log('Passes 200m tolerance:', routePassesThroughWaypoints(hyb2Raw.geometry.coordinates, bpTepotzotlan, 200));
}

checkWaypointsTolerance().catch(console.error);
