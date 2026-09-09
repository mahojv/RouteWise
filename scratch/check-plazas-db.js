const { getDbPool } = require('../apps/api/dist/database/index');

async function checkPlazas() {
  const pool = getDbPool();
  const res = await pool.query(`SELECT id, name, latitude, longitude, ST_AsText(geom) FROM toll_plazas WHERE name LIKE '%Palmillas%' OR name LIKE '%Tepotzotlán%';`);
  console.log('Plazas in DB:', res.rows);
  process.exit(0);
}

checkPlazas().catch(console.error);
