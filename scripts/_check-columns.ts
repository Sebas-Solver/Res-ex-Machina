import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

const rows = await sql`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'webhooks'
  AND column_name IN ('secret', 'secret_ciphertext', 'secret_iv', 'secret_auth_tag', 'secret_key_version')
  ORDER BY column_name
`;

console.table(rows);
await sql.end();
