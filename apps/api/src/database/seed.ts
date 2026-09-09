import { getDbPool } from './index';

export async function runSeed() {
  const pool = getDbPool();
  const client = await pool.connect();

  console.log('🌱 Seeding complete Mexican toll plazas, data sources, rates, and vehicle presets...');

  try {
    await client.query(`
      TRUNCATE toll_bypasses, toll_rates, toll_plazas CASCADE;
    `);

    await client.query(`
      INSERT INTO vehicles (name, fuel_type, fuel_consumption, fuel_price, vehicle_type)
      VALUES
        ('Mazda 3 Sedán (Gasolina)', 'gasolina_regular', 14.5, 24.50, 'automovil'),
        ('Honda CR-V SUV (Gasolina)', 'gasolina_regular', 11.5, 24.50, 'automovil'),
        ('Nissan Versa (Gasolina)', 'gasolina_regular', 15.2, 24.50, 'automovil'),
        ('Motocicleta 250cc', 'gasolina_regular', 30.0, 24.50, 'motocicleta')
      ON CONFLICT DO NOTHING;
    `);

    // Insert CAPUFE data source
    const sourceRes = await client.query(`
      INSERT INTO data_sources (name, code, url, description, last_synced_at)
      VALUES (
        'Caminos y Puentes Federales (CAPUFE)',
        'CAPUFE_OFICIAL',
        'https://www.gob.mx/capufe',
        'Tarifas oficiales de peaje en la red de autopistas de CAPUFE',
        NOW()
      )
      ON CONFLICT (code) DO UPDATE SET last_synced_at = NOW()
      RETURNING id;
    `);

    const sourceId = sourceRes.rows[0]?.id;

    const samplePlazas = [
      {
        name: 'Caseta Palmillas (Autopista México - Querétaro 57D)',
        operator: 'CAPUFE',
        highway: 'MEX-057D',
        road: 'México - Querétaro',
        lat: 20.3069,
        lon: -99.9349,
        km_marker: 148.0,
        direction: 'both',
        rates: [
          { vehicle_type: 'motocicleta', cash_price: 54.0, electronic_price: 54.0 },
          { vehicle_type: 'automovil', cash_price: 108.0, electronic_price: 108.0 },
          { vehicle_type: 'autobus', cash_price: 215.0, electronic_price: 215.0 },
          { vehicle_type: 'camion_2_ejes', cash_price: 215.0, electronic_price: 215.0 },
        ],
        bypasses: [
          {
            direction: 'both',
            exit_lat: 20.3742,
            exit_lng: -99.6521,
            reentry_lat: 20.2450,
            reentry_lng: -99.5850,
            exit_name: 'Desvío Huichapan (Carretera Libre 45/55)',
            reentry_name: 'Reincorporación Nopala / Polotitlán 57D',
            confidence: 1.0,
            is_verified: true,
            notes: 'Bypass verificado de Caseta Palmillas por Huichapan y Nopala',
          },
        ],
      },
      {
        name: 'Caseta Tepotzotlán (Autopista México - Querétaro 57D)',
        operator: 'CAPUFE',
        highway: 'MEX-057D',
        road: 'México - Querétaro',
        lat: 19.7144,
        lon: -99.2075,
        km_marker: 43.0,
        direction: 'both',
        rates: [
          { vehicle_type: 'motocicleta', cash_price: 54.0, electronic_price: 54.0 },
          { vehicle_type: 'automovil', cash_price: 108.0, electronic_price: 108.0 },
          { vehicle_type: 'autobus', cash_price: 215.0, electronic_price: 215.0 },
          { vehicle_type: 'camion_2_ejes', cash_price: 215.0, electronic_price: 215.0 },
        ],
        bypasses: [
          {
            direction: 'both',
            exit_lat: 19.8550,
            exit_lng: -99.2880,
            reentry_lat: 19.7480,
            reentry_lng: -99.1650,
            exit_name: 'Salida Jorobas / Libre Huehuetoca',
            reentry_name: 'Reincorporación Teoloyucan / Cuautitlán',
            confidence: 1.0,
            is_verified: true,
            notes: 'Bypass verificado de Caseta Tepotzotlán por Jorobas y Teoloyucan',
          },
        ],
      },
      {
        name: 'Caseta Chichimequillas (Libramiento Norponiente Querétaro)',
        operator: 'CONCESIONARIO',
        highway: 'MEX-057D-LIB',
        road: 'Libramiento Norponiente Querétaro',
        lat: 20.7381,
        lon: -100.3275,
        km_marker: 18.0,
        direction: 'both',
        rates: [
          { vehicle_type: 'motocicleta', cash_price: 32.0, electronic_price: 32.0 },
          { vehicle_type: 'automovil', cash_price: 65.0, electronic_price: 65.0 },
          { vehicle_type: 'autobus', cash_price: 130.0, electronic_price: 130.0 },
          { vehicle_type: 'camion_2_ejes', cash_price: 130.0, electronic_price: 130.0 },
        ],
      },
      {
        name: 'Caseta Querétaro - Celaya (Cuota 45D)',
        operator: 'CAPUFE',
        highway: 'MEX-045D',
        road: 'Querétaro - Irapuato',
        lat: 20.5512,
        lon: -100.4851,
        km_marker: 12.0,
        direction: 'both',
        rates: [
          { vehicle_type: 'motocicleta', cash_price: 47.0, electronic_price: 47.0 },
          { vehicle_type: 'automovil', cash_price: 95.0, electronic_price: 95.0 },
          { vehicle_type: 'autobus', cash_price: 185.0, electronic_price: 185.0 },
          { vehicle_type: 'camion_2_ejes', cash_price: 185.0, electronic_price: 185.0 },
        ],
      },
      {
        name: 'Caseta Puerto México (Querétaro - San Luis Potosí 57D)',
        operator: 'FONADIN',
        highway: 'MEX-057D',
        road: 'Querétaro - San Luis Potosí',
        lat: 21.3150,
        lon: -100.5630,
        km_marker: 88.0,
        direction: 'both',
        rates: [
          { vehicle_type: 'motocicleta', cash_price: 72.0, electronic_price: 72.0 },
          { vehicle_type: 'automovil', cash_price: 145.0, electronic_price: 145.0 },
          { vehicle_type: 'autobus', cash_price: 290.0, electronic_price: 290.0 },
          { vehicle_type: 'camion_2_ejes', cash_price: 290.0, electronic_price: 290.0 },
        ],
      },
      {
        name: 'Caseta San Marcos (México - Puebla 150D)',
        operator: 'CAPUFE',
        highway: 'MEX-150D',
        road: 'México - Puebla',
        lat: 19.3245,
        lon: -98.8890,
        km_marker: 33.0,
        direction: 'both',
        rates: [
          { vehicle_type: 'motocicleta', cash_price: 78.0, electronic_price: 78.0 },
          { vehicle_type: 'automovil', cash_price: 156.0, electronic_price: 156.0 },
          { vehicle_type: 'autobus', cash_price: 310.0, electronic_price: 310.0 },
          { vehicle_type: 'camion_2_ejes', cash_price: 310.0, electronic_price: 310.0 },
        ],
      },
      {
        name: 'Caseta Querétaro - Arco Norte (Autopista Arco Norte M40D)',
        operator: 'CONCESIONARIO',
        highway: 'MEX-M40D',
        road: 'Autopista Arco Norte',
        lat: 19.996598,
        lon: -99.490843,
        km_marker: 18.0,
        direction: 'both',
        rates: [
          { vehicle_type: 'motocicleta', cash_price: 58.0, electronic_price: 58.0 },
          { vehicle_type: 'automovil', cash_price: 115.0, electronic_price: 115.0 },
          { vehicle_type: 'autobus', cash_price: 230.0, electronic_price: 230.0 },
          { vehicle_type: 'camion_2_ejes', cash_price: 230.0, electronic_price: 230.0 },
        ],
      },
      {
        name: 'Caseta Tula - Arco Norte (Autopista Arco Norte M40D)',
        operator: 'CONCESIONARIO',
        highway: 'MEX-M40D',
        road: 'Autopista Arco Norte',
        lat: 20.068881,
        lon: -99.225835,
        km_marker: 45.0,
        direction: 'both',
        rates: [
          { vehicle_type: 'motocicleta', cash_price: 48.0, electronic_price: 48.0 },
          { vehicle_type: 'automovil', cash_price: 95.0, electronic_price: 95.0 },
          { vehicle_type: 'autobus', cash_price: 190.0, electronic_price: 190.0 },
          { vehicle_type: 'camion_2_ejes', cash_price: 190.0, electronic_price: 190.0 },
        ],
      },
      {
        name: 'Caseta Pachuca - Arco Norte (Autopista Arco Norte M40D)',
        operator: 'CONCESIONARIO',
        highway: 'MEX-M40D',
        road: 'Autopista Arco Norte',
        lat: 19.930860,
        lon: -98.896466,
        km_marker: 88.0,
        direction: 'both',
        rates: [
          { vehicle_type: 'motocicleta', cash_price: 65.0, electronic_price: 65.0 },
          { vehicle_type: 'automovil', cash_price: 130.0, electronic_price: 130.0 },
          { vehicle_type: 'autobus', cash_price: 260.0, electronic_price: 260.0 },
          { vehicle_type: 'camion_2_ejes', cash_price: 260.0, electronic_price: 260.0 },
        ],
      },
      {
        name: 'Caseta San Martín Texmelucan - Arco Norte',
        operator: 'CONCESIONARIO',
        highway: 'MEX-M40D',
        road: 'Autopista Arco Norte',
        lat: 19.402391,
        lon: -98.422697,
        km_marker: 172.0,
        direction: 'both',
        rates: [
          { vehicle_type: 'motocicleta', cash_price: 82.0, electronic_price: 82.0 },
          { vehicle_type: 'automovil', cash_price: 165.0, electronic_price: 165.0 },
          { vehicle_type: 'autobus', cash_price: 330.0, electronic_price: 330.0 },
          { vehicle_type: 'camion_2_ejes', cash_price: 330.0, electronic_price: 330.0 },
        ],
      },
      {
        name: 'Caseta Amozoc (Puebla - Acacingo 150D)',
        operator: 'CAPUFE',
        highway: 'MEX-150D',
        road: 'Puebla - Acacingo',
        lat: 19.055247,
        lon: -98.055725,
        km_marker: 142.0,
        direction: 'both',
        rates: [
          { vehicle_type: 'motocicleta', cash_price: 42.0, electronic_price: 42.0 },
          { vehicle_type: 'automovil', cash_price: 85.0, electronic_price: 85.0 },
          { vehicle_type: 'autobus', cash_price: 170.0, electronic_price: 170.0 },
          { vehicle_type: 'camion_2_ejes', cash_price: 170.0, electronic_price: 170.0 },
        ],
      },
      {
        name: 'Caseta Esperanza (Puebla - Orizaba 150D)',
        operator: 'CAPUFE',
        highway: 'MEX-150D',
        road: 'Puebla - Orizaba',
        lat: 18.858224,
        lon: -97.360131,
        km_marker: 221.0,
        direction: 'both',
        rates: [
          { vehicle_type: 'motocicleta', cash_price: 80.0, electronic_price: 80.0 },
          { vehicle_type: 'automovil', cash_price: 160.0, electronic_price: 160.0 },
          { vehicle_type: 'autobus', cash_price: 320.0, electronic_price: 320.0 },
          { vehicle_type: 'camion_2_ejes', cash_price: 320.0, electronic_price: 320.0 },
        ],
      },
      {
        name: 'Caseta Cuitláhuac (Córdoba - Veracruz 150D)',
        operator: 'CAPUFE',
        highway: 'MEX-150D',
        road: 'Córdoba - Veracruz',
        lat: 18.823259,
        lon: -96.709435,
        km_marker: 291.0,
        direction: 'both',
        rates: [
          { vehicle_type: 'motocicleta', cash_price: 64.0, electronic_price: 64.0 },
          { vehicle_type: 'automovil', cash_price: 128.0, electronic_price: 128.0 },
          { vehicle_type: 'autobus', cash_price: 256.0, electronic_price: 256.0 },
          { vehicle_type: 'camion_2_ejes', cash_price: 256.0, electronic_price: 256.0 },
        ],
      },
      {
        name: 'Caseta La Tinaja - Cosamaloapan (145D)',
        operator: 'CAPUFE',
        highway: 'MEX-145D',
        road: 'La Tinaja - Acayucan',
        lat: 18.273046,
        lon: -95.716454,
        km_marker: 82.0,
        direction: 'both',
        rates: [
          { vehicle_type: 'motocicleta', cash_price: 125.0, electronic_price: 125.0 },
          { vehicle_type: 'automovil', cash_price: 250.0, electronic_price: 250.0 },
          { vehicle_type: 'autobus', cash_price: 500.0, electronic_price: 500.0 },
          { vehicle_type: 'camion_2_ejes', cash_price: 500.0, electronic_price: 500.0 },
        ],
      },
      {
        name: 'Caseta Acayucan (La Tinaja - Acayucan 145D)',
        operator: 'CAPUFE',
        highway: 'MEX-145D',
        road: 'La Tinaja - Acayucan',
        lat: 17.911190,
        lon: -94.917807,
        km_marker: 188.0,
        direction: 'both',
        rates: [
          { vehicle_type: 'motocicleta', cash_price: 47.0, electronic_price: 47.0 },
          { vehicle_type: 'automovil', cash_price: 95.0, electronic_price: 95.0 },
          { vehicle_type: 'autobus', cash_price: 190.0, electronic_price: 190.0 },
          { vehicle_type: 'camion_2_ejes', cash_price: 190.0, electronic_price: 190.0 },
        ],
      },
      {
        name: 'Caseta Sánchez Magallanes - La Venta (180D)',
        operator: 'CAPUFE',
        highway: 'MEX-180D',
        road: 'Agua Dulce - Cárdenas',
        lat: 18.062320,
        lon: -94.040975,
        km_marker: 42.0,
        direction: 'both',
        rates: [
          { vehicle_type: 'motocicleta', cash_price: 45.0, electronic_price: 45.0 },
          { vehicle_type: 'automovil', cash_price: 90.0, electronic_price: 90.0 },
          { vehicle_type: 'autobus', cash_price: 180.0, electronic_price: 180.0 },
          { vehicle_type: 'camion_2_ejes', cash_price: 180.0, electronic_price: 180.0 },
        ],
      },
    ];

    for (const plaza of samplePlazas) {
      const plazaRes = await client.query(`
        INSERT INTO toll_plazas (
          name, operator, highway, road, latitude, longitude, geom, km_marker, direction, source_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($6, $5), 4326), $7, $8, $9
        )
        RETURNING id;
      `, [
        plaza.name,
        plaza.operator,
        plaza.highway,
        plaza.road || null,
        plaza.lat,
        plaza.lon,
        plaza.km_marker,
        plaza.direction,
        sourceId,
      ]);

      const plazaId = plazaRes.rows[0]?.id;
      if (plazaId && plaza.rates) {
        for (const rate of plaza.rates) {
          await client.query(`
            INSERT INTO toll_rates (
              toll_plaza_id, vehicle_type, cash_price, electronic_price, currency, source_id, effective_from
            )
            VALUES ($1, $2, $3, $4, 'MXN', $5, '2024-01-01T00:00:00Z')
          `, [
            plazaId,
            rate.vehicle_type,
            rate.cash_price,
            rate.electronic_price,
            sourceId,
          ]);
        }
      }

      if (plazaId && (plaza as any).bypasses) {
        for (const bp of (plaza as any).bypasses) {
          await client.query(`
            INSERT INTO toll_bypasses (
              toll_plaza_id, direction, exit_lat, exit_lng, reentry_lat, reentry_lng,
              exit_name, reentry_name, confidence, is_verified, notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `, [
            plazaId,
            bp.direction,
            bp.exit_lat,
            bp.exit_lng,
            bp.reentry_lat,
            bp.reentry_lng,
            bp.exit_name,
            bp.reentry_name,
            bp.confidence,
            bp.is_verified,
            bp.notes,
          ]);
        }
      }
    }

    console.log('✅ Complete seed data with 16 core Mexican highway toll plazas inserted successfully!');
  } catch (err) {
    console.error('❌ Seed error:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
