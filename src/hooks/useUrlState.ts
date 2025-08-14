import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { z, type ZodSchema } from "zod";

type AnyRecord = Record<string, unknown>;
type UpdateOptions = { replace?: boolean };
type UseUrlStateOptions = { debounceMs?: number };

function toSearchParams(obj: AnyRecord) {
  const sp = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    if (Array.isArray(v)) v.forEach((item) => sp.append(k, String(item)));
    else if (typeof v === "object") sp.set(k, JSON.stringify(v));
    else sp.set(k, String(v));
  });
  return sp;
}

function fromSearchParams(sp: URLSearchParams): AnyRecord {
  const out: AnyRecord = {};
  sp.forEach((val, key) => {
    try {
      out[key] = JSON.parse(val);
      return;
    } catch {
      if (!Number.isNaN(Number(val)) && val.trim() !== "") {
        out[key] = Number(val);
        return;
      }
      if (val === "true" || val === "false") {
        out[key] = val === "true";
        return;
      }
      out[key] = val;
    }
  });
  return out;
}

export function useUrlState<T extends AnyRecord>(
  schema: ZodSchema<T>,
  defaults: T,
  opts: UseUrlStateOptions = {}
) {
  const { debounceMs = 180 } = opts;
  const navigate = useNavigate();
  const location = useLocation();

  const [state, setState] = useState<T>(() => {
    const initial = fromSearchParams(new URLSearchParams(location.search));
    const parsed = schema.safeParse({ ...defaults, ...initial });
    return parsed.success ? parsed.data : defaults;
  });

  const isSyncingRef = useRef(false);
  const debounceRef = useRef<number | undefined>(undefined);

  const syncUrl = useCallback(
    (next: T, { replace = true }: UpdateOptions = {}) => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        const sp = toSearchParams(next as AnyRecord);
        isSyncingRef.current = true;
        navigate({ pathname: location.pathname, search: sp.toString() }, { replace });
        isSyncingRef.current = false;
      }, debounceMs);
    },
    [navigate, location.pathname, debounceMs]
  );

  useEffect(() => {
    if (isSyncingRef.current) return;
    const current = fromSearchParams(new URLSearchParams(location.search));
    const parsed = schema.safeParse({ ...defaults, ...current });
    if (parsed.success) setState(parsed.data);
  }, [location.search, schema, defaults]);

  const set = useCallback(
    (patch: Partial<T>, options?: UpdateOptions) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        const parsed = schema.safeParse(next);
        const safeNext = parsed.success ? parsed.data : prev;
        syncUrl(safeNext, options);
        return safeNext;
      });
    },
    [schema, syncUrl]
  );

  const reset = useCallback(
    (options?: UpdateOptions) => {
      setState(defaults);
      syncUrl(defaults, options);
    },
    [defaults, syncUrl]
  );

  return useMemo(() => ({ state, set, reset }), [state, set, reset]);
}
