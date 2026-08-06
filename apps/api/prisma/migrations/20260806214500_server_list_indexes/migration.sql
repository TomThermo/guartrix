-- AlterTable
CREATE INDEX `Server_createdAt_idx` ON `Server`(`createdAt`);

-- AlterTable
CREATE INDEX `Server_ownerId_createdAt_idx` ON `Server`(`ownerId`, `createdAt`);
