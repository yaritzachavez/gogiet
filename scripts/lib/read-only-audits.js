const IDENTITY_AUDIT_QUERIES = Object.freeze({
  orphanUserRoles: `
    SELECT COUNT(*) AS total
    FROM user_roles ur
    LEFT JOIN users u ON u.id = ur.user_id
    LEFT JOIN roles r ON r.id = ur.role_id
    WHERE u.id IS NULL OR r.id IS NULL
  `,
  usersWithoutRoles: `
    SELECT COUNT(*) AS total
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE ur.user_id IS NULL
  `,
  activeDriversWithoutRole: `
    SELECT COUNT(*) AS total
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    WHERE UPPER(TRIM(COALESCE(u.driver_status, ''))) = 'ACTIVE'
      AND COALESCE(r.name, '') NOT IN ('repartidor', 'delivery', 'driver')
  `,
  businessesWithoutOwner: `
    SELECT COUNT(*) AS total
    FROM business b
    LEFT JOIN business_owners bo ON bo.business_id = b.id
    WHERE bo.business_id IS NULL
  `,
});

const PAYMENT_RECONCILIATION_QUERIES = Object.freeze({
  ordersWithoutPayments: `
    SELECT COUNT(*) AS total
    FROM orders o
    LEFT JOIN payments p ON p.order_id = o.id
    WHERE p.id IS NULL
  `,
  paymentsWithoutOrders: `
    SELECT COUNT(*) AS total
    FROM payments p
    LEFT JOIN orders o ON o.id = p.order_id
    WHERE o.id IS NULL
  `,
  approvedPaymentsByOrder: `
    SELECT
      p.order_id,
      COUNT(*) AS approved_payments
    FROM payments p
    WHERE LOWER(TRIM(COALESCE(p.payment_status, p.status, ''))) IN ('approved', 'paid', 'pagado')
    GROUP BY p.order_id
    HAVING COUNT(*) > 1
  `,
  inconsistentAmounts: `
    SELECT
      o.id AS order_id,
      o.total_amount,
      SUM(p.amount) AS total_paid
    FROM orders o
    INNER JOIN payments p ON p.order_id = o.id
    WHERE LOWER(TRIM(COALESCE(p.payment_status, p.status, ''))) IN ('approved', 'paid', 'pagado')
    GROUP BY o.id, o.total_amount
    HAVING ABS(COALESCE(o.total_amount, 0) - COALESCE(SUM(p.amount), 0)) > 0.009
  `,
  duplicateTransactionReferences: `
    SELECT transaction_reference, COUNT(*) AS total
    FROM payments
    WHERE transaction_reference IS NOT NULL AND TRIM(transaction_reference) <> ''
    GROUP BY transaction_reference
    HAVING COUNT(*) > 1
  `,
  incompatibleStates: `
    SELECT
      o.id AS order_id,
      osc.name AS order_status,
      o.payment_status,
      COALESCE(MAX(p.payment_status), MAX(p.status)) AS payment_record_status
    FROM orders o
    LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
    LEFT JOIN payments p ON p.order_id = o.id
    GROUP BY o.id, osc.name, o.payment_status
    HAVING
      (
        LOWER(TRIM(COALESCE(o.payment_status, ''))) IN ('paid', 'pagado')
        AND LOWER(TRIM(COALESCE(MAX(p.payment_status), MAX(p.status), ''))) NOT IN ('approved', 'paid', 'pagado')
      )
      OR (
        LOWER(TRIM(COALESCE(o.payment_status, ''))) IN ('payment_failed', 'failed', 'rechazado')
        AND LOWER(TRIM(COALESCE(MAX(p.payment_status), MAX(p.status), ''))) IN ('approved', 'paid', 'pagado')
      )
  `,
});

function buildSessionIntegrityQuery(schema) {
  const lastUsedExpression = schema.hasLastUsedAt
    ? "s.last_used_at"
    : schema.hasLastActiveAt
      ? "s.last_active_at"
      : "NULL";
  const expiresExpression = schema.hasExpiresAt ? "s.expires_at" : "NULL";
  const revokedExpression = schema.hasRevokedAt ? "s.revoked_at" : "NULL";
  const statusExpression = schema.hasStatus ? "s.status" : "NULL";

  return `
    SELECT
      SUM(CASE WHEN ${expiresExpression} IS NOT NULL AND ${expiresExpression} <= NOW() THEN 1 ELSE 0 END) AS expired_sessions,
      SUM(CASE WHEN ${revokedExpression} IS NOT NULL THEN 1 ELSE 0 END) AS revoked_sessions,
      SUM(
        CASE
          WHEN ${statusExpression} = 'active'
            AND ${revokedExpression} IS NOT NULL
          THEN 1
          ELSE 0
        END
      ) AS active_but_revoked,
      SUM(
        CASE
          WHEN ${statusExpression} = 'active'
            AND ${expiresExpression} IS NOT NULL
            AND ${expiresExpression} <= NOW()
          THEN 1
          ELSE 0
        END
      ) AS active_but_expired,
      SUM(
        CASE
          WHEN ${lastUsedExpression} IS NULL
            AND ${statusExpression} = 'active'
          THEN 1
          ELSE 0
        END
      ) AS active_without_usage_marker
    FROM user_sessions s
  `;
}

function normalizeCountRow(row) {
  return Number(row?.total ?? 0);
}

function buildIdentityAuditReport(results) {
  return {
    orphanUserRoles: normalizeCountRow(results.orphanUserRoles),
    usersWithoutRoles: normalizeCountRow(results.usersWithoutRoles),
    activeDriversWithoutRole: normalizeCountRow(
      results.activeDriversWithoutRole,
    ),
    businessesWithoutOwner: normalizeCountRow(results.businessesWithoutOwner),
    sessionIntegrity: {
      expiredSessions: Number(results.sessionIntegrity?.expired_sessions ?? 0),
      revokedSessions: Number(results.sessionIntegrity?.revoked_sessions ?? 0),
      activeButRevoked: Number(
        results.sessionIntegrity?.active_but_revoked ?? 0,
      ),
      activeButExpired: Number(
        results.sessionIntegrity?.active_but_expired ?? 0,
      ),
      activeWithoutUsageMarker: Number(
        results.sessionIntegrity?.active_without_usage_marker ?? 0,
      ),
    },
  };
}

function buildPaymentReconciliationReport(results) {
  return {
    ordersWithoutPayments: normalizeCountRow(results.ordersWithoutPayments),
    paymentsWithoutOrders: normalizeCountRow(results.paymentsWithoutOrders),
    multipleApprovedPayments: Array.isArray(results.approvedPaymentsByOrder)
      ? results.approvedPaymentsByOrder.length
      : 0,
    inconsistentAmounts: Array.isArray(results.inconsistentAmounts)
      ? results.inconsistentAmounts.length
      : 0,
    duplicateTransactionReferences: Array.isArray(
      results.duplicateTransactionReferences,
    )
      ? results.duplicateTransactionReferences.length
      : 0,
    incompatibleStates: Array.isArray(results.incompatibleStates)
      ? results.incompatibleStates.length
      : 0,
  };
}

module.exports = {
  IDENTITY_AUDIT_QUERIES,
  PAYMENT_RECONCILIATION_QUERIES,
  buildIdentityAuditReport,
  buildPaymentReconciliationReport,
  buildSessionIntegrityQuery,
};
