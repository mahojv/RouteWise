async function testTepotzotlanReentrySnap() {
  const OSRM_URL = 'http://localhost:5005';
  
  // Test various reentry coordinates near 19.745, -99.165
  const candidates = [
    { latitude: 19.7450, longitude: -99.1650 },
    { latitude: 19.7420, longitude: -99.1650 },
    { latitude: 19.7400, longitude: -99.1660 },
    { latitude: 19.7450, longitude: -99.1670 },
    { latitude: 19.7480, longitude: -99.1650 },
  ];

  const exit = { latitude: 19.8550, longitude: -99.2880 };

  for (const c of candidates) {
    const url = `${OSRM_URL}/nearest/v1/driving/${c.longitude},${c.latitude}`;
    const res = await fetch(url).then(r => r.json());
    const waypoints = res.waypoints[0];
    const snapped = waypoints.location; // [lon, lat]
    const dist = waypoints.distance;
    console.log(`Input [${c.longitude}, ${c.latitude}] -> Snapped [${snapped[0]}, ${snapped[1]}] (dist: ${dist.toFixed(1)}m)`);
  }
}

testTepotzotlanReentrySnap().catch(console.error);
