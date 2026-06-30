const requireEnv = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return String(value).trim();
};

const getOptionalNumber = (key, fallback) => {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const getOptionalString = (key) => {
  const raw = process.env[key];
  if (!raw) return undefined;
  const value = String(raw).trim();
  return value || undefined;
};

module.exports = {
  port: getOptionalNumber("PORT", 3000),
  jwt: {
    secret: requireEnv("JWT_SECRET"),
    algorithms: (process.env.JWT_ALGORITHMS || "HS256")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
  },
  db: {
    server: requireEnv("DB_SERVER"),
    database: requireEnv("DB_DATABASE"),
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    port: getOptionalNumber("DB_PORT", 1433),
    encrypt: String(process.env.DB_ENCRYPT || "true").toLowerCase() === "true",
    trustServerCertificate:
      String(process.env.DB_TRUST_SERVER_CERTIFICATE || "false").toLowerCase() ===
      "true",
    tlsServerName: getOptionalString("DB_TLS_SERVERNAME"),
    poolMax: getOptionalNumber("DB_POOL_MAX", 10),
    poolMin: getOptionalNumber("DB_POOL_MIN", 0),
    poolIdleTimeoutMillis: getOptionalNumber("DB_POOL_IDLE_TIMEOUT_MS", 30000)
  }
};
