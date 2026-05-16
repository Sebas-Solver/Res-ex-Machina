import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

// Paso 8: Crear backup
console.log('Creando backup de tabla webhooks...');
await sql`CREATE TABLE IF NOT EXISTS webhooks_backup_p1_1_20260516 AS SELECT * FROM webhooks`;

// Verificar conteos
const [result] = await sql`
  SELECT
    (SELECT count(*) FROM webhooks) AS original_count,
    (SELECT count(*) FROM webhooks_backup_p1_1_20260516) AS backup_count
`;

console.log(`Original: ${result.original_count} filas`);
console.log(`Backup:   ${result.backup_count} filas`);

if (result.original_count === result.backup_count) {
  console.log('✅ Backup verificado correctamente');
} else {
  console.error('❌ ERROR: Los conteos no coinciden!');
  process.exit(1);
}

await sql.end();
