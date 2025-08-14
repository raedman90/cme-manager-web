import { useEffect } from "react";

export function useCyclesSSE(onMessage: (evt: MessageEvent) => void) {
  useEffect(() => {
    const ev = new EventSource(`${import.meta.env.VITE_API_URL || "http://localhost:3333"}/events/cycles`, { withCredentials: false });
    ev.addEventListener("cycle:update", onMessage as any);
    ev.onerror = () => {/* silencioso no dev */};
    return () => ev.close();
  }, [onMessage]);
}
