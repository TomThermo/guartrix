function headUrl(name: string, uuid: string | null | undefined, size = 32): string {
  const key = uuid?.replace(/-/g, "") || name;
  return `https://mc-heads.net/avatar/${encodeURIComponent(key)}/${size}`;
}

export function PlayerHead({
  uuid,
  name,
  size = 32,
  offline = false,
  title,
}: {
  uuid?: string | null;
  name: string;
  size?: number;
  offline?: boolean;
  /** Pass `null` to hide the native browser tooltip. */
  title?: string | null;
}) {
  return (
    <img
      className={`player-head${offline ? " offline" : ""}`}
      src={headUrl(name, uuid, size)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      title={title === null ? undefined : (title ?? name)}
    />
  );
}
