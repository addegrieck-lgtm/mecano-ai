"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { applyLocal, enqueue, type ClientOp, type MissionView } from "@/lib/offline/queue";
import { initOfflineStore, listPendingFiles, loadQueue, loadSnapshot, removePendingFile, saveQueue, savePendingFile, saveSnapshot } from "@/lib/offline/store";
import { reencodeImage } from "@/lib/offline/image";
import { computeMissing } from "@/lib/reports/missing";
import { isVisible, type Field, type ItemType, type TemplateDefinition } from "@/lib/reports/template-schema";
import { btnClass, Badge } from "@/components/ui";
import { cx, fmtDateTime, toDateTimeLocal } from "@/lib/format";
import { FieldInput, TextArea } from "./field-input";
import { snapshotMissionAction, statusMissionAction } from "@/app/(app)/missions/actions";

const STATUSES: Record<string, string> = {
  BROUILLON: "Brouillon",
  EN_SAISIE: "En cours de saisie",
  A_COMPLETER: "À compléter",
  PRET_RELECTURE: "Prêt pour relecture",
  PRET_OUTIL_OFFICIEL: "Prêt à finaliser dans l'outil officiel",
  ARCHIVE: "Archivé",
};

type Attachment = { id: string; kind: string; filename: string; mime: string; size: number; itemId: string | null; observationId: string | null; caption: string | null; pending?: boolean; localUrl?: string };
type Full = MissionView & {
  mission: MissionView["mission"] & { id: string; title: string; status: string; version: number; clientId: string | null; siteId: string | null; inspectorId: string | null; scheduledAt: string | null; address: string | null; internalRef: string | null; generalNotes: string | null; domain: string };
  definition: TemplateDefinition;
  template: { name: string; version: number } | null;
  attachments: Attachment[];
  snapshots: { id: string; label: string; missionVersion: number; createdAt: string; author: string | null }[];
  canEdit: boolean;
  canExport: boolean;
  canReassign: boolean;
  allowDictation: boolean;
  userId: string;
  members: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  sites: { id: string; clientId: string; name: string }[];
};
type ConflictEntry = { op: ClientOp; message?: string; conflicts?: { key: string; base: unknown; server: unknown; mine: unknown }[]; server?: unknown };

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export function MissionEditor({ missionId, userId, listHref }: { missionId: string; userId: string; listHref: string }) {
  const [server, setServer] = useState<Full | null>(null);
  const [queue, setQueueState] = useState<ClientOp[]>([]);
  const queueRef = useRef<ClientOp[]>([]);
  const inFlight = useRef<Set<string>>(new Set());
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [rejections, setRejections] = useState<string[]>([]);
  const [sync, setSync] = useState<"idle" | "saving" | "offline" | "error" | "auth">("idle");
  const [loadState, setLoadState] = useState<"loading" | "online" | "cache" | "error">("loading");
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [pendingFiles, setPendingFiles] = useState<Attachment[]>([]);
  const [tab, setTab] = useState<"mission" | "items" | "observations" | "draft">("mission");
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [storeReady, setStoreReady] = useState(false);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setQueue = useCallback((q: ClientOp[]) => {
    queueRef.current = q;
    setQueueState(q);
  }, []);

  const local = useMemo(() => {
    if (!server) return null;
    const label = (t: string) => server.definition.measurementTypes.find((m) => m.key === t)?.label ?? t;
    return queue.reduce((v, op) => applyLocal(v, op, label), server as MissionView) as Full;
  }, [server, queue]);

  const refreshPendingFiles = useCallback(async () => {
    try {
      const files = await listPendingFiles(missionId);
      setPendingFiles(files.map((f) => ({ id: f.id, kind: f.kind, filename: f.filename, mime: f.mime, size: f.data.byteLength, itemId: f.itemId, observationId: f.observationId, caption: f.caption, pending: true, localUrl: URL.createObjectURL(new Blob([f.data], { type: f.mime })) })));
    } catch {
      /* stockage local indisponible */
    }
  }, [missionId]);

  const fetchServer = useCallback(async (): Promise<boolean> => {
    try {
      const r = await fetch(`/api/missions/${missionId}`, { cache: "no-store" });
      if (r.status === 401) {
        setSync("auth");
        return false;
      }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setNotice(j.error ?? `Erreur ${r.status}`);
        setLoadState((s) => (s === "loading" ? "error" : s));
        return false;
      }
      const data = (await r.json()) as Full;
      setServer(data);
      setLoadState("online");
      saveSnapshot(missionId, data).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }, [missionId]);

  const uploadPending = useCallback(async () => {
    let files: Awaited<ReturnType<typeof listPendingFiles>> = [];
    try {
      files = await listPendingFiles(missionId);
    } catch {
      return;
    }
    let uploaded = 0;
    for (const f of files) {
      const fd = new FormData();
      fd.set("id", f.id);
      fd.set("kind", f.kind);
      if (f.itemId) fd.set("itemId", f.itemId);
      if (f.observationId) fd.set("observationId", f.observationId);
      if (f.caption) fd.set("caption", f.caption);
      fd.set("file", new File([f.data], f.filename, { type: f.mime }));
      try {
        const r = await fetch(`/api/missions/${missionId}/attachments`, { method: "POST", body: fd });
        if (r.ok) {
          await removePendingFile(f.id);
          uploaded++;
        }
        else if (r.status !== 401 && r.status < 500) {
          const j = await r.json().catch(() => ({}));
          setRejections((x) => [...x, `Photo « ${f.filename} » refusée : ${j.error ?? r.status}`]);
          await removePendingFile(f.id);
        }
      } catch {
        return;
      }
    }
    await refreshPendingFiles();
    if (uploaded) await fetchServer();
  }, [missionId, refreshPendingFiles, fetchServer]);

  const flush = useCallback(async () => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    const ops = queueRef.current.filter((o) => !inFlight.current.has(o.opId));
    if (!navigator.onLine) {
      setSync("offline");
      return;
    }
    if (!ops.length) {
      await uploadPending();
      return;
    }
    ops.forEach((o) => inFlight.current.add(o.opId));
    setSync("saving");
    try {
      const r = await fetch(`/api/missions/${missionId}/ops`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops }) });
      if (r.status === 401) {
        setSync("auth");
        return;
      }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setNotice(j.error ?? `Erreur ${r.status}`);
        setSync("error");
        return;
      }
      const { results } = (await r.json()) as { results: { opId: string; status: string; message?: string; conflicts?: ConflictEntry["conflicts"]; server?: unknown }[] };
      const done = new Set<string>();
      const newConflicts: ConflictEntry[] = [];
      const newRejections: string[] = [];
      for (const res of results) {
        done.add(res.opId);
        const op = ops.find((o) => o.opId === res.opId)!;
        if (res.status === "conflict") newConflicts.push({ op, message: res.message, conflicts: res.conflicts, server: res.server });
        if (res.status === "rejected") newRejections.push(res.message ?? "Modification refusée");
      }
      setQueue(queueRef.current.filter((o) => !done.has(o.opId)));
      if (newConflicts.length) setConflicts((c) => [...c, ...newConflicts]);
      if (newRejections.length) setRejections((x) => [...x, ...newRejections]);
      await fetchServer();
      await uploadPending();
      setLastSync(Date.now());
      setSync("idle");
    } catch {
      setSync("offline");
    } finally {
      ops.forEach((o) => inFlight.current.delete(o.opId));
    }
  }, [missionId, fetchServer, uploadPending, setQueue]);

  // Initialisation : stockage chiffré, file locale, données serveur (ou copie locale hors ligne)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await initOfflineStore(userId).catch(() => false);
      if (cancelled) return;
      setStoreReady(ok);
      if (ok) {
        const q = await loadQueue<ClientOp>(missionId);
        queueRef.current = q;
        setQueueState(q);
        await refreshPendingFiles();
      }
      const online = await fetchServer();
      if (!online && ok) {
        const snap = await loadSnapshot<Full>(missionId);
        if (snap) {
          setServer(snap.data);
          setLoadState("cache");
          setNotice(`Hors connexion : copie locale du ${fmtDateTime(new Date(snap.savedAt))}. Vos modifications sont enregistrées (chiffrées) sur cet appareil et seront synchronisées au retour du réseau.`);
        } else setLoadState((s) => (s === "loading" ? "error" : s));
      }
      if (online && queueRef.current.length) flush();
    })();
    const onOnline = () => {
      setNotice(null);
      flush();
    };
    const onOffline = () => setSync("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId, userId]);

  useEffect(() => {
    if (storeReady) saveQueue(missionId, queue).catch(() => {});
  }, [storeReady, missionId, queue]);

  const push = useCallback(
    (op: ClientOp) => {
      setQueue(enqueue(queueRef.current, op, inFlight.current));
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(() => flush(), 1200);
    },
    [flush, setQueue],
  );

  /** Valeur de référence d'un champ : dernière valeur envoyée/en file, sinon valeur serveur. */
  const baseFor = (kind: "patchMission" | "patchItem", key: string, itemId?: string) => {
    for (let i = queueRef.current.length - 1; i >= 0; i--) {
      const q = queueRef.current[i];
      if (q.kind === kind && (kind === "patchMission" || (q.kind === "patchItem" && q.itemId === itemId)) && key in (q as { changes: Record<string, unknown> }).changes)
        return (q as { changes: Record<string, { value: unknown }> }).changes[key].value;
    }
    if (!server) return null;
    if (kind === "patchMission") {
      if (key.startsWith("data.")) return server.mission.data[key.slice(5)] ?? null;
      if (key === "checklist") return server.definition.checklist.map((_, i) => (server.mission.data._checklist as boolean[] | undefined)?.[i] === true);
      return (server.mission as Record<string, unknown>)[key] ?? null;
    }
    const it = server.items.find((x) => x.id === itemId);
    if (!it) {
      // Élément créé localement, pas encore connu du serveur : la référence est sa valeur de création.
      const created = queueRef.current.find((q) => q.kind === "createItem" && q.itemId === itemId) as Extract<ClientOp, { kind: "createItem" }> | undefined;
      if (!created) return null;
      if (key === "label") return created.label;
      if (key === "position") return created.position ?? null;
      if (key === "pendingFields") return [];
      if (key.startsWith("data.")) return created.data?.[key.slice(5)] ?? null;
      return null;
    }
    return key.startsWith("data.") ? (it.data[key.slice(5)] ?? null) : ((it as Record<string, unknown>)[key] ?? null);
  };

  const patchMission = (key: string, value: unknown) => push({ opId: uuid(), kind: "patchMission", changes: { [key]: { base: baseFor("patchMission", key), value } }, clientCreatedAt: now() });
  const patchItem = (itemId: string, key: string, value: unknown) => push({ opId: uuid(), kind: "patchItem", itemId, changes: { [key]: { base: baseFor("patchItem", key, itemId), value } }, clientCreatedAt: now() });

  if (loadState === "loading") return <div className="card p-6 text-sm text-slate-500">Chargement du dossier…</div>;
  if (!local || !server) return <div className="card p-6 text-sm text-red-700">{notice ?? "Dossier inaccessible (hors connexion et aucune copie locale sur cet appareil)."}</div>;

  const def = local.definition;
  const m = local.mission;
  const editable = local.canEdit;
  const attachments = [...local.attachments, ...pendingFiles];
  const missing = computeMissing({ mission: m as never, definition: def, items: local.items as never, observations: local.observations as never, attachments });
  const blocking = missing.filter((x) => x.level === "bloquant");
  const pendingCount = queue.length + pendingFiles.length;

  return (
    <div className="space-y-4">
      {/* Bandeau d'état de sauvegarde / synchronisation */}
      <div className="no-print sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white/95 px-4 py-2 text-sm backdrop-blur sm:-mx-6 sm:px-6 lg:top-[49px] dark:border-slate-800 dark:bg-slate-900/95">
        <SyncBadge sync={sync} pending={pendingCount} lastSync={lastSync} cache={loadState === "cache"} />
        <span className="grow" />
        <Badge tone="blue">{STATUSES[m.status] ?? m.status}</Badge>
        <span className="text-xs text-slate-500">dossier v{m.version}{local.template ? ` · modèle « ${local.template.name} » v${local.template.version}` : ""}</span>
        {pendingCount > 0 && navigator.onLine && <button type="button" className={btnClass("secondary", "sm")} onClick={() => flush()}>Synchroniser</button>}
      </div>
      {notice && <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{notice}</div>}
      {sync === "auth" && <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">Session expirée ou révoquée : <Link className="link" href="/login">reconnectez-vous</Link>. Vos modifications non synchronisées restent chiffrées sur cet appareil.</div>}
      {!editable && <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">Lecture seule{m.status === "ARCHIVE" ? " (dossier archivé)" : ""}.</div>}

      {conflicts.length > 0 && (
        <ConflictPanel
          conflicts={conflicts}
          onKeepServer={(i) => setConflicts((c) => c.filter((_, j) => j !== i))}
          onReapply={(i) => {
            const c = conflicts[i];
            if (c.op.kind === "patchMission" || c.op.kind === "patchItem") {
              const changes: Record<string, { base: unknown; value: unknown }> = {};
              for (const x of c.conflicts ?? []) changes[x.key] = { base: x.server, value: x.mine };
              push({ ...c.op, opId: uuid(), changes } as ClientOp);
            } else if (c.op.kind === "upsertObservation") {
              push({ ...c.op, opId: uuid(), baseUpdatedAt: (c.server as { updatedAt?: string })?.updatedAt ?? null } as ClientOp);
            } else if (c.op.kind === "deleteItem") {
              push({ ...c.op, opId: uuid(), baseVersion: (c.server as { version?: number })?.version });
            }
            setConflicts((x) => x.filter((_, j) => j !== i));
          }}
        />
      )}
      {rejections.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
          <div className="font-semibold">Modifications refusées par le serveur (non enregistrées)</div>
          <ul className="list-disc pl-5">{rejections.map((r, i) => <li key={i}>{r}</li>)}</ul>
          <button type="button" className="mt-1 text-xs underline" onClick={() => setRejections([])}>Masquer</button>
        </div>
      )}

      <div className="no-print flex gap-1 overflow-x-auto" role="tablist">
        {([
          ["mission", "Mission"],
          ["items", `${def.domain === "LEVAGE" ? "Équipements" : "Installation"} (${local.items.length})`],
          ["observations", `Observations (${local.observations.length})`],
          ["draft", `Brouillon & export${blocking.length ? ` (${blocking.length} manquant${blocking.length > 1 ? "s" : ""})` : ""}`],
        ] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={cx("rounded-t-md px-4 py-2.5 text-sm font-medium whitespace-nowrap", tab === k ? "bg-white text-brand-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-brand-100 dark:ring-slate-700" : "text-slate-600 hover:bg-white/60 dark:text-slate-400")}>
            {l}
          </button>
        ))}
      </div>

      {tab === "mission" && (
        <div className="card space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Simple label="Intitulé" value={m.title} disabled={!editable} onChange={(v) => patchMission("title", v)} />
            <Simple label="Référence interne" value={m.internalRef ?? ""} disabled={!editable} onChange={(v) => patchMission("internalRef", v || null)} />
            <div>
              <label className="label" htmlFor="client">Client</label>
              <select id="client" className="input !py-2.5" disabled={!editable || !local.clients.length} value={m.clientId ?? ""} onChange={(e) => patchMission("clientId", e.target.value || null)}>
                <option value="">— Non renseigné —</option>
                {local.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="site">Site</label>
              <select id="site" className="input !py-2.5" disabled={!editable} value={m.siteId ?? ""} onChange={(e) => patchMission("siteId", e.target.value || null)}>
                <option value="">— Non renseigné —</option>
                {local.sites.filter((s) => !m.clientId || s.clientId === m.clientId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <Simple label="Adresse d'intervention" value={m.address ?? ""} disabled={!editable} onChange={(v) => patchMission("address", v || null)} />
            <div>
              <label className="label" htmlFor="sched">Date et heure</label>
              <input id="sched" type="datetime-local" className="input !py-2.5" disabled={!editable} value={toDateTimeLocal(m.scheduledAt)} onChange={(e) => patchMission("scheduledAt", e.target.value ? new Date(e.target.value).toISOString() : null)} />
            </div>
            {local.canReassign && (
              <div>
                <label className="label" htmlFor="insp">Inspecteur</label>
                <select id="insp" className="input !py-2.5" disabled={!editable} value={m.inspectorId ?? ""} onChange={(e) => patchMission("inspectorId", e.target.value || null)}>
                  <option value="">—</option>
                  {local.members.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {def.headerFields.filter((f) => isVisible(f, m.data)).map((f) => (
              <FieldInput
                key={f.key}
                field={f}
                value={m.data[f.key]}
                pending={m.pendingFields.includes(f.key)}
                disabled={!editable}
                allowDictation={local.allowDictation}
                onChange={(v) => patchMission(`data.${f.key}`, v)}
                onTogglePending={() => patchMission("pendingFields", m.pendingFields.includes(f.key) ? m.pendingFields.filter((x) => x !== f.key) : [...m.pendingFields, f.key])}
              />
            ))}
          </div>
          <div>
            <label className="label" htmlFor="notes">Notes générales</label>
            <TextArea id="notes" value={m.generalNotes ?? ""} disabled={!editable} allowDictation={local.allowDictation} onChange={(v) => patchMission("generalNotes", v || null)} rows={4} />
          </div>
          <Photos missionId={missionId} itemId={null} attachments={attachments.filter((a) => !a.itemId && !a.observationId)} editable={editable} onAdded={refreshPendingFiles} onFlush={flush} storeReady={storeReady} />
        </div>
      )}

      {tab === "items" && (
        <ItemsTab
          local={local}
          def={def}
          editable={editable}
          selected={selected}
          setSelected={setSelected}
          push={push}
          patchItem={patchItem}
          attachments={attachments}
          missionId={missionId}
          storeReady={storeReady}
          onFilesChanged={refreshPendingFiles}
          flush={flush}
        />
      )}

      {tab === "observations" && <ObservationsTab local={local} def={def} editable={editable} push={push} itemId={null} />}

      {tab === "draft" && (
        <DraftTab
          local={local}
          missing={missing}
          missionId={missionId}
          listHref={listHref}
          online={loadState === "online" && pendingCount === 0}
          onChecklist={(i, v) => {
            const cur = def.checklist.map((_, j) => (m.data._checklist as boolean[] | undefined)?.[j] === true);
            cur[i] = v;
            patchMission("checklist", cur);
          }}
          onChanged={fetchServer}
          editable={editable}
        />
      )}
    </div>
  );
}

function SyncBadge({ sync, pending, lastSync, cache }: { sync: string; pending: number; lastSync: number | null; cache: boolean }) {
  if (sync === "saving") return <span className="text-brand-600">⟳ Enregistrement…</span>;
  if (sync === "offline" || cache) return <span className="font-medium text-amber-700">● Hors ligne — {pending} modification(s) en attente, chiffrées sur l&apos;appareil</span>;
  if (sync === "error") return <span className="font-medium text-red-700">● Erreur de synchronisation — {pending} en attente</span>;
  if (sync === "auth") return <span className="font-medium text-red-700">● Session expirée</span>;
  if (pending > 0) return <span className="text-amber-700">● {pending} modification(s) non encore synchronisée(s)</span>;
  return <span className="text-emerald-700">✓ Enregistré{lastSync ? ` (${new Date(lastSync).toLocaleTimeString("fr-FR")})` : ""}</span>;
}

function Simple({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  const id = `s-${label}`;
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input !py-2.5 !text-base sm:!text-sm" disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ConflictPanel({ conflicts, onKeepServer, onReapply }: { conflicts: ConflictEntry[]; onKeepServer: (i: number) => void; onReapply: (i: number) => void }) {
  const show = (v: unknown) => (v === null || v === undefined || v === "" ? "(vide)" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return (
    <div className="rounded-md border-2 border-red-400 bg-red-50 p-3 text-sm dark:bg-red-950/40">
      <div className="mb-2 font-semibold text-red-800 dark:text-red-200">Conflits de synchronisation : rien n&apos;a été écrasé. Choisissez pour chaque modification.</div>
      <ul className="space-y-3">
        {conflicts.map((c, i) => (
          <li key={c.op.opId} className="rounded bg-white p-2 dark:bg-slate-900">
            <div className="text-xs text-slate-600">{c.message}</div>
            {c.conflicts?.map((x) => (
              <div key={x.key} className="mt-1 grid gap-1 text-xs sm:grid-cols-3">
                <span className="font-medium">{x.key.replace(/^data\./, "")}</span>
                <span>Serveur (plus récent) : <strong>{show(x.server)}</strong></span>
                <span>Votre saisie : <strong>{show(x.mine)}</strong></span>
              </div>
            ))}
            <div className="mt-2 flex gap-2">
              <button type="button" className={btnClass("secondary", "sm")} onClick={() => onKeepServer(i)}>Garder la version du serveur</button>
              <button type="button" className={btnClass("danger", "sm")} onClick={() => onReapply(i)}>Appliquer ma version</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Éléments (équipements / installation)
// ---------------------------------------------------------------------------

function ItemsTab(p: {
  local: Full;
  def: TemplateDefinition;
  editable: boolean;
  selected: string | null;
  setSelected: (id: string | null) => void;
  push: (op: ClientOp) => void;
  patchItem: (itemId: string, key: string, value: unknown) => void;
  attachments: Attachment[];
  missionId: string;
  storeReady: boolean;
  onFilesChanged: () => Promise<void>;
  flush: () => Promise<void>;
}) {
  const { local, def, editable, selected, setSelected, push } = p;
  const items = [...local.items].sort((a, b) => a.position - b.position);
  const sel = items.find((i) => i.id === selected) ?? null;
  const add = (t: ItemType, parentId: string | null) => {
    const id = uuid();
    const n = items.filter((i) => i.itemType === t.key).length + 1;
    push({ opId: uuid(), kind: "createItem", itemId: id, itemType: t.key, parentId, label: `${t.label} ${n}`, position: items.length, clientCreatedAt: now() });
    setSelected(id);
  };
  const roots = items.filter((i) => !i.parentId);
  const childrenOf = (id: string) => items.filter((i) => i.parentId === id);
  const typeLabel = (k: string) => def.itemTypes.find((t) => t.key === k)?.label ?? k;
  const renderNode = (it: (typeof items)[number], depth: number): React.ReactNode => (
    <li key={it.id}>
      <button type="button" onClick={() => setSelected(it.id)} className={cx("flex w-full items-center justify-between gap-2 rounded-md px-3 py-3 text-left text-sm", selected === it.id ? "bg-brand-600 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800")} style={{ paddingLeft: 12 + depth * 18 }}>
        <span className="truncate font-medium">{it.label}</span>
        <span className={cx("text-[11px]", selected === it.id ? "text-white/80" : "text-slate-400")}>{typeLabel(it.itemType)}</span>
      </button>
      {childrenOf(it.id).length > 0 && <ul>{childrenOf(it.id).map((c) => renderNode(c, depth + 1))}</ul>}
    </li>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <div className="card p-2">
        {roots.length === 0 && <p className="p-3 text-sm text-slate-500">Aucun élément saisi.</p>}
        <ul className="space-y-0.5">{roots.map((r) => renderNode(r, 0))}</ul>
        {editable && (
          <div className="mt-2 grid gap-2 border-t border-slate-100 p-2 dark:border-slate-800">
            {def.itemTypes.filter((t) => !t.parentTypes?.length).map((t) => (
              <button key={t.key} type="button" className={btnClass("primary", "lg")} onClick={() => add(t, null)}>+ {t.label}</button>
            ))}
          </div>
        )}
      </div>
      <div>
        {!sel ? (
          <div className="card p-6 text-sm text-slate-500">Sélectionnez un élément ou ajoutez-en un.</div>
        ) : (
          <ItemPanel key={sel.id} item={sel} {...p} childTypes={def.itemTypes.filter((t) => t.parentTypes?.includes(sel.itemType))} onAddChild={(t) => add(t, sel.id)} hasChildren={childrenOf(sel.id).length > 0} />
        )}
      </div>
    </div>
  );
}

function ItemPanel(p: {
  item: Full["items"][number];
  local: Full;
  def: TemplateDefinition;
  editable: boolean;
  push: (op: ClientOp) => void;
  patchItem: (itemId: string, key: string, value: unknown) => void;
  attachments: Attachment[];
  missionId: string;
  storeReady: boolean;
  onFilesChanged: () => Promise<void>;
  flush: () => Promise<void>;
  childTypes: ItemType[];
  onAddChild: (t: ItemType) => void;
  hasChildren: boolean;
  setSelected: (id: string | null) => void;
}) {
  const { item, def, editable, patchItem, local } = p;
  const type = def.itemTypes.find((t) => t.key === item.itemType);
  if (!type) return <div className="card p-4 text-sm text-red-700">Type d&apos;élément absent du modèle.</div>;
  const fields: Field[] = type.fields.filter((f) => isVisible(f, item.data));
  const serverItem = local.items.find((i) => i.id === item.id);
  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="grow">
            <label className="label" htmlFor="item-label">Libellé ({type.label})</label>
            <input id="item-label" className="input !py-2.5 !text-base font-medium sm:!text-sm" disabled={!editable} value={item.label} onChange={(e) => patchItem(item.id, "label", e.target.value)} />
          </div>
          {editable && (
            <button
              type="button"
              className={btnClass("ghost", "sm")}
              disabled={p.hasChildren}
              title={p.hasChildren ? "Supprimez d'abord les éléments rattachés" : undefined}
              onClick={() => {
                if (!confirm(`Supprimer « ${item.label} » et ses relevés / observations ?`)) return;
                p.push({ opId: uuid(), kind: "deleteItem", itemId: item.id, baseVersion: serverItem?.version, clientCreatedAt: now() });
                p.setSelected(null);
              }}
            >
              Supprimer
            </button>
          )}
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {fields.map((f) => (
            <FieldInput
              key={f.key}
              field={f}
              value={item.data[f.key]}
              pending={item.pendingFields.includes(f.key)}
              disabled={!editable}
              allowDictation={local.allowDictation}
              onChange={(v) => {
                patchItem(item.id, `data.${f.key}`, v);
                // Le libellé suit le champ de référence (ex. désignation) tant qu'il n'a pas été personnalisé.
                const prev = item.data[f.key];
                if (type.labelField === f.key && typeof v === "string" && v.trim() && (item.label === (prev ?? "") || /^.+ \d+$/.test(item.label))) patchItem(item.id, "label", v.trim().slice(0, 200));
              }}
              onTogglePending={() => patchItem(item.id, "pendingFields", item.pendingFields.includes(f.key) ? item.pendingFields.filter((x) => x !== f.key) : [...item.pendingFields, f.key])}
            />
          ))}
        </div>
        <div>
          <label className="label" htmlFor="remaining">Éléments restant à vérifier / non contrôlés</label>
          <TextArea id="remaining" value={item.remainingChecks ?? ""} disabled={!editable} allowDictation={local.allowDictation} onChange={(v) => patchItem(item.id, "remainingChecks", v || null)} rows={2} />
        </div>
        {editable && p.childTypes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {p.childTypes.map((t) => <button key={t.key} type="button" className={btnClass("secondary")} onClick={() => p.onAddChild(t)}>+ {t.label} rattaché</button>)}
          </div>
        )}
      </div>
      <Measurements item={item} local={local} def={def} editable={editable} push={p.push} />
      <ObservationsTab local={local} def={def} editable={editable} push={p.push} itemId={item.id} />
      <div className="card p-4">
        <Photos missionId={p.missionId} itemId={item.id} attachments={p.attachments.filter((a) => a.itemId === item.id)} editable={editable} onAdded={p.onFilesChanged} onFlush={p.flush} storeReady={p.storeReady} />
      </div>
    </div>
  );
}

function Measurements({ item, local, def, editable, push }: { item: Full["items"][number]; local: Full; def: TemplateDefinition; editable: boolean; push: (op: ClientOp) => void }) {
  const types = def.measurementTypes.filter((m) => m.appliesTo.includes(item.itemType));
  const [type, setType] = useState(types[0]?.key ?? "");
  const mt = types.find((t) => t.key === type);
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState(mt?.units[0] ?? "");
  const [at, setAt] = useState(() => toDateTimeLocal(new Date()));
  const [instrument, setInstrument] = useState("");
  const [context, setContext] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (!types.length) return null;
  const list = local.measurements.filter((m) => m.itemId === item.id);
  return (
    <div className="card p-4">
      <h3 className="mb-2 text-sm font-semibold">Relevés (valeurs réellement mesurées)</h3>
      {list.length > 0 && (
        <ul className="mb-3 divide-y divide-slate-100 text-sm dark:divide-slate-800">
          {list.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 py-1.5">
              <span>
                <strong>{m.label}</strong> : {m.value} {m.unit} <span className="text-xs text-slate-500">· {fmtDateTime(m.measuredAt)}{m.instrument ? ` · ${m.instrument}` : ""}{m.context ? ` · ${m.context}` : ""}</span>
              </span>
              {editable && <button type="button" className="text-xs text-red-600" onClick={() => confirm("Supprimer ce relevé ?") && push({ opId: uuid(), kind: "deleteMeasurement", id: m.id })}>Supprimer</button>}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <form
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(value.replace(",", ".").replace(/\s/g, ""));
            if (!value.trim() || !Number.isFinite(n)) return setErr("Saisissez la valeur mesurée (nombre).");
            if (!at) return setErr("Date de mesure requise.");
            setErr(null);
            push({ opId: uuid(), kind: "addMeasurement", id: uuid(), itemId: item.id, measurementType: type, value: value.trim(), unit: unit || mt!.units[0], measuredAt: new Date(at).toISOString(), instrument: instrument || undefined, context: context || undefined, clientCreatedAt: now() });
            setValue("");
            setContext("");
          }}
        >
          <select className="input !py-2.5" value={type} onChange={(e) => { setType(e.target.value); setUnit(types.find((t) => t.key === e.target.value)?.units[0] ?? ""); }} aria-label="Type de relevé">
            {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <div className="flex gap-2">
            <input className="input !py-2.5 !text-base" inputMode="decimal" placeholder="Valeur" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Valeur mesurée" />
            <select className="input !w-24 !py-2.5" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unité">
              {mt?.units.map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
          <input className="input !py-2.5" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Date de mesure" />
          <input className="input !py-2.5" placeholder="Appareil de mesure (facultatif)" value={instrument} onChange={(e) => setInstrument(e.target.value)} />
          <input className="input !py-2.5" placeholder="Contexte (facultatif)" value={context} onChange={(e) => setContext(e.target.value)} />
          <button type="submit" className={btnClass("primary")}>Ajouter le relevé</button>
          {err && <p className="text-sm text-red-700 sm:col-span-3">{err}</p>}
        </form>
      )}
      <p className="mt-2 text-[11px] text-slate-400">Aucune valeur n&apos;est générée automatiquement ; aucune interprétation (conforme / non conforme) n&apos;est produite.</p>
    </div>
  );
}

type Obs = Full["observations"][number] & { location?: string | null; internalPriority?: string | null; technicalReference?: string | null; referenceVerified?: boolean; inspectorComment?: string | null; treatmentStatus?: string; needsVerification?: boolean; measurementId?: string | null };

function ObservationsTab({ local, def, editable, push, itemId }: { local: Full; def: TemplateDefinition; editable: boolean; push: (op: ClientOp) => void; itemId: string | null }) {
  const [editing, setEditing] = useState<Obs | "new" | null>(null);
  const list = (local.observations as Obs[]).filter((o) => (itemId ? o.itemId === itemId : true));
  const itemLabel = (id: string | null) => (id ? (local.items.find((i) => i.id === id)?.label ?? "élément supprimé") : "Général");
  const prio = (k: string | null | undefined) => def.observationPriorities.find((p) => p.key === k)?.label;
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Observations et anomalies {itemId ? "de l'élément" : "(toutes)"}</h3>
        {editable && <button type="button" className={btnClass("primary", "sm")} onClick={() => setEditing("new")}>+ Observation</button>}
      </div>
      {list.length === 0 && !editing && <p className="text-sm text-slate-500">Aucune observation.</p>}
      <ul className="space-y-2">
        {list.map((o) => (
          <li key={o.id} className="rounded-md border border-slate-200 p-2 text-sm dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={o.kind === "anomalie" ? "red" : "slate"}>{o.kind === "anomalie" ? "Anomalie" : "Observation"}</Badge>
              {prio(o.internalPriority) && <Badge tone="amber" title="Priorité interne — pas un niveau réglementaire">{prio(o.internalPriority)}</Badge>}
              {o.needsVerification && <Badge tone="amber">À vérifier</Badge>}
              {!itemId && <span className="text-xs text-slate-500">{itemLabel(o.itemId)}</span>}
              <span className="grow" />
              {editable && <button type="button" className="text-xs text-brand-600" onClick={() => setEditing(o)}>Modifier</button>}
              {editable && <button type="button" className="text-xs text-red-600" onClick={() => confirm("Supprimer cette observation ?") && push({ opId: uuid(), kind: "deleteObservation", id: o.id })}>Supprimer</button>}
            </div>
            <p className="mt-1 whitespace-pre-line">{o.description}</p>
            <p className="text-xs text-slate-500">
              {[o.location && `Localisation : ${o.location}`, o.technicalReference && `Réf. ${o.technicalReference} ${o.referenceVerified ? "(vérifiée)" : "(non vérifiée)"}`, o.inspectorComment && `Commentaire : ${o.inspectorComment}`, def.treatmentStatuses.find((t) => t.key === o.treatmentStatus)?.label].filter(Boolean).join(" · ")}
            </p>
          </li>
        ))}
      </ul>
      {editing && (
        <ObservationForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          local={local}
          def={def}
          itemId={itemId}
          onCancel={() => setEditing(null)}
          onSave={(op) => {
            push(op);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ObservationForm({ initial, local, def, itemId, onSave, onCancel }: { initial: Obs | null; local: Full; def: TemplateDefinition; itemId: string | null; onSave: (op: ClientOp) => void; onCancel: () => void }) {
  const [f, setF] = useState({
    obsKind: (initial?.kind as "observation" | "anomalie") ?? "observation",
    description: initial?.description ?? "",
    location: initial?.location ?? "",
    internalPriority: initial?.internalPriority ?? "",
    technicalReference: initial?.technicalReference ?? "",
    referenceVerified: initial?.referenceVerified ?? false,
    inspectorComment: initial?.inspectorComment ?? "",
    treatmentStatus: initial?.treatmentStatus ?? def.treatmentStatuses[0]?.key ?? "a_traiter",
    needsVerification: initial?.needsVerification ?? false,
    measurementId: initial?.measurementId ?? "",
    itemId: initial ? initial.itemId : itemId,
  });
  const set = (k: keyof typeof f, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const meas = local.measurements.filter((m) => !f.itemId || m.itemId === f.itemId);
  return (
    <form
      className="mt-3 grid gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-2 dark:bg-slate-950"
      onSubmit={(e) => {
        e.preventDefault();
        if (!f.description.trim()) return;
        onSave({
          opId: uuid(),
          kind: "upsertObservation",
          id: initial?.id ?? uuid(),
          baseUpdatedAt: initial ? ((local.observations.find((o) => o.id === initial.id)?.updatedAt as string) ?? null) : null,
          obsKind: f.obsKind,
          description: f.description.trim(),
          location: f.location || null,
          internalPriority: f.internalPriority || null,
          technicalReference: f.technicalReference || null,
          referenceVerified: f.referenceVerified,
          inspectorComment: f.inspectorComment || null,
          treatmentStatus: f.treatmentStatus,
          needsVerification: f.needsVerification,
          measurementId: f.measurementId || null,
          itemId: f.itemId,
          clientCreatedAt: now(),
        });
      }}
    >
      <div className="flex gap-2 sm:col-span-2">
        {(["observation", "anomalie"] as const).map((k) => (
          <button key={k} type="button" onClick={() => set("obsKind", k)} className={cx("rounded-md px-4 py-2 text-sm ring-1", f.obsKind === k ? "bg-brand-600 text-white ring-brand-600" : "ring-slate-300")}>{k === "anomalie" ? "Anomalie" : "Observation"}</button>
        ))}
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="obs-desc">Description</label>
        <TextArea id="obs-desc" value={f.description} onChange={(v) => set("description", v)} allowDictation={local.allowDictation} />
      </div>
      {!itemId && (
        <select className="input !py-2.5" value={f.itemId ?? ""} onChange={(e) => set("itemId", e.target.value || null)} aria-label="Élément concerné">
          <option value="">Observation générale</option>
          {local.items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
      )}
      <input className="input !py-2.5" placeholder="Localisation" value={f.location} onChange={(e) => set("location", e.target.value)} />
      <select className="input !py-2.5" value={f.internalPriority} onChange={(e) => set("internalPriority", e.target.value)} aria-label="Priorité interne">
        <option value="">Priorité interne : —</option>
        {def.observationPriorities.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
      <select className="input !py-2.5" value={f.treatmentStatus} onChange={(e) => set("treatmentStatus", e.target.value)} aria-label="État de traitement">
        {def.treatmentStatuses.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
      {meas.length > 0 && (
        <select className="input !py-2.5" value={f.measurementId} onChange={(e) => set("measurementId", e.target.value)} aria-label="Relevé associé">
          <option value="">Relevé associé : aucun</option>
          {meas.map((m) => <option key={m.id} value={m.id}>{m.label} : {m.value} {m.unit}</option>)}
        </select>
      )}
      <input className="input !py-2.5" placeholder="Référence technique (si vérifiée)" value={f.technicalReference} onChange={(e) => set("technicalReference", e.target.value)} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.referenceVerified} onChange={(e) => set("referenceVerified", e.target.checked)} /> Référence vérifiée</label>
      <input className="input !py-2.5 sm:col-span-2" placeholder="Commentaire de l'inspecteur" value={f.inspectorComment} onChange={(e) => set("inspectorComment", e.target.value)} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.needsVerification} onChange={(e) => set("needsVerification", e.target.checked)} /> À vérifier / compléter</label>
      <p className="text-[11px] text-slate-500 sm:col-span-2">La priorité interne n&apos;est pas un niveau de gravité réglementaire.</p>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className={btnClass("primary")}>Enregistrer</button>
        <button type="button" className={btnClass("ghost")} onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

function Photos({ missionId, itemId, attachments, editable, onAdded, onFlush, storeReady }: { missionId: string; itemId: string | null; attachments: Attachment[]; editable: boolean; onAdded: () => Promise<void>; onFlush: () => Promise<void>; storeReady: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const addFiles = async (files: FileList | null, kind: "photo" | "document") => {
    if (!files?.length) return;
    setBusy(true);
    setErr(null);
    try {
      for (const file of Array.from(files)) {
        const blob = kind === "photo" ? await reencodeImage(file) : file;
        const name = kind === "photo" ? file.name.replace(/\.\w+$/, "") + ".jpg" : file.name;
        if (storeReady) {
          await savePendingFile({ id: uuid(), missionId, kind, itemId, observationId: null, caption: "", filename: name, mime: blob.type || file.type }, await blob.arrayBuffer());
        } else {
          const fd = new FormData();
          fd.set("id", uuid());
          fd.set("kind", kind);
          if (itemId) fd.set("itemId", itemId);
          fd.set("file", new File([blob], name, { type: blob.type }));
          const r = await fetch(`/api/missions/${missionId}/attachments`, { method: "POST", body: fd });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Envoi impossible");
        }
      }
      await onAdded();
      await onFlush();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (a: Attachment) => {
    if (a.pending) {
      await removePendingFile(a.id);
      return onAdded();
    }
    if (!confirm(`Supprimer « ${a.filename} » ?`)) return;
    const r = await fetch(`/api/attachments/${a.id}`, { method: "DELETE" });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error ?? "Suppression impossible (connexion requise)");
    else await onFlush();
  };
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Photos et documents</h3>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {attachments.map((a) => (
          <figure key={a.id} className="relative overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
            {a.mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.localUrl ?? `/api/attachments/${a.id}`} alt={a.caption ?? a.filename} className="aspect-square w-full object-cover" loading="lazy" />
            ) : (
              <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer" className="flex aspect-square items-center justify-center p-2 text-center text-xs break-all">📄 {a.filename}</a>
            )}
            {a.pending && <span className="absolute top-1 left-1 rounded bg-amber-500 px-1 text-[10px] text-white">en attente</span>}
            {editable && <button type="button" onClick={() => remove(a)} className="absolute top-1 right-1 rounded bg-black/60 px-1.5 text-xs text-white" aria-label={`Supprimer ${a.filename}`}>✕</button>}
          </figure>
        ))}
      </div>
      {editable && (
        <div className="mt-3 flex flex-wrap gap-2">
          <label className={cx(btnClass("primary", "lg"), "cursor-pointer")}>
            📷 Prendre / ajouter une photo
            <input type="file" accept="image/*" capture="environment" multiple className="sr-only" disabled={busy} onChange={(e) => { addFiles(e.target.files, "photo"); e.target.value = ""; }} />
          </label>
          <label className={cx(btnClass("secondary", "lg"), "cursor-pointer")}>
            Joindre un PDF
            <input type="file" accept="application/pdf" className="sr-only" disabled={busy} onChange={(e) => { addFiles(e.target.files, "document"); e.target.value = ""; }} />
          </label>
          {busy && <span className="self-center text-sm text-slate-500">Traitement…</span>}
        </div>
      )}
      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
      <p className="mt-1 text-[11px] text-slate-400">Photos redimensionnées et débarrassées de leurs métadonnées (GPS…) sur l&apos;appareil avant envoi. Hors connexion, elles sont stockées chiffrées puis envoyées au retour du réseau.</p>
    </div>
  );
}

function DraftTab({ local, missing, missionId, listHref, online, onChecklist, onChanged, editable }: { local: Full; missing: ReturnType<typeof computeMissing>; missionId: string; listHref: string; online: boolean; onChecklist: (i: number, v: boolean) => void; onChanged: () => Promise<boolean>; editable: boolean }) {
  const def = local.definition;
  const m = local.mission;
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [confirmManual, setConfirmManual] = useState(false);
  const checklist = def.checklist.map((_, i) => (m.data._checklist as boolean[] | undefined)?.[i] === true);
  const run = (fn: () => Promise<{ ok?: boolean; message?: string; error?: string } | null>) =>
    start(async () => {
      const r = await fn();
      setMsg(r?.error ? { text: r.error } : { ok: true, text: r?.message ?? "OK" });
      await onChanged();
    });
  const blocking = missing.filter((x) => x.level === "bloquant");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <h3 className="mb-2 text-sm font-semibold">Informations manquantes ou à vérifier ({missing.length})</h3>
        {missing.length === 0 ? (
          <p className="text-sm text-emerald-700">Aucun écart détecté par rapport au modèle. Cela ne signifie pas que le dossier est complet ni conforme.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {missing.map((x, i) => (
              <li key={i} className="flex gap-2">
                <Badge tone={x.level === "bloquant" ? "red" : "amber"}>{x.level === "bloquant" ? "obligatoire" : "à vérifier"}</Badge>
                <span>{x.message}</span>
              </li>
            ))}
          </ul>
        )}
        <h3 className="mt-4 mb-2 text-sm font-semibold">Checklist avant export</h3>
        <ul className="space-y-2 text-sm">
          {def.checklist.map((c, i) => (
            <li key={i}>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 h-5 w-5" disabled={!editable} checked={checklist[i]} onChange={(e) => onChecklist(i, e.target.checked)} /> {c}
              </label>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-4">
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold">Brouillon et exports</h3>
          <p className="mb-3 text-xs text-slate-500">{def.notice}</p>
          <div className="flex flex-wrap gap-2">
            <Link className={btnClass("secondary")} href={`${listHref}/${missionId}/brouillon`}>Consulter le brouillon</Link>
            {local.canExport && (
              <>
                <a className={btnClass("primary")} href={`/api/missions/${missionId}/export?format=pdf`}>Exporter le brouillon PDF</a>
                <a className={btnClass("secondary")} href={`/api/missions/${missionId}/export?format=json`}>Export structuré (JSON)</a>
              </>
            )}
            <Link className={btnClass("ghost")} href={`${listHref}/${missionId}/historique`}>Historique</Link>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Chaque export enregistre une version figée du dossier.</p>
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold">Statut du dossier</h3>
          {!online && <p className="mb-2 text-xs text-amber-700">Connexion et synchronisation complètes requises pour changer le statut.</p>}
          <div className="flex flex-wrap gap-2">
            {(["EN_SAISIE", "A_COMPLETER", "PRET_RELECTURE"] as const).map((s) => (
              <button key={s} type="button" disabled={!online || pending || m.status === s || !editable} className={btnClass(m.status === s ? "primary" : "secondary", "sm")} onClick={() => run(() => statusMissionAction(missionId, s, false))}>
                {STATUSES[s]}
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={confirmManual} onChange={(e) => setConfirmManual(e.target.checked)} />
              Je confirme que la rédaction finale et la validation du rapport seront réalisées manuellement dans l&apos;outil officiel, sous la responsabilité de l&apos;inspecteur habilité.
            </label>
            <button type="button" disabled={!online || pending || !confirmManual || blocking.length > 0 || checklist.some((c) => !c) || !editable} className={`${btnClass("primary", "sm")} mt-2`} onClick={() => run(() => statusMissionAction(missionId, "PRET_OUTIL_OFFICIEL", true))}>
              Marquer « prêt à finaliser dans l&apos;outil officiel »
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={!online || pending} className={btnClass("secondary", "sm")} onClick={() => run(() => snapshotMissionAction(missionId, `Version manuelle v${m.version}`))}>Enregistrer une version</button>
            {m.status !== "ARCHIVE" ? (
              <button type="button" disabled={!online || pending || !editable} className={btnClass("ghost", "sm")} onClick={() => confirm("Archiver ce dossier (lecture seule) ?") && run(() => statusMissionAction(missionId, "ARCHIVE", false))}>Archiver</button>
            ) : (
              <button type="button" disabled={!online || pending} className={btnClass("ghost", "sm")} onClick={() => run(() => statusMissionAction(missionId, "EN_SAISIE", false))}>Désarchiver (responsable)</button>
            )}
          </div>
          {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold">Versions enregistrées ({local.snapshots.length})</h3>
          <ul className="space-y-1 text-xs">
            {local.snapshots.map((s) => <li key={s.id}>{fmtDateTime(s.createdAt)} — {s.label} (v{s.missionVersion}) — {s.author ?? ""}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
