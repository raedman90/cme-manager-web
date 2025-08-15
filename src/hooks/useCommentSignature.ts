import * as React from "react";

const KEY = "commentSignatureName";

export function useCommentSignature() {
  const [name, setName] = React.useState<string>(() => {
    try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
  });
  const update = React.useCallback((v: string) => {
    setName(v);
    try { localStorage.setItem(KEY, v); } catch {}
  }, []);
  return { name, setName: update };
}