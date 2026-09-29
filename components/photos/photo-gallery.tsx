"use client";

import { useRef, useState } from "react";
import { Camera, ImageIcon, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAction, useApp, useData } from "@/components/app/app-provider";
import { Empty, TextInput } from "@/components/app/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { can } from "@/lib/permissions";
import { prepareImage } from "@/lib/photos/image";
import { fmtDateTime } from "@/lib/format";
import type { Photo, PhotoEntity } from "@/types";

export function PhotoGallery({ entityType, entityId, vehicleId, allForVehicle }: { entityType: PhotoEntity; entityId: string; vehicleId?: string | null; allForVehicle?: boolean }) {
  const { services } = useApp();
  const { run } = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [caption, setCaption] = useState("");
  const [view, setView] = useState<Photo | null>(null);
  const { data: photos } = useData((s) => (allForVehicle && vehicleId ? s.crm.photos({ vehicle_id: vehicleId }) : s.crm.photos({ entity_type: entityType, entity_id: entityId })), [entityType, entityId, vehicleId, allForVehicle]);
  const { data: members } = useData((s) => s.org.members());
  const author = (id: string) => members?.find((m) => m.profile.id === id)?.profile.first_name ?? "—";
  const canWrite = services ? can(services.ctx, "photos:write") : false;

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files).slice(0, 10)) {
        const img = await prepareImage(file);
        await run((s) => s.crm.addPhoto({ ...img, entity_type: entityType, entity_id: entityId, vehicle_id: vehicleId ?? null, caption: caption || null }));
      }
      toast.success("Photo(s) ajoutée(s)");
      setCaption("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {canWrite && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <TextInput value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Légende (optionnel)" maxLength={200} />
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <Button onClick={() => input.current?.click()} disabled={busy} className="shrink-0">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} Ajouter des photos
          </Button>
        </div>
      )}
      {!photos?.length ? (
        <Empty title="Aucune photo" icon={ImageIcon} />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((p) => (
            <button key={p.id} onClick={() => setView(p)} className="group relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted text-left">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.caption ?? "Photo"} className="size-full object-cover transition-transform group-hover:scale-105" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-[11px] text-white">
                <div className="truncate">{p.caption ?? p.entity_type}</div>
                <div className="opacity-70">
                  {fmtDateTime(p.created_at)} · {author(p.user_id)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogTitle>{view?.caption ?? "Photo"}</DialogTitle>
          {view && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={view.url} alt={view.caption ?? "Photo"} className="max-h-[70dvh] w-full rounded-lg object-contain" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {view.entity_type} · {fmtDateTime(view.created_at)} · {author(view.user_id)}
                </span>
                {canWrite && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      await run((s) => s.crm.removePhoto(view.id), "Photo supprimée");
                      setView(null);
                    }}
                  >
                    <Trash2 className="size-3.5" /> Supprimer
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
