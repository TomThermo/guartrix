-- CreateTable StoragePool
CREATE TABLE `StoragePool` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('LOCAL', 'NFS') NOT NULL,
    `nfsServer` VARCHAR(191) NULL,
    `nfsExport` VARCHAR(191) NULL,
    `nfsOptions` VARCHAR(191) NULL,
    `diskMb` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StoragePool_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable StorageNodeLink
CREATE TABLE `StorageNodeLink` (
    `id` VARCHAR(191) NOT NULL,
    `storageId` VARCHAR(191) NOT NULL,
    `nodeId` VARCHAR(191) NOT NULL,
    `mountPoint` VARCHAR(191) NOT NULL,
    `hostPath` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StorageNodeLink_storageId_nodeId_key`(`storageId`, `nodeId`),
    INDEX `StorageNodeLink_nodeId_idx`(`nodeId`),
    INDEX `StorageNodeLink_storageId_idx`(`storageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Migrate existing NodeStorage rows → StoragePool + StorageNodeLink (keep same pool id)
INSERT INTO `StoragePool` (`id`, `name`, `type`, `nfsServer`, `nfsExport`, `nfsOptions`, `diskMb`, `enabled`, `createdAt`, `updatedAt`)
SELECT
  `id`,
  CASE
    WHEN (
      SELECT COUNT(*) FROM `NodeStorage` ns2 WHERE ns2.`name` = `NodeStorage`.`name`
    ) > 1 THEN CONCAT(`name`, '-', `id`)
    ELSE `name`
  END,
  `type`,
  `nfsServer`,
  `nfsExport`,
  `nfsOptions`,
  `diskMb`,
  `enabled`,
  `createdAt`,
  `updatedAt`
FROM `NodeStorage`;

INSERT INTO `StorageNodeLink` (`id`, `storageId`, `nodeId`, `mountPoint`, `hostPath`, `createdAt`, `updatedAt`)
SELECT CONCAT('lnk_', `id`), `id`, `nodeId`, `mountPoint`, `hostPath`, `createdAt`, `updatedAt`
FROM `NodeStorage`;

-- Repoint Server.storageId FK from NodeStorage → StoragePool
ALTER TABLE `Server` DROP FOREIGN KEY `Server_storageId_fkey`;

ALTER TABLE `Server` ADD CONSTRAINT `Server_storageId_fkey` FOREIGN KEY (`storageId`) REFERENCES `StoragePool`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop old table
ALTER TABLE `NodeStorage` DROP FOREIGN KEY `NodeStorage_nodeId_fkey`;
DROP TABLE `NodeStorage`;

-- Link FKs
ALTER TABLE `StorageNodeLink` ADD CONSTRAINT `StorageNodeLink_storageId_fkey` FOREIGN KEY (`storageId`) REFERENCES `StoragePool`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `StorageNodeLink` ADD CONSTRAINT `StorageNodeLink_nodeId_fkey` FOREIGN KEY (`nodeId`) REFERENCES `Node`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
