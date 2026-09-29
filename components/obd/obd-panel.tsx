"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Bluetooth, CircleAlert, Cpu, Eraser, Loader2, Pause, Play, Plug, PlugZap, RefreshCw, Save, Unplug } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { toast } from "sonner";
import { useApp } from "@/components/app/app-provider";
import { useMounted } from "@/components/app/use-mounted";
import { ConfirmDialog, NativeSelect, Pill } from "@/components/app/common";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { getObdService } from "@/lib/obd/obd-service";
import { bluetoothSupportMessage } from "@/lib/obd/bluetooth-obd-provider";
import { LIVE_DATA_LABELS } from "@/lib/obd/obd-parser";
import { SIMULATOR_SCENARIOS, SIMULATOR_VEHICLES } from "@/lib/obd/simulator-obd-provider";
import { cn } from "@/lib/utils";
import type { Vehicle, VehicleLiveData } from "@/types";

const STATUS = {
  disconnected: { dot: "🔴", label: "Déconnecté", cls: "text-muted-foreground" },
  connecting: { dot: "🔵", label: "Connexion…", cls: "text-info" },
  connected: { dot: "🟢", label: "Connecté", cls: "text-success" },
  error: { dot: "🔴", label: "Erreur", cls: "text-destructive" },
} as const;

export function useObdState() {
  const obd = getObdService();
  return useSyncExternalStore(obd.subscribe, obd.getSnapshot, obd.getSnapshot);
}

/**
 * Panneau de connexion OBD. Toute la logique matérielle vit dans lib/obd (ObdService) :
 * ce composant ne fait qu'afficher l'état et déclencher des actions.
 */
export function ObdPanel({
  vehicle,
  onCodes,
  onLive,
  compact,
}: {
  vehicle?: Vehicle | null;
  onCodes?: (codes: string[], sessionId?: string) => void;
  onLive?: (data: VehicleLiveData, sessionId?: string) => void;
  compact?: boolean;
}) {
  const obd = getObdService();
  const state = useObdState();
  const { services, refresh } = useApp();
  const [confirmClear, setConfirmClear] = useState(false);
  const [matched, setMatched] = useState<Vehicle | null>(null);
  const mounted = useMounted();
  const btMessage = mounted ? bluetoothSupportMessage() : null;
  const st = STATUS[state.status];
  const sessionId = state.meta.sessionId;

  // Le simulateur « se branche » sur le véhicule sélectionné (VIN du véhicule si connu)
  useEffect(() => {
    if (state.status === "connected" || state.providerKind !== "SIMULATOR") return;
    if (vehicle?.vin) obd.setSimulatorVin(vehicle.vin);
  }, [vehicle?.vin, state.status, state.providerKind, obd]);

  const vin = state.vehicleInfo?.vin;
  useEffect(() => {
    if (!services || !vin) return;
    services.crm.findVehicleByVin(vin).then(setMatched).catch(() => setMatched(null));
  }, [services, vin]);

  if (!services) return null;
  const allowed = can(services.ctx, "obd:use");

  async function connect() {
    try {
      const info = await obd.connect();
      const v = vehicle ?? (info.vin ? await services!.crm.findVehicleByVin(info.vin) : null);
      const session = await services!.diagnostics.startObdSession({ vehicle_id: v?.id ?? null, provider: state.providerKind, device_name: obd.getSnapshot().deviceName ?? null, vin: info.vin ?? null });
      obd.setMeta({ sessionId: session.id, vehicleId: v?.id });
      toast.success("Boîtier OBD connecté");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function disconnect() {
    const sid = obd.getSnapshot().meta.sessionId;
    await obd.disconnect();
    if (sid) await services!.diagnostics.endObdSession(sid).catch(() => undefined);
    refresh();
  }

  async function readCodes() {
    try {
      const dtcs = await obd.readDTCs();
      const codes = dtcs.map((d) => d.code);
      if (sessionId) await services!.diagnostics.updateObdSession(sessionId, { dtcs: codes });
      toast.success(codes.length ? `${codes.length} code(s) lu(s)` : "Aucun code défaut mémorisé");
      onCodes?.(codes, sessionId);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function readLive() {
    try {
      const data = await obd.readLiveData();
      if (sessionId) await services!.diagnostics.updateObdSession(sessionId, { live: data });
      onLive?.(data, sessionId);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function saveSnapshot() {
    if (!state.live) return;
    if (sessionId) await services!.diagnostics.updateObdSession(sessionId, { live: state.live });
    onLive?.(state.live, sessionId);
    toast.success("Données live enregistrées");
  }

  async function clearCodes() {
    const codes = state.dtcs.map((d) => d.code);
    try {
      await obd.clearDTCs();
      if (sessionId) await services!.diagnostics.logDtcClear(sessionId, codes);
      toast.success("Codes effacés (action journalisée)");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const history = state.liveHistory.map((h) => ({ t: h.t, rpm: h.data.rpm ?? null }));

  return (
    <div className={cn("flex flex-col gap-4", !compact && "rounded-xl border bg-card p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Plug className="size-5 text-primary" />
          <span className="font-semibold">Connexion OBD</span>
          <span className={cn("text-sm font-medium", st.cls)}>
            {st.dot} {st.label}
          </span>
        </div>
        {state.status === "connected" && (
          <Pill tone={state.providerKind === "SIMULATOR" ? "warning" : "info"}>
            {state.providerKind === "SIMULATOR" ? "Simulateur — valeurs simulées" : state.deviceName ?? "Boîtier BLE"}
          </Pill>
        )}
      </div>

      {!allowed && <p className="text-sm text-muted-foreground">Votre rôle ne permet pas d&apos;utiliser le boîtier OBD.</p>}

      {allowed && state.status !== "connected" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm sm:col-span-2">
              <button
                onClick={() => obd.setProviderKind("SIMULATOR")}
                className={cn("flex flex-1 items-center justify-center gap-2 rounded-md py-2", state.providerKind === "SIMULATOR" ? "bg-background font-medium" : "text-muted-foreground")}
              >
                <Cpu className="size-4" /> Simulateur
              </button>
              <button
                onClick={() => obd.setProviderKind("BLUETOOTH")}
                className={cn("flex flex-1 items-center justify-center gap-2 rounded-md py-2", state.providerKind === "BLUETOOTH" ? "bg-background font-medium" : "text-muted-foreground")}
              >
                <Bluetooth className="size-4" /> Boîtier Bluetooth (BLE)
              </button>
            </div>
            {state.providerKind === "SIMULATOR" ? (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Scénario</span>
                  <NativeSelect value={state.scenarioId} onChange={(e) => obd.setScenario(e.target.value)}>
                    {SIMULATOR_SCENARIOS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Véhicule simulé (VIN)</span>
                  <NativeSelect value={state.simulatorVin ?? SIMULATOR_VEHICLES[0].vin} onChange={(e) => obd.setSimulatorVin(e.target.value)}>
                    {vehicle?.vin && !SIMULATOR_VEHICLES.some((v) => v.vin === vehicle.vin) && <option value={vehicle.vin}>{`${vehicle.make} ${vehicle.model} (véhicule sélectionné)`}</option>}
                    {SIMULATOR_VEHICLES.map((v) => (
                      <option key={v.vin} value={v.vin}>
                        {v.label}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              </>
            ) : (
              <div className="rounded-lg border border-info/30 bg-info/10 p-3 text-xs text-info sm:col-span-2">
                {btMessage ?? "Compatible avec les adaptateurs ELM327 / STN en Bluetooth Low Energy. Les boîtiers Bluetooth « Classic » ne sont pas accessibles depuis un navigateur."}
              </div>
            )}
          </div>
          <ol className="grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-5">
            {["Mettre le contact", "Brancher le boîtier OBD", "Activer Bluetooth", "Sélectionner le boîtier", "Connecter"].map((step, i) => (
              <li key={step} className="flex items-center gap-2 rounded-lg border px-2 py-1.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          {state.error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" /> {state.error}
            </div>
          )}
          <Button size="lg" className="h-14 text-base font-bold" onClick={connect} disabled={state.status === "connecting" || (state.providerKind === "BLUETOOTH" && !!btMessage)}>
            {state.status === "connecting" ? <Loader2 className="size-5 animate-spin" /> : <PlugZap className="size-5" />}
            {state.status === "connecting" ? "CONNEXION…" : "CONNECTER"}
          </Button>
        </>
      )}

      {allowed && state.status === "connected" && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">VIN</div>
              <div className="mt-1 font-mono text-sm">{vin ?? "Non communiqué par le véhicule"}</div>
              {matched ? (
                <Link href={`/vehicles/${matched.id}`} className="mt-1 block text-xs text-success hover:underline">
                  ✓ {matched.make} {matched.model} · {matched.registration}
                </Link>
              ) : (
                vin && <div className="mt-1 text-xs text-warning">VIN non associé à un véhicule du garage</div>
              )}
              {vehicle && vin && vehicle.vin && vehicle.vin !== vin && <div className="mt-1 text-xs text-destructive">⚠️ Le VIN lu ne correspond pas au véhicule sélectionné</div>}
              <div className="mt-2 text-[11px] text-muted-foreground">{state.vehicleInfo?.protocol}</div>
            </div>
            <div className="rounded-lg border p-3 md:col-span-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">DTC — codes défaut</div>
                <Button size="sm" variant="secondary" onClick={readCodes} disabled={state.busy}>
                  <RefreshCw className={cn("size-3.5", state.busy && "animate-spin")} /> Lire les codes
                </Button>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {!state.dtcsReadAt && <span className="text-sm text-muted-foreground">Codes non lus.</span>}
                {state.dtcsReadAt && state.dtcs.length === 0 && <span className="text-sm text-success">Aucun code défaut mémorisé.</span>}
                {state.dtcs.map((d) => (
                  <div key={d.code} className="flex items-center gap-2 text-sm">
                    <span className="rounded bg-destructive/15 px-1.5 py-0.5 font-mono font-bold text-destructive">{d.code}</span>
                    <span className="text-muted-foreground">{d.description}</span>
                  </div>
                ))}
              </div>
              {state.dtcs.length > 0 && can(services.ctx, "obd:clear_dtc") && (
                <Button size="sm" variant="destructive" className="mt-3" onClick={() => setConfirmClear(true)} disabled={state.busy}>
                  <Eraser className="size-3.5" /> Effacer les codes
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Live Data</div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={readLive} disabled={state.busy || state.streaming}>
                  <RefreshCw className="size-3.5" /> Lire
                </Button>
                {state.streaming ? (
                  <Button size="sm" variant="secondary" onClick={() => obd.stopLive()}>
                    <Pause className="size-3.5" /> Pause
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => obd.startLive()}>
                    <Play className="size-3.5" /> Temps réel
                  </Button>
                )}
                {state.live && (
                  <Button size="sm" onClick={saveSnapshot}>
                    <Save className="size-3.5" /> Enregistrer
                  </Button>
                )}
              </div>
            </div>
            {state.live ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {(Object.keys(LIVE_DATA_LABELS) as (keyof VehicleLiveData)[])
                  .filter((k) => state.live?.[k] !== undefined)
                  .map((k) => (
                    <div key={k} className="rounded-lg bg-muted/50 p-2">
                      <div className="truncate text-[11px] text-muted-foreground">{LIVE_DATA_LABELS[k].label}</div>
                      <div className="text-lg font-semibold tabular-nums">
                        {state.live![k]} <span className="text-xs font-normal text-muted-foreground">{LIVE_DATA_LABELS[k].unit}</span>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune donnée live lue.</p>
            )}
            {history.length > 2 && (
              <div className="mt-3 h-20">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history}>
                    <YAxis hide domain={["dataMin - 50", "dataMax + 50"]} />
                    <Line type="monotone" dataKey="rpm" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="text-center text-[11px] text-muted-foreground">Régime moteur (tr/min) — {history.length} mesures</div>
              </div>
            )}
          </div>

          <Button variant="outline" onClick={disconnect}>
            <Unplug className="size-4" /> Déconnecter
          </Button>
        </>
      )}

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Confirmer"
        confirmLabel="Effacer les codes"
        description={
          <span>
            L&apos;effacement des codes <b>ne répare pas</b> la cause du défaut.
            <br />
            Les codes {state.dtcs.map((d) => d.code).join(", ")} seront effacés et l&apos;action sera journalisée.
            <br />
            Continuer ?
          </span>
        }
        onConfirm={clearCodes}
      />
    </div>
  );
}
