// Modul koneksi database bersama, dipakai semua Lambda handler lewat Layer.
// Di-require dengan path absolut: require('/opt/nodejs/db')
//
// Pola penting untuk Lambda: koneksi dibuat SEKALI di luar handler (module
// scope) supaya bisa dipakai ulang antar invocation selama container masih
// warm. Kredensial DB tidak pernah di-hardcode - selalu diambil dari
// Secrets Manager saat cold start pertama, lalu di-cache di memory.

const mysql = require('mysql2/promise');
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require('@aws-sdk/client-secrets-manager');

const secretsClient = new SecretsManagerClient({});

let pool; // cache pool antar invocation (warm start)

async function getDbCredentials() {
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN })
  );
  return JSON.parse(response.SecretString);
}

async function getPool() {
  if (pool) {
    return pool;
  }

  const credentials = await getDbCredentials();

  pool = mysql.createPool({
    host: process.env.DB_PROXY_ENDPOINT,
    port: 3306,
    user: credentials.username,
    password: credentials.password,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 2, // kecil karena RDS Proxy sudah menangani pooling sesungguhnya
    maxIdle: 2,
    idleTimeout: 60000,
  });

  return pool;
}

async function query(sql, params = []) {
  const db = await getPool();
  const [rows] = await db.execute(sql, params);
  return rows;
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

module.exports = { query, jsonResponse };
