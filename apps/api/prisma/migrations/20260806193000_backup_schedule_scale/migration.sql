-- AlterTable
ALTER TABLE `Server` ADD INDEX `Server_status_idx`(`status`);

-- CreateTable
CREATE TABLE `BackupSchedule` (
    `serverId` VARCHAR(191) NOT NULL,
    `mode` VARCHAR(191) NOT NULL DEFAULT 'off',
    `intervalHours` INTEGER NOT NULL DEFAULT 6,
    `dailyAt` VARCHAR(191) NOT NULL DEFAULT '03:00',
    `cronExpression` VARCHAR(191) NOT NULL DEFAULT '0 3 * * *',
    `keepCount` INTEGER NOT NULL DEFAULT 7,
    `lastRunAt` DATETIME(3) NULL,
    `nextRunAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BackupSchedule_nextRunAt_mode_idx`(`nextRunAt`, `mode`),
    PRIMARY KEY (`serverId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BackupSchedule` ADD CONSTRAINT `BackupSchedule_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `Server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
