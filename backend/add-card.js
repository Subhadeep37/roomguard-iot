// Adds (or re-enables) an authorized RFID card in the database.
// Usage (from inside the backend folder, where the pg package is already installed):
//   node add-card.js "<DATABASE_URL>" <UID> "<Card Name>"
//
// Example:
//   node add-card.js "postgresql://user:pass@host/db" 61C46222 "Chiradeep's Keycard"

const { Client } = require('pg');

const [, , connectionString, uid, name] = process.argv;

if (!connectionString || !uid || !name) {
  console.error('Usage: node add-card.js "<DATABASE_URL>" <UID> "<Card Name>"');
  process.exit(1);
}

(async () => {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const normalizedUid = uid.replace(/\s+/g, '').toUpperCase();

    const { rows } = await client.query(
      `INSERT INTO authorized_rfid_cards (uid, name, enabled)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (uid) DO UPDATE SET
         name = EXCLUDED.name,
         enabled = TRUE,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [normalizedUid, name]
    );

    console.log('Card authorized:', rows[0]);
  } catch (err) {
    console.error('Failed to add card:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
