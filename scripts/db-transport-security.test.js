const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

test("mysql2 and Prisma no longer allow invalid TLS certificates", () => {
  const dbSource = read("src/lib/db.ts");
  const prismaSource = read("src/lib/prisma.ts");
  const dbSslSource = read("src/lib/db-ssl.ts");

  assert.equal(dbSource.includes("rejectUnauthorized: false"), false);
  assert.equal(prismaSource.includes("accept_invalid_certs"), false);
  assert.equal(dbSslSource.includes("accept_invalid_certs"), false);
  assert.equal(dbSslSource.includes('sslaccept", "strict"'), true);
});
