export const queretaroCdmxFixture = {
  name: "queretaro-cdmx",
  origin: { latitude: 20.5888, longitude: -100.3899, label: "Santiago de Querétaro, QRO" },
  destination: { latitude: 19.4326, longitude: -99.1332, label: "Ciudad de México, CDMX" },
  fastRoute: {
    distanceMeters: 218500,
    durationSeconds: 9900,
    geometry: [
      [-100.3899, 20.5888],
      [-100.3600, 20.5750],
      [-99.9349, 20.3069], // Caseta Palmillas (MEX-057D)
      [-99.5000, 20.0000],
      [-99.2075, 19.7144], // Caseta Tepotzotlán (MEX-057D)
      [-99.2000, 19.5000],
      [-99.1332, 19.4326],
    ] as [number, number][],
    legs: [
      {
        distanceMeters: 218500,
        durationSeconds: 9900,
        steps: [
          { name: "Av. Constituyentes", distanceMeters: 4500, durationSeconds: 480, mode: "driving", isToll: false, geometry: [[-100.3899, 20.5888], [-100.3600, 20.5750]] as [number, number][] },
          { name: "Autopista México - Querétaro 57D (Cuota)", distanceMeters: 185000, durationSeconds: 7500, mode: "driving", isToll: true, geometry: [[-100.3600, 20.5750], [-99.9349, 20.3069], [-99.2075, 19.7144], [-99.2000, 19.5000]] as [number, number][] },
          { name: "Periférico Blvd. Manuel Ávila Camacho", distanceMeters: 29000, durationSeconds: 1920, mode: "driving", isToll: false, geometry: [[-99.2000, 19.5000], [-99.1332, 19.4326]] as [number, number][] }
        ]
      }
    ]
  },
  cheapRoute: {
    distanceMeters: 235000,
    durationSeconds: 13500,
    geometry: [
      [-100.3899, 20.5888],
      [-99.7000, 20.1000],
      [-99.1332, 19.4326],
    ] as [number, number][],
    legs: [
      {
        distanceMeters: 235000,
        durationSeconds: 13500,
        steps: [
          { name: "Carretera Federal 57 Libre", distanceMeters: 120000, durationSeconds: 7000, mode: "driving", isToll: false, geometry: [[-100.3899, 20.5888], [-99.7000, 20.1000]] as [number, number][] },
          { name: "Carretera Libre Jilotepec - Huichapan", distanceMeters: 115000, durationSeconds: 6500, mode: "driving", isToll: false, geometry: [[-99.7000, 20.1000], [-99.1332, 19.4326]] as [number, number][] }
        ]
      }
    ]
  },
  hybridRoute: {
    distanceMeters: 224000,
    durationSeconds: 11400,
    geometry: [
      [-100.3899, 20.5888],
      [-99.9960, 20.3880],
      [-99.9349, 20.3069], // Caseta Palmillas
      [-99.2075, 19.7144], // Caseta Tepotzotlán
      [-99.2200, 19.6800],
      [-99.1332, 19.4326],
    ] as [number, number][],
    legs: [
      {
        distanceMeters: 224000,
        durationSeconds: 11400,
        steps: [
          { name: "Carretera Libre Querétaro - San Juan del Río", distanceMeters: 52000, durationSeconds: 3600, mode: "driving", isToll: false, geometry: [[-100.3899, 20.5888], [-99.9960, 20.3880]] as [number, number][] },
          { name: "Autopista 57D Palmillas - Tepotzotlán (Cuota)", distanceMeters: 122000, durationSeconds: 4800, mode: "driving", isToll: true, geometry: [[-99.9960, 20.3880], [-99.9349, 20.3069], [-99.2075, 19.7144], [-99.2200, 19.6800]] as [number, number][] },
          { name: "Vía Gustavo Baz Libre", distanceMeters: 50000, durationSeconds: 3000, mode: "driving", isToll: false, geometry: [[-99.2200, 19.6800], [-99.1332, 19.4326]] as [number, number][] }
        ]
      }
    ]
  }
};
