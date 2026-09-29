"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { buildDemoSnapshot, DEMO_DEFAULT_GARAGE, DEMO_DEFAULT_USER } from "@/data/demo-data";
import { BrowserStore } from "@/lib/data/browser-store";
import type { DataStore } from "@/lib/data/store";
import { listMyGarages, servicesFor, type Services } from "@/lib/services";
import type { Garage, GarageMember, Profile } from "@/types";

export type AppMode = "demo" | "supabase";

interface AppContextValue {
  mode: AppMode;
  ready: boolean;
  error: string | null;
  store: DataStore | null;
  services: Services | null;
  profile: Profile | null;
  garage: Garage | null;
  garages: { garage: Garage; member: GarageMember }[];
  /** Mode démo : profils disponibles pour simuler une connexion. */
  demoUsers: Profile[];
  version: number;
  refresh: () => void;
  switchGarage: (garageId: string) => Promise<void>;
  switchUser: (userId: string) => Promise<void>;
  resetDemo: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const LS_USER = "mecano-ai:user";
const LS_GARAGE = "mecano-ai:garage";

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* navigation privée */
  }
}

export function AppProvider({ mode, children }: { mode: AppMode; children: ReactNode }) {
  const router = useRouter();
  const [store, setStore] = useState<DataStore | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [garageId, setGarageId] = useState<string | null>(null);
  const [services, setServices] = useState<Services | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [garage, setGarage] = useState<Garage | null>(null);
  const [garages, setGarages] = useState<{ garage: Garage; member: GarageMember }[]>([]);
  const [demoUsers, setDemoUsers] = useState<Profile[]>([]);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const browserStore = useRef<BrowserStore | null>(null);

  // Initialisation du store
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (mode === "demo") {
          const { store: s } = await BrowserStore.load(() => buildDemoSnapshot());
          if (cancelled) return;
          browserStore.current = s;
          const profiles = await s.list("profiles");
          const wantedUser = lsGet(LS_USER);
          const uid = profiles.some((p) => p.id === wantedUser) ? wantedUser! : DEMO_DEFAULT_USER;
          setDemoUsers(profiles);
          setStore(s);
          setUserId(uid);
          setGarageId(lsGet(LS_GARAGE) ?? DEMO_DEFAULT_GARAGE);
        } else {
          const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
          const { SupabaseStore } = await import("@/lib/supabase/supabase-store");
          const db = getSupabaseBrowserClient();
          const { data } = await db.auth.getSession();
          if (!data.session) {
            router.replace("/login");
            return;
          }
          if (cancelled) return;
          setStore(new SupabaseStore(db));
          setUserId(data.session.user.id);
          setGarageId(lsGet(LS_GARAGE));
        }
      } catch (e) {
        setError((e as Error).message);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, router]);

  // Contexte utilisateur / garage
  useEffect(() => {
    if (!store || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const mine = await listMyGarages(store, userId);
        const p = await store.get("profiles", userId);
        if (cancelled) return;
        setGarages(mine);
        setProfile(p);
        if (mine.length === 0) {
          setServices(null);
          setGarage(null);
          setReady(true);
          return;
        }
        const target = mine.find((g) => g.garage.id === garageId) ?? mine[0];
        if (target.garage.id !== garageId) {
          setGarageId(target.garage.id);
          return;
        }
        const svc = await servicesFor(store, userId, target.garage.id);
        if (cancelled) return;
        setServices(svc);
        setGarage(target.garage);
        setError(null);
        setReady(true);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, userId, garageId, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const switchGarage = useCallback(async (id: string) => {
    lsSet(LS_GARAGE, id);
    setGarageId(id);
  }, []);

  const switchUser = useCallback(
    async (id: string) => {
      if (mode !== "demo") return;
      lsSet(LS_USER, id);
      setUserId(id);
      setGarageId(null);
      router.push("/dashboard");
    },
    [mode, router],
  );

  const resetDemo = useCallback(async () => {
    if (!browserStore.current) return;
    await browserStore.current.replaceAll(buildDemoSnapshot());
    setDemoUsers(await browserStore.current.list("profiles"));
    toast.success("Données de démonstration réinitialisées");
    setVersion((v) => v + 1);
  }, []);

  const signOut = useCallback(async () => {
    if (mode === "supabase") {
      const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
      await getSupabaseBrowserClient().auth.signOut();
      router.replace("/login");
    }
  }, [mode, router]);

  const value = useMemo<AppContextValue>(
    () => ({ mode, ready, error, store, services, profile, garage, garages, demoUsers, version, refresh, switchGarage, switchUser, resetDemo, signOut }),
    [mode, ready, error, store, services, profile, garage, garages, demoUsers, version, refresh, switchGarage, switchUser, resetDemo, signOut],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp doit être utilisé dans <AppProvider>");
  return ctx;
}

/** Services liés au garage courant (non null une fois l'application prête). */
export function useServices(): Services {
  const { services } = useApp();
  if (!services) throw new Error("Services non initialisés");
  return services;
}

/** Charge des données via la couche métier ; se recharge automatiquement après chaque mutation. */
export function useData<T>(loader: (s: Services) => Promise<T>, deps: unknown[] = []) {
  const { services, version, refresh } = useApp();
  const [state, setState] = useState<{ data: T | undefined; error: string | null; loading: boolean }>({ data: undefined, error: null, loading: true });
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });
  const key = JSON.stringify(deps);
  useEffect(() => {
    if (!services) return;
    let alive = true;
    loaderRef
      .current(services)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e: Error) => alive && setState({ data: undefined, error: e.message, loading: false }));
    return () => {
      alive = false;
    };
  }, [services, version, key]);
  return { ...state, reload: refresh };
}

/** Exécute une mutation, affiche un toast et rafraîchit les données. */
export function useAction() {
  const { services, refresh } = useApp();
  const [pending, setPending] = useState(false);
  const run = useCallback(
    async <T,>(fn: (s: Services) => Promise<T>, success?: string): Promise<T | undefined> => {
      if (!services) return undefined;
      setPending(true);
      try {
        const res = await fn(services);
        if (success) toast.success(success);
        refresh();
        return res;
      } catch (e) {
        toast.error((e as Error).message);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [services, refresh],
  );
  return { run, pending };
}
