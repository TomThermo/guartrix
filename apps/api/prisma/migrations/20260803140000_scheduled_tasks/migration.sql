-- CreateTable
CREATE TABLE `ScheduledTask` (
    `id` VARCHAR(191) NOT NULL,
    `serverId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL DEFAULT '',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `scheduleJson` JSON NOT NULL,
    `stepsJson` JSON NOT NULL,
    `lastRunAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `nextRunAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ScheduledTask_serverId_idx`(`serverId`),
    INDEX `ScheduledTask_nextRunAt_enabled_idx`(`nextRunAt`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ScheduledTask` ADD CONSTRAINT `ScheduledTask_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `Server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
