const test = require("node:test");
const assert = require("node:assert/strict");

const {
  IDENTITY_AUDIT_QUERIES,
  PAYMENT_RECONCILIATION_QUERIES,
  buildIdentityAuditReport,
  buildPaymentReconciliationReport,
  buildSessionIntegrityQuery,
} = require("./read-only-audits");

test("buildSessionIntegrityQuery prefers last_used_at when available", () => {
  const query = buildSessionIntegrityQuery({
    hasLastUsedAt: true,
    hasLastActiveAt: true,
    hasExpiresAt: true,
    hasRevokedAt: true,
    hasStatus: true,
  });

  assert.match(query, /last_used_at/);
  assert.doesNotMatch(query, /last_active_at IS NULL/);
});

test("identity audit report normalizes counts", () => {
  const report = buildIdentityAuditReport({
    orphanUserRoles: { total: "3" },
    usersWithoutRoles: { total: 5 },
    activeDriversWithoutRole: { total: "21" },
    businessesWithoutOwner: { total: 1 },
    sessionIntegrity: {
      expired_sessions: "2",
      revoked_sessions: 4,
      active_but_revoked: "1",
      active_but_expired: "3",
      active_without_usage_marker: "7",
    },
  });

  assert.deepEqual(report, {
    orphanUserRoles: 3,
    usersWithoutRoles: 5,
    activeDriversWithoutRole: 21,
    businessesWithoutOwner: 1,
    sessionIntegrity: {
      expiredSessions: 2,
      revokedSessions: 4,
      activeButRevoked: 1,
      activeButExpired: 3,
      activeWithoutUsageMarker: 7,
    },
  });
});

test("payment reconciliation report counts anomalous result sets", () => {
  const report = buildPaymentReconciliationReport({
    ordersWithoutPayments: { total: "14" },
    paymentsWithoutOrders: { total: 0 },
    approvedPaymentsByOrder: [{ order_id: 1 }, { order_id: 2 }],
    inconsistentAmounts: [{ order_id: 1 }],
    duplicateTransactionReferences: [],
    incompatibleStates: [{ order_id: 5 }, { order_id: 6 }, { order_id: 7 }],
  });

  assert.deepEqual(report, {
    ordersWithoutPayments: 14,
    paymentsWithoutOrders: 0,
    multipleApprovedPayments: 2,
    inconsistentAmounts: 1,
    duplicateTransactionReferences: 0,
    incompatibleStates: 3,
  });
});

test("query catalogs expose the expected keys", () => {
  assert.ok(IDENTITY_AUDIT_QUERIES.orphanUserRoles);
  assert.ok(IDENTITY_AUDIT_QUERIES.usersWithoutRoles);
  assert.ok(PAYMENT_RECONCILIATION_QUERIES.ordersWithoutPayments);
  assert.ok(PAYMENT_RECONCILIATION_QUERIES.incompatibleStates);
});
