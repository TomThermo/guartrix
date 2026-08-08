import { useState } from "react";
import { useParams } from "react-router-dom";
import { OnlinePlayersProvider } from "../hooks/OnlinePlayersProvider";
import { ServerDetailPageInner } from "./server-detail/ServerDetailPageInner";

export function ServerDetailPage() {
  const { id = "" } = useParams();
  const [playersEnabled, setPlayersEnabled] = useState(true);
  return (
    <OnlinePlayersProvider serverId={id} enabled={Boolean(id) && playersEnabled}>
      <ServerDetailPageInner onPlayerAccessChange={setPlayersEnabled} />
    </OnlinePlayersProvider>
  );
}
