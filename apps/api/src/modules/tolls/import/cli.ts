import * as fs from 'fs';
import * as path from 'path';
import { CapufeCsvImporter } from './sources/capufe.importer';

async function runCli() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileArgIndex = args.findIndex((a) => !a.startsWith('--'));

  const defaultFilePath = path.resolve(__dirname, '../../../fixtures/import/capufe-sample.csv');
  const filePath = fileArgIndex !== -1 ? path.resolve(process.cwd(), args[fileArgIndex]) : defaultFilePath;

  console.log(`🚀 Iniciando importación de casetas y tarifas...`);
  console.log(`📁 Archivo: ${filePath}`);
  console.log(`⚙️ Modo Dry-Run: ${dryRun ? 'SÍ (Sin cambios en base de datos)' : 'NO (Persistiendo en DB)'}`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Archivo no encontrado: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const importer = new CapufeCsvImporter();

  try {
    const result = await importer.import(content, { dryRun });

    console.log('\n📊 Resumen de Importación:');
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
      if (result.warnings.length > 10) {
        console.log(`   ... y ${result.warnings.length - 10} más`);
      }
    }

    if (result.errors.length > 0) {
      console.error(`\n❌ Errores (${result.errors.length}):`, result.errors);
      process.exit(1);
    }

    console.log('\n✅ Proceso de importación finalizado con éxito.');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Fallo crítico durante la importación:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  runCli();
}
