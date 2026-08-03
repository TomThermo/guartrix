-- CreateTable
CREATE TABLE `Node` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `fqdn` VARCHAR(191) NOT NULL,
    `scheme` VARCHAR(191) NOT NULL DEFAULT 'http',
    `daemonPort` INTEGER NOT NULL DEFAULT 8081,
    `tokenHash` VARCHAR(191) NOT NULL,
    `isLocal` BOOLEAN NOT NULL DEFAULT false,
    `memoryMb` INTEGER NOT NULL DEFAULT 0,
    `mysqlPort` INTEGER NOT NULL DEFAULT 3306,
    `sftpPort` INTEGER NOT NULL DEFAULT 2022,
    `sftpHostname` VARCHAR(191) NULL,
    `sftpDnsSlug` VARCHAR(191) NULL,
    `status` ENUM('ONLINE', 'OFFLINE', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `lastSeenAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Node_sftpDnsSlug_key`(`sftpDnsSlug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Server` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('VANILLA', 'PAPER', 'FABRIC', 'FORGE', 'PURPUR', 'NEOFORGE', 'QUILT') NOT NULL,
    `mcVersion` VARCHAR(191) NOT NULL,
    `port` INTEGER NOT NULL,
    `memoryMb` INTEGER NOT NULL,
    `diskMb` INTEGER NOT NULL DEFAULT 10240,
    `cpuLimit` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('STOPPED', 'STARTING', 'RUNNING', 'STOPPING', 'ERROR', 'CREATING', 'TRANSFERRING') NOT NULL DEFAULT 'STOPPED',
    `javaPath` VARCHAR(191) NULL,
    `startupCommand` TEXT NULL,
    `serverJar` VARCHAR(191) NULL,
    `fabricLoaderVersion` VARCHAR(191) NULL,
    `forgeVersion` VARCHAR(191) NULL,
    `paperBuild` INTEGER NULL,
    `errorMessage` VARCHAR(191) NULL,
    `autoRestart` BOOLEAN NOT NULL DEFAULT false,
    `startOnBoot` BOOLEAN NOT NULL DEFAULT false,
    `ownerAlertWebhookUrl` VARCHAR(191) NULL,
    `ownerAlertEmail` VARCHAR(191) NULL,
    `discordStatusWebhookUrl` VARCHAR(191) NULL,
    `discordStatusMessageId` VARCHAR(191) NULL,
    `discordStatusEnabled` BOOLEAN NOT NULL DEFAULT false,
    `bluemapUrl` VARCHAR(191) NULL,
    `ownerId` VARCHAR(191) NULL,
    `nodeId` VARCHAR(191) NULL,
    `subdomain` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Server_subdomain_key`(`subdomain`),
    INDEX `Server_ownerId_idx`(`ownerId`),
    INDEX `Server_nodeId_idx`(`nodeId`),
    UNIQUE INDEX `Server_nodeId_port_key`(`nodeId`, `port`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlayerModerationEvent` (
    `id` VARCHAR(191) NOT NULL,
    `serverId` VARCHAR(191) NOT NULL,
    `playerName` VARCHAR(191) NOT NULL,
    `uuid` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `actorUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PlayerModerationEvent_serverId_playerName_idx`(`serverId`, `playerName`),
    INDEX `PlayerModerationEvent_serverId_createdAt_idx`(`serverId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Allocation` (
    `id` VARCHAR(191) NOT NULL,
    `nodeId` VARCHAR(191) NOT NULL,
    `ip` VARCHAR(191) NOT NULL DEFAULT '0.0.0.0',
    `port` INTEGER NOT NULL,
    `protocol` VARCHAR(191) NOT NULL DEFAULT 'tcp',
    `notes` VARCHAR(191) NULL,
    `serverId` VARCHAR(191) NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Allocation_serverId_idx`(`serverId`),
    INDEX `Allocation_nodeId_idx`(`nodeId`),
    UNIQUE INDEX `Allocation_nodeId_port_protocol_key`(`nodeId`, `port`, `protocol`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityEvent` (
    `id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'server',
    `serverId` VARCHAR(191) NULL,
    `serverName` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `actorName` VARCHAR(191) NOT NULL DEFAULT 'system',
    `actorIp` VARCHAR(191) NULL,
    `success` BOOLEAN NOT NULL DEFAULT true,
    `metadata` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActivityEvent_serverId_createdAt_idx`(`serverId`, `createdAt`),
    INDEX `ActivityEvent_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `ActivityEvent_category_createdAt_idx`(`category`, `createdAt`),
    INDEX `ActivityEvent_action_idx`(`action`),
    INDEX `ActivityEvent_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'OPERATOR', 'VIEWER') NOT NULL DEFAULT 'OPERATOR',
    `maxServers` INTEGER NULL,
    `maxMemoryMb` INTEGER NULL,
    `maxDatabases` INTEGER NULL,
    `totpSecret` VARCHAR(191) NULL,
    `totpEnabled` BOOLEAN NOT NULL DEFAULT false,
    `totpRecoveryCodes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `mollieCustomerId` VARCHAR(191) NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApiKey` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `prefix` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `permissions` TEXT NOT NULL,
    `serverIds` TEXT NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `ApiKey_tokenHash_key`(`tokenHash`),
    INDEX `ApiKey_userId_idx`(`userId`),
    INDEX `ApiKey_prefix_idx`(`prefix`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
    INDEX `PasswordResetToken_userId_idx`(`userId`),
    INDEX `PasswordResetToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailVerificationToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EmailVerificationToken_tokenHash_key`(`tokenHash`),
    INDEX `EmailVerificationToken_userId_idx`(`userId`),
    INDEX `EmailVerificationToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubUser` (
    `id` VARCHAR(191) NOT NULL,
    `serverId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `permissions` VARCHAR(191) NOT NULL DEFAULT '[]',
    `inviteTokenHash` VARCHAR(191) NULL,
    `inviteExpiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SubUser_inviteTokenHash_key`(`inviteTokenHash`),
    INDEX `SubUser_userId_idx`(`userId`),
    INDEX `SubUser_email_idx`(`email`),
    UNIQUE INDEX `SubUser_serverId_email_key`(`serverId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Database` (
    `id` VARCHAR(191) NOT NULL,
    `serverId` VARCHAR(191) NOT NULL,
    `nodeId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `host` VARCHAR(191) NOT NULL,
    `port` INTEGER NOT NULL DEFAULT 3306,
    `remote` VARCHAR(191) NOT NULL DEFAULT '%',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Database_serverId_idx`(`serverId`),
    UNIQUE INDEX `Database_nodeId_name_key`(`nodeId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApplicationApiKey` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `prefix` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `scopes` TEXT NOT NULL,
    `note` VARCHAR(191) NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `ApplicationApiKey_tokenHash_key`(`tokenHash`),
    INDEX `ApplicationApiKey_prefix_idx`(`prefix`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlanTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `priceCents` INTEGER NOT NULL DEFAULT 0,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'EUR',
    `maxServers` INTEGER NOT NULL DEFAULT 1,
    `maxMemoryMb` INTEGER NOT NULL DEFAULT 4096,
    `maxDatabases` INTEGER NOT NULL DEFAULT 3,
    `defaultMemoryMb` INTEGER NOT NULL DEFAULT 4096,
    `defaultDiskMb` INTEGER NOT NULL DEFAULT 10240,
    `autoCreateServer` BOOLEAN NOT NULL DEFAULT false,
    `defaultServerType` VARCHAR(191) NOT NULL DEFAULT 'PAPER',
    `defaultMcVersion` VARCHAR(191) NOT NULL DEFAULT '1.21.1',
    `recurringInterval` VARCHAR(191) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PlanTemplate_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `mollieId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NULL,
    `status` ENUM('OPEN', 'PENDING', 'PAID', 'FAILED', 'CANCELED', 'EXPIRED') NOT NULL DEFAULT 'OPEN',
    `amountCents` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'EUR',
    `description` VARCHAR(191) NOT NULL,
    `checkoutUrl` TEXT NULL,
    `provisioned` BOOLEAN NOT NULL DEFAULT false,
    `provisionedAt` DATETIME(3) NULL,
    `metadata` TEXT NULL,
    `subscriptionId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Payment_mollieId_key`(`mollieId`),
    INDEX `Payment_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `Payment_status_idx`(`status`),
    INDEX `Payment_subscriptionId_idx`(`subscriptionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BillingSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NULL,
    `mollieSubscriptionId` VARCHAR(191) NULL,
    `interval` VARCHAR(191) NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'EUR',
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `metadata` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `canceledAt` DATETIME(3) NULL,

    UNIQUE INDEX `BillingSubscription_mollieSubscriptionId_key`(`mollieSubscriptionId`),
    INDEX `BillingSubscription_userId_idx`(`userId`),
    INDEX `BillingSubscription_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AppPassword` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `prefix` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `AppPassword_tokenHash_key`(`tokenHash`),
    INDEX `AppPassword_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Server` ADD CONSTRAINT `Server_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Server` ADD CONSTRAINT `Server_nodeId_fkey` FOREIGN KEY (`nodeId`) REFERENCES `Node`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerModerationEvent` ADD CONSTRAINT `PlayerModerationEvent_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `Server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Allocation` ADD CONSTRAINT `Allocation_nodeId_fkey` FOREIGN KEY (`nodeId`) REFERENCES `Node`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Allocation` ADD CONSTRAINT `Allocation_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `Server`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityEvent` ADD CONSTRAINT `ActivityEvent_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `Server`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityEvent` ADD CONSTRAINT `ActivityEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApiKey` ADD CONSTRAINT `ApiKey_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailVerificationToken` ADD CONSTRAINT `EmailVerificationToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubUser` ADD CONSTRAINT `SubUser_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `Server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubUser` ADD CONSTRAINT `SubUser_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Database` ADD CONSTRAINT `Database_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `Server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Database` ADD CONSTRAINT `Database_nodeId_fkey` FOREIGN KEY (`nodeId`) REFERENCES `Node`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `PlanTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `BillingSubscription`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BillingSubscription` ADD CONSTRAINT `BillingSubscription_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BillingSubscription` ADD CONSTRAINT `BillingSubscription_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `PlanTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AppPassword` ADD CONSTRAINT `AppPassword_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

