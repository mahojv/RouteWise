export const queretaroSanluisFixture = {
  name: "queretaro-sanluis",
  origin: { latitude: 20.5888, longitude: -100.3899, label: "Santiago de Querétaro, QRO" },
  destination: { latitude: 22.1565, longitude: -100.9855, label: "San Luis Potosí, SLP" },
  fastRoute: {
    distanceMeters: 203000,
    durationSeconds: 7800,
    geometry: [
      [-100.3899, 20.5888],
      [-100.5630, 21.3150], // Caseta Puerto México (MEX-057D)
      [-100.7500, 21.7500],
      [-100.9855, 22.1565],
    ] as [number, number][],
    legs: [
      {
        distanceMeters: 203000,
        durationSeconds: 7800,
        steps: [
          { name: "Autopista Querétaro - San Luis 57D (Cuota)", distanceMeters: 195000, durationSeconds: 7200, mode: "driving", isToll: true, geometry: [[-100.3899, 20.5888], [-100.5630, 21.3150], [-100.9855, 22.1565]] as [number, number][] }
        ]
      }
    ]
  },
  cheapRoute: {
    distanceMeters: 218000,
    durationSeconds: 10800,
    geometry: [
      [-100.3899, 20.5888],
      [-100.7800, 21.1500], // Carretera Libre (evita Puerto México)
      [-100.9855, 22.1565],
    ] as [number, number][],
    legs: [
      {
        distanceMeters: 218000,
        durationSeconds: 10800,
        steps: [
          { name: "Carretera Federal 57 Libre", distanceMeters: 218000, durationSeconds: 10800, mode: "driving", isToll: false, geometry: [[-100.3899, 20.5888], [-100.7800, 21.1500], [-100.9855, 22.1565]] as [number, number][] }
        ]
      }
    ]
  }
};
