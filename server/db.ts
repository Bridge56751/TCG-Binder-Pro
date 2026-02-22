import * as schema from "@shared/schema";

const databaseUrl = process.env.GOOGLE_CLOUD_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("GOOGLE_CLOUD_DATABASE_URL must be set");
}

const { drizzle } = require("drizzle-orm/node-postgres");
const { Pool } = require("pg");
const cleanUrl = databaseUrl.replace(/[\?&]sslmode=[^&]*/g, "");
const pool = new Pool({
  connectionString: cleanUrl,
  ssl: { rejectUnauthorized: false },
});
const db = drizzle(pool, { schema });

export { db };
