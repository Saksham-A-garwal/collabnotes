import { useEffect, useState } from "react";
import type { Awareness } from "y-protocols/awareness";

export type PresenceUser = { clientId: number; name: string; color: string };

export function useAwarenessStates(awareness: Awareness | null): PresenceUser[] {
  const [states, setStates] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!awareness) {
      setStates([]);
      return;
    }

    function update() {
      const next: PresenceUser[] = [];
      awareness!.getStates().forEach((state, clientId) => {
        if (clientId === awareness!.doc.clientID) return;
        const user = (state as { user?: { name: string; color: string } }).user;
        if (user) next.push({ clientId, name: user.name, color: user.color });
      });
      setStates(next);
    }
    update();
    awareness.on("change", update);
    return () => awareness.off("change", update);
  }, [awareness]);

  return states;
}
