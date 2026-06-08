#!/usr/bin/env node

const mysql = require("mysql2/promise");

const {
  PAYMENT_RECONCILIATION_QUERIES,
  buildPaymentReconciliationReport,
} = require("./lib/read-only-audits");

async function getConnection() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for read-only audits.");
  }

  const url = new URL(process.env.DATABASE_URL);
  return mysql.createConnection(url.toString());
}

async function runPaymentReconciliationAudit() {
  const connection = await getConnection();

  try {
    const results = {};

    for (const [key, query] of Object.entries(PAYMENT_RECONCILIATION_QUERIES)) {
      const [rows] = await connection.query(query);
      results[key] =
        key === "ordersWithoutPayments" || key === "paymentsWithoutOrders"
          ? (rows[0] ?? { total: 0 })
          : rows;
    }

    console.info(
      JSON.stringify(
        {
          mode: "read-only",
          database: new URL(process.env.DATABASE_URL).pathname.replace(
            /^\//,
            "",
          ),
          report: buildPaymentReconciliationReport(results),
        },
        null,
        2,
      ),
    );
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  runPaymentReconciliationAudit().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  runPaymentReconciliationAudit,
};
