/** Shared helper for daemon WebSocket routes (console, events, mysql log stream). */
export function sendJson(socket: { send: (data: string) => void }, payload: unknown): void {
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    // closed
  }
}
