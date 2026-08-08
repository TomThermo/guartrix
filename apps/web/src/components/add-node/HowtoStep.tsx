import { Alert, Badge } from "react-bootstrap";

export function HowtoStep() {
  return (
    <div>
      <p className="mb-3">
        A <strong>node</strong> is a separate VPS running the Guartrix daemon. Minecraft servers run
        on that machine; the panel sends power, console, and file actions using the node token.
      </p>
      <ol className="mb-3">
        <li>
          Create an Ubuntu VPS and note its <strong>public IP</strong> (or hostname).
        </li>
        <li>
          Make sure the <strong>panel host</strong> can reach that VPS on port <code>8081</code>{" "}
          (daemon) and <code>2022</code> (SFTP) — open the firewall, or let the installer open it.
        </li>
        <li>
          Important: for Host / FQDN, use the IP/hostname the <em>panel</em> uses to reach the
          daemon (not only an internal LAN IP if the panel is external).
        </li>
        <li>
          Then install via <strong>SSH</strong> in this wizard (live log), or copy the curl command
          and run it yourself on the VPS.
        </li>
        <li>
          Click <strong>Test connection</strong> until the node is{" "}
          <Badge bg="success">ONLINE</Badge>. Then create a Minecraft server and pick this node.
        </li>
      </ol>
      <Alert variant="info" className="small mb-0">
        SSH password/key are <strong>not stored</strong> — only used for this one-time install. User
        may be <code>ubuntu</code>, <code>root</code>, or another sudo user.
      </Alert>
    </div>
  );
}
