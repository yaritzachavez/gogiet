import assert from "node:assert/strict";
import test from "node:test";

import { createResolveBusinessAccess } from "./business-access-resolver.ts";

function createResolver(options?: {
  ownerRows?: Array<{
    id: number;
    name: string;
    city: string | null;
    source: "owner";
  }>;
  managerRows?: Array<{
    id: number;
    name: string;
    city: string | null;
    source: "manager";
  }>;
  userRows?: Array<{ email: string; role_name: string | null }>;
  existingBusinessIds?: number[];
  isAdminGeneral?: boolean;
}) {
  const executedSql: string[] = [];
  const resolver = createResolveBusinessAccess({
    getExistingTables: async () =>
      new Set([
        "users",
        "user_roles",
        "roles",
        "business_owners",
        "business_managers",
        "business",
      ]),
    query: async (sql) => {
      executedSql.push(sql);
      const normalizedSql = sql.trim().toLowerCase();
      assert.equal(
        /^select\b/.test(normalizedSql),
        true,
        `unexpected write query: ${sql}`,
      );

      if (normalizedSql.includes("from users u")) {
        return [
          (options?.userRows ?? [
            { email: "owner@gogieats.test", role_name: "ADMIN_NEGOCIO" },
          ]) as never,
        ];
      }

      if (normalizedSql.includes("from business_owners")) {
        return [(options?.ownerRows ?? []) as never];
      }

      if (normalizedSql.includes("from business_managers")) {
        return [(options?.managerRows ?? []) as never];
      }

      if (normalizedSql.includes("'admin_general' as source")) {
        return [[] as never];
      }

      throw new Error(`unexpected query: ${sql}`);
    },
    findExistingBusinessIds: async (ids) => options?.existingBusinessIds ?? ids,
    isAdminGeneral: async () => options?.isAdminGeneral ?? false,
  });

  return { resolver, executedSql };
}

test("resolveBusinessAccess keeps explicit owner access read-only", async () => {
  const { resolver, executedSql } = createResolver({
    ownerRows: [{ id: 3, name: "Negocio", city: "Mazamitla", source: "owner" }],
  });

  const result = await resolver(7, 3);

  assert.equal(result.businessId, 3);
  assert.deepEqual(result.businessIds, [3]);
  assert.equal(result.selectedBusinessSource, "owner");
  assert.equal(
    executedSql.some((sql) => /insert|update|delete/i.test(sql)),
    false,
  );
});

test("resolveBusinessAccess keeps explicit manager access read-only", async () => {
  const { resolver } = createResolver({
    ownerRows: [],
    managerRows: [
      { id: 8, name: "Tienda", city: "Mazamitla", source: "manager" },
    ],
  });

  const result = await resolver(7, 8);

  assert.equal(result.businessId, 8);
  assert.equal(result.selectedBusinessSource, "manager");
});

test("resolveBusinessAccess denies email, owner_id and owner_user_id legacy inference", async () => {
  const { resolver, executedSql } = createResolver({
    ownerRows: [],
    managerRows: [],
    userRows: [{ email: "legacy@gogieats.test", role_name: "ADMIN_NEGOCIO" }],
  });

  const result = await resolver(7, 9);

  assert.equal(result.businessId, null);
  assert.equal(result.denialReason, "not_assigned");
  assert.equal(
    executedSql.some((sql) =>
      /owner_id|owner_user_id|lower\(trim\(b\.email\)\)/i.test(sql),
    ),
    false,
  );
});

test("resolveBusinessAccess denies users from other businesses", async () => {
  const { resolver } = createResolver({
    ownerRows: [{ id: 3, name: "Negocio", city: null, source: "owner" }],
  });

  const result = await resolver(7, 99);

  assert.equal(result.businessId, null);
  assert.equal(result.denialReason, "requested_business_forbidden");
});
