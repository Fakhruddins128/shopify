const sql = require("mssql");
const config = require("../config");

let poolPromise;

function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect({
      server: config.db.server,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      port: config.db.port,
      options: {
        encrypt: config.db.encrypt,
        trustServerCertificate: config.db.trustServerCertificate
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
