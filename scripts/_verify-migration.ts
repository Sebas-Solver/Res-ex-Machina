import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

const [result] = await sql`SELECT count(*) AS plaintext_count FROM webhooks WHERE secret IS NOT NULL`;
console.log(`Webhooks con secret plaintext (IS NOT NULL): ${result.plaintext_count}`);

if (result.plaintext_count === '0') {
  console.log('✅ VERIFICACIÓN PASADA: Todos los secretos están cifrados.');
} else {
  console.error('❌ FALLO: Aún hay secretos en texto plano!');
  process.exit(1);
}

// Extra: verificar que los campos cifrados existen
const [encrypted] = await sql`SELECT count(*) AS encrypted_count FROM webhooks WHERE secret_ciphertext IS NOT NULL`;
console.log(`Webhooks con datos cifrados: ${encrypted.encrypted_count}`);

await sql.end();
