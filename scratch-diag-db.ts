import { getDbPool } from './apps/api/src/database';

async function diagPlazas() {
  const pool = getDbPool();
  const res = await pool.query('SELECT name, latitude, longitude FROM toll_plazas LIMIT 10;');
  console.log('Muestra de 10 casetas en DB:');
  console.table(res.rows);

  const resPuerto = await pool.query("SELECT name, latitude, longitude, ST_AsText(geom) as geom_wkt FROM toll_plazas WHERE name ILIKE '%Puerto%' OR name ILIKE '%Jimenez%' OR name ILIKE '%Zacatecas%';");
  console.log('\nBúsqueda de Puerto / Jimenez / Zacatecas en DB:');
  console.table(resPuerto.rows);

  await pool.end();
}

diagPlazas().catch(console.error);
