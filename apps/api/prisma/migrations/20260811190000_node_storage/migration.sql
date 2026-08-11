-- CreateTable
CREATE TABLE `NodeStorage` (
    `id` VARCHAR(191) NOT NULL,
    `nodeId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('LOCAL', 'NFS') NOT NULL,
    `mountPoint` VARCHAR(191) NOT NULL,
    `hostPath` VARCHAR(191) NULL,
    `nfsServer` VARCHAR(191) NULL,
    `nfsExport` VARCHAR(191) NULL,
    `nfsOptions` VARCHAR(191) NULL,
    `diskMb` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `NodeStorage_nodeId_name_key`(`nodeId`, `name`),
    INDEX `NodeStorage_nodeId_idx`(`nodeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Server` ADD COLUMN `storageId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Server_storageId_idx` ON `Server`(`storageId`);

-- AddForeignKey
ALTER TABLE `NodeStorage` ADD CONSTRAINT `NodeStorage_nodeId_fkey` FOREIGN KEY (`nodeId`) REFERENCES `Node`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Server` ADD CONSTRAINT `Server_storageId_fkey` FOREIGN KEY (`storageId`) REFERENCES `NodeStorage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
