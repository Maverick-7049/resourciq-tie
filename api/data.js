const { neon } = require('@neondatabase/serverless');

// One-time table creation (idempotent)
async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS app_data (
      key        TEXT PRIMARY KEY,
      value      JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

module.exports = async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);

  try {
    await ensureTable(sql);

    // GET — return all stored data collections
    if (req.method === 'GET') {
      const rows = await sql`SELECT key, value FROM app_data`;
      const result = {};
      rows.forEach(r => { result[r.key] = r.value; });
      return res.status(200).json(result);
    }

    // POST — upsert one or more data collections
    if (req.method === 'POST') {
      const body = req.body;
      if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Invalid body' });
      }
      const entries = Object.entries(body);
      for (const [key, value] of entries) {
        await sql`
          INSERT INTO app_data (key, value, updated_at)
          VALUES (${key}, ${JSON.stringify(value)}, NOW())
          ON CONFLICT (key)
          DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `;
      }
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
