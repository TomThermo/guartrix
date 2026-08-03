import { useEffect, useState } from "react";
import type { McServer } from "@msm/shared";
import { addonKindFor } from "@msm/shared";
import {
  Alert,
  Button,
  Form,
  Spinner,
  Stack,
} from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";

interface SeedInfo {
  seed: string | null;
  source: "console" | "properties" | "none";
  propertiesSeed: string | null;
  consoleAvailable: boolean;
  mapUrl: string | null;
  externalMapUrl?: string | null;
  mcVersion: string;
}

interface Props {
  server: McServer;
  formSeed?: string;
  canQueryConsole: boolean;
  onNotice: (message: string | null) => void;
  onError: (message: string | null) => void;
}

/** mcseedmap.net path version: `1.21.4-Java` / `26.2.0-Java`. */
function mcseedmapVersion(mcVersion: string): string {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(mcVersion.trim());
  if (!m) return "1.21.4-Java";
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = m[3] != null ? Number(m[3]) : 0;
  return `${major}.${minor}.${patch}-Java`;
}

function mcseedmapUrl(seed: string, mcVersion: string): string {
  const version = encodeURIComponent(mcseedmapVersion(mcVersion));
  const seedSeg = encodeURIComponent(seed);
  return `https://mcseedmap.net/${version}/${seedSeg}`;
}

function chunkbaseUrl(seed: string, mcVersion: string): string {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(mcVersion.trim());
  let platform = "java_1_21";
  if (m) {
    const major = Number(m[1]);
    const minor = Number(m[2]);
    const patch = m[3] != null ? Number(m[3]) : 0;
    if (major >= 26) {
      platform =
        minor >= 3 ? "java_26_3" : minor >= 2 ? "java_26_2" : "java_26_1";
    } else if (major === 1 && minor === 21) {
      if (patch >= 5) platform = "java_1_21_5";
      else if (patch === 4) platform = "java_1_21_4";
      else platform = "java_1_21";
    } else if (major === 1 && minor === 20) platform = "java_1_20";
    else if (major === 1 && minor >= 7 && minor <= 19) {
      platform = `java_1_${minor}`;
    }
  }
  const hash = [
    `seed=${encodeURIComponent(seed)}`,
    `platform=${encodeURIComponent(platform)}`,
    "dimension=overworld",
    "showBiomes=true",
    "terrain=true",
  ].join("&");
  return `https://www.chunkbase.com/apps/seed-map#${hash}`;
}

export function WorldSeedMapCard({
  server,
  formSeed,
  canQueryConsole,
  onNotice,
  onError,
}: Props) {
  const { t } = useI18n();
  const [info, setInfo] = useState<SeedInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [bluemapBusy, setBluemapBusy] = useState(false);
  const [bluemapUrl, setBluemapUrl] = useState(server.bluemapUrl ?? "");
  const canPlugins = addonKindFor(server.type) === "plugin";

  useEffect(() => {
    setBluemapUrl(server.bluemapUrl ?? "");
  }, [server.bluemapUrl]);

  async function installBlueMap() {
    setBluemapBusy(true);
    onError(null);
    try {
      await api.installAddon(server.id, "swbUV1cr");
      const guess = `http://${window.location.hostname}:8100`;
      const updated = await api.updateServer(server.id, {
        bluemapUrl: bluemapUrl.trim() || guess,
      });
      setBluemapUrl(updated.bluemapUrl ?? guess);
      onNotice(
        "BlueMap installed. Open an extra TCP allocation for port 8100 if needed, set the live map URL below, then restart.",
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "BlueMap install failed");
    } finally {
      setBluemapBusy(false);
    }
  }

  async function saveBlueMapUrl() {
    setBluemapBusy(true);
    onError(null);
    try {
      const updated = await api.updateServer(server.id, {
        bluemapUrl: bluemapUrl.trim() || null,
      });
      setBluemapUrl(updated.bluemapUrl ?? "");
      onNotice("Live map URL saved.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save BlueMap URL");
    } finally {
      setBluemapBusy(false);
    }
  }

  const displaySeed =
    info?.seed ??
    (formSeed?.trim() || info?.propertiesSeed || null);

  const mapUrl = displaySeed
    ? mcseedmapUrl(displaySeed, server.mcVersion)
    : null;
  const externalUrl = displaySeed
    ? info?.externalMapUrl && info.seed === displaySeed
      ? info.externalMapUrl
      : chunkbaseUrl(displaySeed, server.mcVersion)
    : null;

  async function load(fromConsole: boolean) {
    setBusy(true);
    onError(null);
    try {
      const next = fromConsole
        ? await api.queryWorldSeed(server.id)
        : await api.getWorldSeed(server.id);
      setInfo(next);
      setIframeKey((k) => k + 1);
      if (fromConsole && next.seed) {
        onNotice(`World seed from console: ${next.seed}`);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not load world seed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load(false);
  }, [server.id]);

  async function copySeed() {
    if (!displaySeed) return;
    try {
      await navigator.clipboard.writeText(displaySeed);
      onNotice("Seed copied.");
    } catch {
      onError("Could not copy seed");
    }
  }

  return (
    <Alert variant="light" className="border mt-3 mb-0 world-seed-map-card">
      <div className="fw-semibold mb-2">
        <i className="fa-solid fa-map-location-dot me-2" />
        {t("seedmap.title")}
      </div>
      <p className="small text-secondary mb-2">
        Interactive biome &amp; structure map via{" "}
        <a href="https://mcseedmap.net/" target="_blank" rel="noreferrer">
          mcseedmap.net
        </a>
        . Prefer <code>/seed</code> from a running server when{" "}
        <code>level-seed</code> is empty. Chunkbase opens in a new tab if you
        want their UI instead.
      </p>

      <Form.Group className="mb-2" controlId={`world-seed-display-${server.id}`}>
        <Form.Label className="small mb-1">Seed</Form.Label>
        <Stack direction="horizontal" gap={2}>
          <Form.Control
            readOnly
            value={displaySeed ?? ""}
            placeholder={
              info?.consoleAvailable
                ? "Unknown — query from console"
                : "Empty (random) until first start or set in Server Properties"
            }
          />
          <Button
            size="sm"
            variant="outline-secondary"
            disabled={!displaySeed}
            onClick={() => void copySeed()}
            title="Copy seed"
          >
            <i className="fa-regular fa-copy" />
          </Button>
        </Stack>
        {info?.source && info.source !== "none" && (
          <Form.Text muted>
            Source:{" "}
            {info.source === "console" ? "console /seed" : "server.properties"}
          </Form.Text>
        )}
      </Form.Group>

      <Stack direction="horizontal" gap={2} className="flex-wrap mb-2">
        {canQueryConsole && (
          <Button
            size="sm"
            variant="outline-primary"
            disabled={busy || !info?.consoleAvailable}
            onClick={() => void load(true)}
          >
            {busy ? (
              <Spinner size="sm" />
            ) : (
              <>
                <i className="fa-solid fa-terminal me-1" />
                Get seed from console
              </>
            )}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline-secondary"
          disabled={busy}
          onClick={() => void load(false)}
        >
          Refresh seed
        </Button>
        {mapUrl && (
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => setIframeKey((k) => k + 1)}
          >
            Reload map
          </Button>
        )}
        {mapUrl && (
          <Button
            size="sm"
            variant="link"
            className="px-1"
            href={mapUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open mcseedmap ↗
          </Button>
        )}
        {externalUrl && (
          <Button
            size="sm"
            variant="link"
            className="px-1"
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open Chunkbase ↗
          </Button>
        )}
      </Stack>

      {displaySeed && mapUrl ? (
        <div className="world-seed-map-embed-wrap">
          <iframe
            key={iframeKey}
            title={`Seed map ${displaySeed}`}
            src={mapUrl}
            className="world-seed-map-iframe"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            referrerPolicy="no-referrer-when-downgrade"
            allow="fullscreen"
          />
        </div>
      ) : (
        <div className="world-seed-map-empty small text-secondary">
          {busy ? (
            <>
              <Spinner size="sm" className="me-2" /> Loading seed…
            </>
          ) : (
            <>
              No seed yet. Set <code>level-seed</code> under Server Properties →
              World, or start the server and use{" "}
              <strong>Get seed from console</strong>.
            </>
          )}
        </div>
      )}

      {canPlugins && (
        <div className="border-top mt-3 pt-3">
          <div className="fw-semibold mb-1">
            <i className="fa-solid fa-map me-2" />
            Live world map (BlueMap)
          </div>
          <p className="small text-secondary mb-2">
            Install BlueMap for explored-chunk rendering inside the game server.
            Expose port <code>8100</code> (Network tab) and paste the public URL.
          </p>
          <Stack direction="horizontal" gap={2} className="flex-wrap mb-2">
            <Button
              size="sm"
              variant="outline-primary"
              disabled={bluemapBusy}
              onClick={() => void installBlueMap()}
            >
              {bluemapBusy ? <Spinner size="sm" /> : "Install BlueMap"}
            </Button>
            {bluemapUrl && (
              <Button
                size="sm"
                variant="link"
                className="px-1"
                href={bluemapUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open live map ↗
              </Button>
            )}
          </Stack>
          <Stack direction="horizontal" gap={2} className="flex-wrap">
            <Form.Control
              size="sm"
              value={bluemapUrl}
              onChange={(e) => setBluemapUrl(e.target.value)}
              placeholder="http://your-host:8100"
              style={{ maxWidth: 360 }}
            />
            <Button
              size="sm"
              variant="outline-secondary"
              disabled={bluemapBusy}
              onClick={() => void saveBlueMapUrl()}
            >
              {t("common.save")}
            </Button>
          </Stack>
          {bluemapUrl && (
            <div className="world-seed-map-embed-wrap mt-3">
              <iframe
                title="BlueMap live map"
                src={/^https?:\/\//i.test(bluemapUrl.trim()) ? bluemapUrl.trim() : undefined}
                className="world-seed-map-iframe"
                loading="lazy"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                referrerPolicy="no-referrer"
                allow="fullscreen"
              />
            </div>
          )}
        </div>
      )}
    </Alert>
  );
}
