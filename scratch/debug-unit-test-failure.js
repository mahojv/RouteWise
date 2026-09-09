const { RouteOptimizationService } = require('../apps/api/dist/modules/routing/route-optimizer.service');
const { getDbPool } = require('../apps/api/dist/database/index');

class UnexpectedTollMockProvider {
  name = 'unexpected-toll-mock';

  async calculateRoute(request) {
    console.log('Mock Provider calculateRoute call with waypoints:', request.waypoints);
    const isHybridCall = request.waypoints && request.waypoints.length === 2 && request.waypoints[1].latitude === 20.245;

    if (isHybridCall) {
      console.log('--> IS HYBRID CALL TRIGGERED');
      return {
        provider: this.name,
        latencyMs: 5,
        routes: [
          {
            distanceMeters: 220000,
            durationSeconds: 9500,
            geometry: {
              type: 'LineString',
              coordinates: [
                [-100.3899, 20.5888],
                [-99.6521, 20.3742],
                [-100.4851, 20.5512],
                [-99.5850, 20.2450],
                [-99.1332, 19.4326],
              ],
            },
            legs: [
              {
                distanceMeters: 220000,
                durationSeconds: 9500,
                steps: [
                  { name: 'Tramo Libre Alternativo', distanceMeters: 50000, durationSeconds: 2500, mode: 'driving', geometry: [] },
                  { name: 'Carretera Querétaro - Celaya (Cuota)', distanceMeters: 170000, durationSeconds: 7000, mode: 'driving', isToll: true, geometry: [] },
                ],
              },
            ],
          },
        ],
      };
    }

    console.log('--> IS FAST BASE CALL TRIGGERED');
    return {
      provider: this.name,
      latencyMs: 5,
      routes: [
        {
          distanceMeters: 218500,
          durationSeconds: 9000,
          geometry: {
            type: 'LineString',
            coordinates: [
              [-100.3899, 20.5888],
              [-99.9349, 20.3069],
              [-99.2075, 19.7144],
              [-99.1332, 19.4326],
            ],
          },
          legs: [
            {
              distanceMeters: 218500,
              durationSeconds: 9000,
              steps: [
                { name: 'Carretera México - Querétaro (Cuota)', distanceMeters: 218500, durationSeconds: 9000, mode: 'driving', isToll: true, geometry: [] },
              ],
            },
          ],
        },
      ],
    };
  }
}

async function debugTest() {
  const provider = new UnexpectedTollMockProvider();
  const service = new RouteOptimizationService(
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, provider
  );

  const res = await service.optimizeRoute({
    origin: { latitude: 20.5888, longitude: -100.3899 },
    destination: { latitude: 19.4326, longitude: -99.1332 },
  });

  console.log('Generated routes count:', res.routes.length);
  res.routes.forEach(r => {
    console.log(`Route id: ${r.id}, type: ${r.type}, title: ${r.title}, tolls: ${r.tolls.length}`);
  });
}

debugTest().catch(console.error);
