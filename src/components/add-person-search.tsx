import { useEffect, useState } from "react";
import { searchPeople, type Person } from "@/lib/friends";

/** Search any account by name or @username and add it to a room. */
export function AddPersonSearch({ exclude, onAdd, placeholder }: { exclude: string[]; onAdd: (p: Person) => void; placeholder: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Person[]>([]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    const t = setTimeout(() => { void searchPeople(term).then(setHits).catch(() => setHits([])); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const shown = hits.filter((h) => !exclude.includes(h.id));
  return (
    <div className="space-y-1">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="w-full rounded-lg border border-border bg-background p-2 text-sm" />
      {shown.map((p) => (
        <button key={p.id} type="button" onClick={() => { onAdd(p); setQ(""); setHits([]); }} className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-left text-sm hover:bg-muted">
          {p.avatar ? <img src={p.avatar} alt="" className="h-6 w-6 rounded-full object-cover" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs">{p.name[0]}</span>}
          <span className="flex-1 truncate">{p.name}{p.username ? <span className="text-xs text-muted-foreground"> @{p.username}</span> : null}</span>
          <span className="text-xs text-primary">+</span>
        </button>
      ))}
    </div>
  );
}
