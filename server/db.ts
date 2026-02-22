import * as schema from "../shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const databaseUrl = process.env.GOOGLE_CLOUD_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("GOOGLE_CLOUD_DATABASE_URL must be set");
}

const cleanUrl = databaseUrl.replace(/[\?&]sslmode=[^&]*/g, "");
const pool = new pg.Pool({
  connectionString: cleanUrl,
  ssl: { rejectUnauthorized: false },
});
const db = drizzle(pool, { schema });

export { db };
