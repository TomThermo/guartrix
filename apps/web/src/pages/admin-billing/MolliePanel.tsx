import { AdminPanelCard } from "../../components/admin/AdminPageShell";

export function MolliePanel({ configured, testMode }: { configured: boolean; testMode: boolean }) {
  return (
    <AdminPanelCard title="Mollie" icon="fa-credit-card">
      <p className="small text-secondary mb-0">
        {configured
          ? `Configured${testMode ? " (test mode)" : " (live)"}. Webhook: /api/public/billing/mollie`
          : "Set MOLLIE_API_KEY in .env (test_… or live_…) and restart the panel."}
      </p>
    </AdminPanelCard>
  );
}
