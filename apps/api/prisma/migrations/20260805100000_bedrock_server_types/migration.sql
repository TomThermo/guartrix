-- Add Bedrock server types (BDS stable/preview, PocketMine-MP, Nukkit).
ALTER TABLE `Server` MODIFY `type` ENUM(
  'VANILLA',
  'PAPER',
  'FABRIC',
  'FORGE',
  'PURPUR',
  'NEOFORGE',
  'QUILT',
  'BEDROCK',
  'BEDROCK_PREVIEW',
  'POCKETMINE',
  'NUKKIT'
) NOT NULL;
