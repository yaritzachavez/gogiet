import mysql from "mysql2/promise";

type DbRuntimeConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  useSsl: boolean;
};

function resolveDbConfig(): DbRuntimeConfig {
  console.log("DB_HOST:", process.env.DB_HOST);
  console.log("DB_NAME:", process.env.DB_NAME);

  const host = (process.env.DB_HOST ?? "localhost").trim() || "localhost";
  const database = process.env.DB_NAME?.trim() || "gogi";
  const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
  const user = (process.env.DB_USER ?? "root").trim() || "root";
  const password = process.env.DB_PASSWORD ?? process.env.DB_PASS ?? "";

  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 3306,
    user,
    password,
    database,
    useSsl: false,
  };
}

const dbConfig = resolveDbConfig();

declare global {
  // eslint-disable-next-line no-var
  var __gogiDbPool: mysql.Pool | undefined;
  // eslint-disable-next-line no-var
  var __gogiDbLogged: boolean | undefined;
}

if (!globalThis.__gogiDbLogged) {
  console.log("[db] Conectando a MySQL local", {
    DB_HOST: dbConfig.host,
    DB_NAME: dbConfig.database,
    DB_USER: dbConfig.user,
    DB_PORT: dbConfig.port,
  });
  globalThis.__gogiDbLogged = true;
}

const pool =
  globalThis.__gogiDbPool ??
  mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    ssl: dbConfig.useSsl
      ? {
          ca: process.env.DB_SSL_CA?.replace(/\\n/g, "\n"),
        }
      : undefined,
  });

if (!globalThis.__gogiDbPool) {
  globalThis.__gogiDbPool = pool;
}

export function logDbUsage(
  endpoint: string,
  payload?: {
    userId?: number | null;
    email?: string | null;
    role?: string | string[] | null;
  },
) {
  console.log("[db] endpoint", {
    endpoint,
    DB_HOST: dbConfig.host,
    DB_NAME: dbConfig.database,
    connectedUser: dbConfig.user,
    userId: payload?.userId ?? null,
    email: payload?.email ?? null,
    role: payload?.role ?? null,
  });
}

export function getDbRuntimeConfig() {
  return {
    DB_HOST: dbConfig.host,
    DB_NAME: dbConfig.database,
    DB_USER: dbConfig.user,
    DB_PORT: dbConfig.port,
  };
}

export default pool;
