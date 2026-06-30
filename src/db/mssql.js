const sql = require("mssql");
const config = require("../config");

let poolPromise;

const isIpAddress = (value) => /^\d{1,3}(\.\d{1,3}){3}$/.test(String(value || ""));

function getPool() {
  if (!poolPromise) {
    const tlsServerName =
      config.db.tlsServerName || (isIpAddress(config.db.server) ? "mssql" : undefined);

    poolPromise = sql.connect({
      server: config.db.server,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      port: config.db.port,
      options: {
        encrypt: config.db.encrypt,
        trustServerCertificate: config.db.trustServerCertificate,
        ...(tlsServerName ? { serverName: tlsServerName } : {})
      },
      pool: {
        max: config.db.poolMax,
        min: config.db.poolMin,
        idleTimeoutMillis: config.db.poolIdleTimeoutMillis
      }
    });
  }

  return poolPromise;
}

module.exports = { sql, getPool };
