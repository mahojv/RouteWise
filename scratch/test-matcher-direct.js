const { TollMatcherService } = require('../apps/api/dist/modules/tolls/toll-matcher.service');
const { TollCostService } = require('../apps/api/dist/modules/tolls/toll-cost.service');

async function testMatcherDirect() {
  const OSRM_URL = 'http://localhost:5005';
  const qro = { lat: 20.5888, lng: -100.3899 };
  const cdmx = { lat: 19.4326, lng: -99.1332 };

  const url = `${OSRM_URL}/route/v1/driving/${qro.lng},${qro.lat};${cdmx.lng},${cdmx.lat}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url).then(r => r.json());
  const route = res.routes[0];

  const matcher = new TollMatcherService(new TollCostService());
  const hints = [];
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      if (step.name) hints.push(step.name);
    }
  }

  try {
    const tolls = await matcher.matchTollsAlongRoute(route.geometry.coordinates, {
      radiusMeters: 250,
      vehicleType: 'automovil',
      highwayHints: hints,
    });
    console.log('Matched tolls count:', tolls.length);
    console.log(tolls);
  } catch (err) {
    console.error('Error matching tolls:', err);
  }

  process.exit(0);
}

testMatcherDirect().catch(console.error);
