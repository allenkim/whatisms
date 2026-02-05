/*
  Warnings:

  - You are about to drop the column `date` on the `Snapshot` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Snapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "netWorth" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Snapshot" ("createdAt", "id", "netWorth") SELECT "createdAt", "id", "netWorth" FROM "Snapshot";
DROP TABLE "Snapshot";
ALTER TABLE "new_Snapshot" RENAME TO "Snapshot";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
