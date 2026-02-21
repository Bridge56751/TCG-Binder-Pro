import * as schema from "@shared/schema";

const googleCloudUrl = process.env.GOOGLE_CLOUD_DATABASE_URL;
const defaultUrl = process.env.DATABASE_URL;
const databaseUrl = googleCloudUrl || defaultUrl;

if (!databaseUrl) {
  throw new Error("GOOGLE_CLOUD_DATABASE_URL or DATABASE_URL must be set");
}

let db: any;

if (googleCloudUrl) {
  const { drizzle } = require("drizzle-orm/node-postgres");
  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString: googleCloudUrl,
    ssl: { rejectUnauthorized: false },
  });
  db = drizzle(pool, { schema });
} else {
  const { drizzle } = require("drizzle-orm/neon-serverless");
  const ws = require("ws");
  db = drizzle({
    connection: defaultUrl,
    schema,
    ws,
  });
}

export { db };
