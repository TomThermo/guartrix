import { Link } from "react-router-dom";
import { useState } from "react";
import { Alert, Card, Offcanvas, Spinner } from "react-bootstrap";
import { UpdateBanner } from "../../components/UpdateBanner";
import { ServerIconModal } from "../../components/ServerIconModal";
import { ServerDetailHeader } from "../../components/server-detail/ServerDetailHeader";
import { ServerDetailSideNav } from "../../components/server-detail/ServerDetailSideNav";
import { ServerDetailModals } from "../../components/server-detail/ServerDetailModals";
import { ServerDetailTabs } from "../../components/server-detail/ServerDetailTabs";
import { useServerDetailData } from "./useServerDetailData";

export function ServerDetailPageInner({
  onPlayerAccessChange,
}: {
  onPlayerAccessChange: (enabled: boolean) => void;
}) {
  const d = useServerDetailData({ onPlayerAccessChange });
  const [showIconModal, setShowIconModal] = useState(false);

  if (!d.server && !d.error) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );
  }
  if (!d.server) {
    return (
      <Alert variant="danger">
        {d.error} <Link to="/">Back</Link>
      </Alert>
    );
  }

  const server = d.server;

  const sideNav = (opts?: { onPick?: () => void }) => (
    <ServerDetailSideNav
      activeTab={d.tab}
      menuSections={d.menuSections}
      onChangeTab={d.changeTab}
      onPick={opts?.onPick}
      whitelistOn={d.whitelistOn}
      isRunning={d.isRunning}
      addonUpdateCount={d.addonUpdateCount}
      isOwner={d.isOwner}
      busy={d.busy}
      onDelete={() => d.setShowDelete(true)}
    />
  );

  return (
    <>
      <ServerDetailHeader
        server={server}
        connectInfo={d.connectInfo}
        online={d.online}
        isAdmin={d.isAdmin}
        canClone={d.canClone}
        busy={d.busy}
        whitelistOn={d.whitelistOn}
        supportsAddons={d.supportsAddons}
        addonUpdateCount={d.addonUpdateCount}
        can={d.can}
        canPowerStart={d.canPowerStart}
        canPowerStop={d.canPowerStop}
        canPowerKill={d.canPowerKill}
        canPowerRestart={d.canPowerRestart}
        onOpenMobileNav={() => d.setMobileNavOpen(true)}
        onCopyConnect={() => void d.copyConnect()}
        onChangeTab={d.changeTab}
        onShowTransfer={() => d.setShowTransfer(true)}
        onShowWhitelistModal={() => d.setShowWhitelistModal(true)}
        onShowVersionPicker={() => d.setShowVersionPicker(true)}
        onShowChangeType={() => d.setShowChangeType(true)}
        onShowClone={() => d.setShowClone(true)}
        onShowReinstall={() => d.setShowReinstall(true)}
        onShowNodeTransfer={() => d.setShowNodeTransfer(true)}
        onRequestStart={d.requestStart}
        onStop={() => void d.act("stop")}
        onKill={() => d.setKillPrompt(true)}
        onRestart={() => void d.act("restart")}
        onEditIcon={() => setShowIconModal(true)}
      />

      <ServerIconModal
        show={showIconModal}
        serverId={server.id}
        hasIcon={Boolean(server.hasIcon)}
        onHide={() => setShowIconModal(false)}
        onChanged={(next) => {
          d.setServer({ ...server, hasIcon: next, updatedAt: new Date().toISOString() });
        }}
        onError={d.setError}
        onNotice={d.setNotice}
      />

      <ServerDetailModals
        server={server}
        busy={d.busy}
        whitelistPrompt={d.whitelistPrompt}
        showWhitelistModal={d.showWhitelistModal}
        killPrompt={d.killPrompt}
        showClone={d.showClone}
        showReinstall={d.showReinstall}
        showChangeType={d.showChangeType}
        showVersionPicker={d.showVersionPicker}
        showTransfer={d.showTransfer}
        showNodeTransfer={d.showNodeTransfer}
        showDelete={d.showDelete}
        onSetWhitelistPrompt={d.setWhitelistPrompt}
        onSetShowWhitelistModal={d.setShowWhitelistModal}
        onSetKillPrompt={d.setKillPrompt}
        onSetShowClone={d.setShowClone}
        onSetShowReinstall={d.setShowReinstall}
        onSetShowChangeType={d.setShowChangeType}
        onSetShowVersionPicker={d.setShowVersionPicker}
        onSetShowTransfer={d.setShowTransfer}
        onSetShowNodeTransfer={d.setShowNodeTransfer}
        onSetShowDelete={d.setShowDelete}
        onAct={d.act}
        onSetServer={d.setServer}
        onSetError={d.setError}
        onSetNotice={d.setNotice}
        onRefreshUser={d.refreshUser}
        onNavigate={d.navigate}
        onLoad={d.load}
      />

      {d.error && (
        <Alert variant="danger" dismissible onClose={() => d.setError(null)}>
          {d.error}
        </Alert>
      )}
      {d.notice && (
        <Alert variant="success" dismissible onClose={() => d.setNotice(null)}>
          {d.notice}
        </Alert>
      )}
      {server.errorMessage &&
        server.status === "ERROR" &&
        !/already running/i.test(server.errorMessage) && (
          <Alert variant="danger" className="mb-3">
            <div className="fw-semibold mb-1">Start failed</div>
            <div className="mb-0">{server.errorMessage}</div>
            <div className="small text-secondary mt-2 mb-0">See the Console for details.</div>
          </Alert>
        )}

      <UpdateBanner
        server={server}
        onUpdated={(s) => {
          d.setServer((prev) => (prev ? { ...prev, ...s } : prev));
        }}
        onError={d.setError}
        onNotice={d.setNotice}
      />

      <Card className="server-detail-card">
        <div className="server-detail-layout">
          <aside className="server-side-nav">{sideNav()}</aside>

          <div className="server-detail-panel">
            <Offcanvas
              show={d.mobileNavOpen}
              onHide={() => d.setMobileNavOpen(false)}
              placement="start"
              className="server-mobile-offcanvas"
            >
              <Offcanvas.Header closeButton>
                <Offcanvas.Title>Menu</Offcanvas.Title>
              </Offcanvas.Header>
              <Offcanvas.Body className="pt-0">
                {sideNav({ onPick: () => d.setMobileNavOpen(false) })}
              </Offcanvas.Body>
            </Offcanvas>

            <Card.Body className="server-detail-body">
              <ServerDetailTabs
                tab={d.tab}
                server={server}
                id={d.id}
                perms={d.perms}
                connectInfo={d.connectInfo}
                systemInfo={d.systemInfo}
                busy={d.busy}
                consoleNotices={d.consoleNotices}
                canPowerStart={d.canPowerStart}
                canPowerStop={d.canPowerStop}
                canPowerKill={d.canPowerKill}
                canPowerRestart={d.canPowerRestart}
                can={d.can}
                onStatus={d.onStatus}
                onRequestStart={d.requestStart}
                onAct={d.act}
                onSetKillPrompt={d.setKillPrompt}
                onSetServer={d.setServer}
                onSetError={d.setError}
                onSetNotice={d.setNotice}
                onSetAddonUpdateCount={d.setAddonUpdateCount}
              />
            </Card.Body>
          </div>
        </div>
      </Card>
    </>
  );
}
