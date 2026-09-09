async function inspectHints() {
  const OSRM_URL = 'http://localhost:5005';
  const qro = { lat: 20.5888, lng: -100.3899 };
  const cdmx = { lat: 19.4326, lng: -99.1332 };

  const url = `${OSRM_URL}/route/v1/driving/${qro.lng},${qro.lat};${cdmx.lng},${cdmx.lat}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url).then(r => r.json());
  const route = res.routes[0];

  const hints = [];
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      if (step.name) hints.push(step.name);
    }
  }
  console.log('Highway hints from OSRM:', Array.from(new Set(hints)));
}

inspectHints().catch(console.error);
