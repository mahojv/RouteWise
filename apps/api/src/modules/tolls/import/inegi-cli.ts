import { InegiSakbeImporter, DEFAULT_INEGI_CORRIDORS } from './sources/inegi.importer';

async function runInegiCli() {
  const args = process.argv.slice(2);
  const dryRun = args.some((a) => a.includes('dry')) || process.env.npm_config_dry_run === 'true';

  const timeoutArg = args.find((a) => a.startsWith('--timeout='));
  const timeoutMs = timeoutArg ? parseInt(timeoutArg.split('=')[1], 10) || 5000 : 5000;

  console.log('📡 Iniciando sincronización de casetas desde INEGI Sakbe (v3.1)...');
  console.log(`⚙️ Modo Dry-Run: ${dryRun ? 'SÍ (Sin cambios en base de datos)' : 'NO (Persistiendo en DB)'}`);
  console.log(`⏱️ Timeout por solicitud: ${timeoutMs} ms`);
  console.log(`🗺️ Corredores a consultar: ${DEFAULT_INEGI_CORRIDORS.length} rutas estratégicas`);

  const importer = new InegiSakbeImporter();

  try {
    const rawRecords = await importer.fetchFromInegiCorridors(DEFAULT_INEGI_CORRIDORS, undefined, timeoutMs);
    console.log(`📥 ${rawRecords.length} registros de casetas extraídos desde INEGI Sakbe.`);

    if (rawRecords.length === 0) {
      console.log('⚠️ No se obtuvieron registros de INEGI Sakbe. Verifica la API key en INEGI_SAKBE_API_KEY.');
      process.exit(0);
    }

    const rawContent = JSON.stringify(rawRecords);
    const result = await importer.import(rawContent, { dryRun });

    console.log('\n📊 Resumen de Sincronización INEGI Sakbe:');
    console.log(`   - Filas procesadas: ${result.totalRows}`);
    console.log(`   - Filas válidas: ${result.validRows}`);
    console.log(`   - Filas omitidas: ${result.skipped}`);
    console.log(`   - Casetas creadas: ${result.plazasCreated}`);
    console.log(`   - Casetas actualizadas: ${result.plazasUpdated}`);
    console.log(`   - Tarifas creadas: ${result.ratesCreated}`);
    console.log(`   - Tarifas actualizadas: ${result.ratesUpdated}`);

    if (result.warnings.length > 0) {
      console.log(`\n⚠️ Advertencias (${result.warnings.length}):`);
      result.warnings.slice(0, 10).forEach((w) => {
        console.log(`   [Fila ${w.row}] [${w.field}]: ${w.message}`);
      });
    }

    if (result.errors.length > 0) {
      console.error(`\n❌ Errores (${result.errors.length}):`, result.errors);
      process.exit(1);
    }

    console.log('\n✅ Sincronización INEGI Sakbe completada exitosamente.');
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ Fallo durante la sincronización INEGI Sakbe:', err.message || String(err));
    process.exit(1);
  }
}

if (require.main === module) {
  runInegiCli();
}
