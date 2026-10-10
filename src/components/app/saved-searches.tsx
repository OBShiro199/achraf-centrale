"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Bookmark, BookmarkPlus, ChevronDown, Trash2 } from "lucide-react";
import { Popover } from "@/components/app/smart-filters";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import { deleteSavedSearch, listSavedSearches, saveSearch, type SavedSearch } from "@/lib/directory";
import { SAVED_VERSION, toServer, type Filters } from "@/lib/lead-filters";
import { cn } from "@/lib/utils";

/**
 * What a saved search stores: { v, ...filters, q }. Empty values are dropped the way toServer drops them,
 * but job titles are kept as typed, so the synonyms toServer adds are never written back into the search.
 */
export function savedPayload(filters: Filters, q: string): Record<string, unknown> {
  const out = toServer(filters);
  for (const k of ["titles", "titlesNot"]) {
    const raw = filters[k];
    if (Array.isArray(raw) && raw.length) out[k] = raw;
    else delete out[k];
  }
  return { v: SAVED_VERSION, ...out, q: q.trim() };
}

/** Key order is not kept by the database, so compare with sorted keys. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

export const sameSearch = (a: Record<string, unknown>, b: Record<string, unknown>) => stable(a) === stable(b);

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** The toolbar menu of saved searches. Shows the open search's name, and whether it has been changed since. */
export function SavedSearchesMenu({
  active,
  edited,
  onOpen,
  onDeleted,
}: {
  active: SavedSearch | null;
  edited: boolean;
  onOpen: (s: SavedSearch) => void;
  onDeleted: (id: string) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<SavedSearch[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void listSavedSearches().then((l) => {
      if (live) setList(l);
    });
    return () => {
      live = false;
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setConfirm(null);
  };

  async function remove(s: SavedSearch) {
    setDeleting(true);
    try {
      await deleteSavedSearch(s.id);
      setList((l) => l?.filter((x) => x.id !== s.id) ?? null);
      setConfirm(null);
      onDeleted(s.id);
      toast({ title: `Deleted "${s.name}"` });
    } catch (err) {
      toast({ title: "Could not delete that search", body: err instanceof Error ? err.message : undefined, tone: "error" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Popover
      open={open}
      onClose={close}
      label="Saved searches"
      width={320}
      trigger={
        <button
          data-trigger
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => (open ? close() : setOpen(true))}
          className={buttonClass({ size: "sm", className: "max-w-[260px]" })}
        >
          <Bookmark className={cn("h-3.5 w-3.5 shrink-0", active ? "fill-vermilion text-vermilion" : "text-label")} />
          <span className="min-w-0 truncate">{active ? active.name : "Saved searches"}</span>
          {active && edited && <span className="text-[11.5px] font-normal text-label">edited</span>}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-label" />
        </button>
      }
    >
      <div className="border-b border-line-2 px-3 py-2.5">
        <span className="text-[13px] font-semibold text-ink">Saved searches</span>
      </div>
      <div className="quiet-scroll min-h-0 flex-1 overflow-y-auto p-1">
        {list == null && <p className="px-2 py-3 text-[12.5px] text-label">Loading</p>}
        {list?.length === 0 && (
          <p className="px-2 py-3 text-[12.5px] leading-relaxed text-label">No saved searches yet. Set some filters, then choose Save search to come back to them.</p>
        )}
        {list?.map((s) =>
          confirm === s.id ? (
            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-[5px] bg-pencil-soft/60 px-2 py-1.5 text-[12.5px]">
              <span className="min-w-0 flex-1 truncate text-ink">Delete &ldquo;{s.name}&rdquo;?</span>
              <button data-nav onClick={() => void remove(s)} disabled={deleting} className="rounded-[4px] px-1.5 py-0.5 font-medium text-pencil hover:bg-black/[0.04]">
                {deleting ? "Deleting" : "Delete"}
              </button>
              <button data-nav onClick={() => setConfirm(null)} className="rounded-[4px] px-1.5 py-0.5 text-label hover:text-ink">
                Keep
              </button>
            </div>
          ) : (
            <div key={s.id} className={cn("group flex items-center rounded-[5px] hover:bg-black/[0.035]", active?.id === s.id && "bg-black/[0.03]")}>
              <button
                data-nav
                onClick={() => {
                  onOpen(s);
                  close();
                }}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/10"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{s.name}</span>
                <span className="tabular shrink-0 text-[11.5px] text-label">{day(s.updated_at)}</span>
              </button>
              <button
                onClick={() => setConfirm(s.id)}
                className="mr-1 rounded-[4px] p-1 text-faint hover:text-pencil focus-visible:text-pencil focus-visible:outline-none"
                aria-label={`Delete ${s.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ),
        )}
      </div>
    </Popover>
  );
}

/** Saves the current filters and search text under a name, or updates the open saved search. */
export function SaveSearchButton({
  filters,
  q,
  active,
  disabled,
  onSaved,
}: {
  filters: Filters;
  q: string;
  active: SavedSearch | null;
  disabled?: boolean;
  onSaved: (s: SavedSearch) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"update" | "new">("new");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const start = () => {
    setMode(active ? "update" : "new");
    setName(active?.name ?? "");
    setError(null);
    setOpen(true);
  };

  const pick = (m: "update" | "new") => {
    setMode(m);
    setName(m === "update" ? (active?.name ?? "") : "");
    setError(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Give this search a name");
    setSaving(true);
    setError(null);
    try {
      const updating = mode === "update" && active;
      const saved = await saveSearch(name.slice(0, 80), savedPayload(filters, q), updating ? active.id : undefined);
      onSaved(saved);
      toast({ title: updating ? `Updated "${saved.name}"` : `Saved "${saved.name}"`, body: "Open it again from Saved searches." });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this search");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={start} disabled={disabled} title={disabled ? "Add a filter or search first" : undefined}>
        <BookmarkPlus className="h-3.5 w-3.5 text-label" /> Save search
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Save search" width={420}>
        <form onSubmit={(e) => void submit(e)}>
          <div className="space-y-4 px-5 py-4">
            {active && (
              <div role="radiogroup" aria-label="How to save" className="grid grid-cols-2 gap-1 rounded-[7px] bg-panel-2 p-1 text-[13px]">
                {(["update", "new"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => pick(m)}
                    className={cn("rounded-[5px] px-2 py-1.5", mode === m ? "bg-panel font-medium text-ink shadow-[0_1px_2px_rgba(57,28,37,0.08)]" : "text-label hover:text-ink")}
                  >
                    {m === "update" ? "Update this search" : "Save as new"}
                  </button>
                ))}
              </div>
            )}
            <Field label="Name" hint={mode === "update" && active ? `Replaces the filters saved in "${active.name}".` : "Only you can see your saved searches."}>
              <Input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Seed fintech in London" />
            </Field>
            <FormError>{error}</FormError>
          </div>
          <div className="flex justify-end gap-2 border-t border-line-2 px-5 py-3">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="primary" disabled={saving}>
              {saving ? "Saving" : mode === "update" && active ? "Update" : "Save"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
