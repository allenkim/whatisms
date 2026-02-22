-- AlterTable
ALTER TABLE "Holding" ADD COLUMN "snapTradeSymbolId" TEXT;

-- CreateTable
CREATE TABLE "SnapTradeConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "userSecret" TEXT NOT NULL,
    "authorizationId" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "lastSynced" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "plaidItemId" TEXT,
    "plaidAccountId" TEXT,
    "snapTradeConnectionId" TEXT,
    "snapTradeAccountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_plaidItemId_fkey" FOREIGN KEY ("plaidItemId") REFERENCES "PlaidItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Account_snapTradeConnectionId_fkey" FOREIGN KEY ("snapTradeConnectionId") REFERENCES "SnapTradeConnection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("createdAt", "id", "institution", "name", "plaidAccountId", "plaidItemId", "type", "updatedAt") SELECT "createdAt", "id", "institution", "name", "plaidAccountId", "plaidItemId", "type", "updatedAt" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SnapTradeConnection_authorizationId_key" ON "SnapTradeConnection"("authorizationId");
