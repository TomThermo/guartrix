-- Persist SSH host key fingerprint for remote-install TOFU / MITM protection.
ALTER TABLE `Node` ADD COLUMN `sshHostKeyFingerprint` VARCHAR(128) NULL;
