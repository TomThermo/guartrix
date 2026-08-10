import { Button, Col, Modal, Row } from "react-bootstrap";
import { AdminPageShell } from "../../components/admin/AdminPageShell";
import { ActivityPanel } from "../../components/ActivityPanel";
import { QuotasModal } from "../../components/QuotasModal";
import { CreateUserModal } from "./CreateUserModal";
import { UsersTable } from "./UsersTable";
import { useUsersPage } from "./useUsersPage";

export function UsersPage() {
  const s = useUsersPage();

  if (s.loading) {
    return (
      <AdminPageShell
        title={s.t("users.title")}
        subtitle={s.t("users.subtitle")}
        icon="fa-users-gear"
        loading
        loadingLabel={s.t("common.loading")}
      />
    );
  }

  return (
    <AdminPageShell
      title={s.t("users.title")}
      subtitle={s.t("users.subtitle")}
      icon="fa-users-gear"
      error={s.error}
      notice={s.notice}
      onDismissError={() => s.setError(null)}
      onDismissNotice={() => s.setNotice(null)}
      backTo="/"
      backLabel={s.t("common.back")}
      extraHeader={
        <Button variant="primary" size="sm" onClick={() => s.setShowCreate(true)}>
          <i className="fa-solid fa-user-plus me-1" aria-hidden />
          {s.t("users.createUser")}
        </Button>
      }
    >
      <Row className="g-4">
        <Col xs={12}>
          <UsersTable
            users={s.users}
            filtered={s.filtered}
            meId={s.me?.id}
            filter={s.filter}
            onFilterChange={s.setFilter}
            onChangeRole={s.onChangeRole}
            onQuotas={s.setQuotaUser}
            onActivity={s.setActivityUser}
            onResetTwoFactor={s.onResetTwoFactor}
            onDelete={s.onDelete}
          />
        </Col>
      </Row>

      <CreateUserModal
        show={s.showCreate}
        busy={s.busy}
        username={s.username}
        password={s.password}
        role={s.role}
        maxServers={s.maxServers}
        maxMemoryGb={s.maxMemoryGb}
        maxDatabases={s.maxDatabases}
        unlimitedServers={s.unlimitedServers}
        unlimitedRam={s.unlimitedRam}
        unlimitedDatabases={s.unlimitedDatabases}
        hostMemoryGb={s.hostMemoryGb}
        onUsernameChange={s.setUsername}
        onPasswordChange={s.setPassword}
        onRoleChange={s.setRole}
        onMaxServersChange={s.setMaxServers}
        onMaxMemoryGbChange={s.setMaxMemoryGb}
        onMaxDatabasesChange={s.setMaxDatabases}
        onUnlimitedServersChange={s.setUnlimitedServers}
        onUnlimitedRamChange={s.setUnlimitedRam}
        onUnlimitedDatabasesChange={s.setUnlimitedDatabases}
        onHide={() => s.setShowCreate(false)}
        onSubmit={s.onCreate}
      />

      {s.quotaUser && (
        <QuotasModal
          user={s.quotaUser}
          hostMemoryGb={s.hostMemoryGb}
          onCancel={() => s.setQuotaUser(null)}
          onSaved={async () => {
            s.setNotice(s.t("users.quotasUpdated", { username: s.quotaUser!.username }));
            s.setQuotaUser(null);
            await s.refresh();
          }}
        />
      )}

      {s.activityUser && (
        <Modal show onHide={() => s.setActivityUser(null)} size="xl" scrollable>
          <Modal.Header closeButton>
            <Modal.Title>
              {s.t("users.activityTitle", { username: s.activityUser.username })}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <ActivityPanel userId={s.activityUser.id} showServer onError={s.setError} />
          </Modal.Body>
        </Modal>
      )}
    </AdminPageShell>
  );
}
