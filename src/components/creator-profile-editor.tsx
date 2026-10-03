import { useEffect, useState } from "react";
import { Trash2, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { listProjectsByPersona, type Project } from "@/lib/projects";
import type { Lang } from "@/lib/i18n";

const L = {
  en: { title: "Bio & Tags", bio: "Bio", tags: "Tags / hashtags", tagPh: "+ Type a tag and press Enter…", social: "Social links", greeting: "Chat greeting", save: "Save", saved: "Saved", qa: "Your positions (Q&A)", qaHint: "Write a question and your own answer. The Mind holds exactly your position. Toggle to suggest it in chat.", project: "Project", q: "Question", a: "Your answer / opinion", add: "Add", suggest: "Suggest in chat", del: "Delete this question?", pick: "Open a persona above to edit its bio and Q&A." },
  mn: { title: "Танилцуулга & Шошго", bio: "Био", tags: "Шошго / хаштаг", tagPh: "+ Шошго нэмээд Enter дарна уу...", social: "Сошиал холбоос", greeting: "Чатын мэндчилгээ", save: "Хадгалах", saved: "Хадгаллаа", qa: "Таны байр суурь (Асуулт, хариулт)", qaHint: "Асуулт болон өөрийн хариултаа бичнэ. Mind яг таны байр суурийг баримтална. Чатад санал болгох эсэхээ сонгоно.", project: "Төсөл", q: "Асуулт", a: "Таны хариулт / үзэл бодол", add: "Нэмэх", suggest: "Чатад санал болгох", del: "Энэ асуултыг устгах уу?", pick: "Био болон Q&A засахын тулд дээрээс persona нээнэ үү." },
  ko: { title: "소개 & 태그", bio: "소개", tags: "태그 / 해시태그", tagPh: "+ 태그 입력 후 Enter…", social: "소셜 링크", greeting: "채팅 인사말", save: "저장", saved: "저장됨", qa: "나의 입장 (Q&A)", qaHint: "질문과 나의 답을 적으세요. Mind는 정확히 그 입장을 지킵니다.", project: "프로젝트", q: "질문", a: "나의 답 / 의견", add: "추가", suggest: "채팅에 추천", del: "이 질문을 삭제할까요?", pick: "위에서 페르소나를 열어 편집하세요." },
} as const;

type Qa = { id: string; question: string; answer: string; suggest: boolean; sort: number };
type Social = { youtube?: string; x?: string; website?: string };

export function CreatorProfileEditor({ personaId, lang }: { personaId: string | null; lang: Lang }) {
  const t = L[(lang as keyof typeof L)] ?? L.en;
  const { userId } = useAuth();
  const [bio, setBio] = useState("");
  const [greeting, setGreeting] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [social, setSocial] = useState<Social>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [qa, setQa] = useState<Qa[]>([]);
  const [nq, setNq] = useState("");
  const [na, setNa] = useState("");

  useEffect(() => {
    if (!personaId || !userId) return;
    void supabase.from("creator_personas").select("bio, greeting, tags, social_links").eq("id", personaId).maybeSingle().then(({ data }) => {
      setBio(data?.bio ?? ""); setGreeting(data?.greeting ?? ""); setTags(data?.tags ?? []);
      setSocial((data?.social_links as Social) ?? {});
    });
    void listProjectsByPersona(userId, personaId).then((ps) => { setProjects(ps); setProjectId(ps[0]?.id ?? ""); });
  }, [personaId, userId]);

  const loadQa = async (pid: string) => {
    if (!pid) return setQa([]);
    const { data } = await supabase.from("mind_qa").select("id, question, answer, suggest, sort").eq("project_id", pid).order("sort");
    setQa((data as Qa[]) ?? []);
  };
  useEffect(() => { void loadQa(projectId); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!personaId) return <p className="text-sm text-muted-foreground">{t.pick}</p>;

  const saveProfile = async () => {
    const { error } = await supabase.from("creator_personas").update({ bio, greeting, tags, social_links: social }).eq("id", personaId);
    error ? toast.error(error.message) : toast.success(t.saved);
  };
  const addTag = () => {
    const v = tagInput.trim().replace(/^#/, "");
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setTagInput("");
  };
  const addQa = async () => {
    if (!nq.trim() || !projectId) return undefined;
    const { error } = await supabase.from("mind_qa").insert({ project_id: projectId, question: nq.trim(), answer: na.trim(), sort: qa.length });
    if (error) { toast.error(error.message); return; }
    setNq(""); setNa(""); void loadQa(projectId);
  };
  const patchQa = async (id: string, patch: Partial<Qa>) => {
    setQa((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("mind_qa").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  };
  const delQa = async (id: string) => {
    if (!confirm(t.del)) return;
    await supabase.from("mind_qa").delete().eq("id", id);
    void loadQa(projectId);
  };

  const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold">⚙️ {t.title}</h3>
        <label className="block text-xs text-muted-foreground">{t.bio}
          <textarea className={`${input} mt-1`} rows={3} value={bio} maxLength={600} onChange={(e) => setBio(e.target.value)} />
        </label>
        <div>
          <p className="text-xs text-muted-foreground">{t.tags}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {tags.map((x) => (
              <button key={x} type="button" onClick={() => setTags(tags.filter((y) => y !== x))} className="rounded-full border border-border px-2.5 py-1 text-xs">#{x} ×</button>
            ))}
          </div>
          <input className={`${input} mt-2`} value={tagInput} placeholder={t.tagPh} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t.social}</p>
          <div className="mt-1 grid gap-2 sm:grid-cols-3">
            {(["youtube", "x", "website"] as const).map((k) => (
              <input key={k} className={input} placeholder={k === "x" ? "X" : k === "youtube" ? "YouTube" : "Website"} value={social[k] ?? ""} onChange={(e) => setSocial({ ...social, [k]: e.target.value })} />
            ))}
          </div>
        </div>
        <label className="block text-xs text-muted-foreground">{t.greeting}
          <textarea className={`${input} mt-1`} rows={2} value={greeting} maxLength={400} onChange={(e) => setGreeting(e.target.value)} />
        </label>
        <button type="button" onClick={() => void saveProfile()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Save className="h-4 w-4" />{t.save}</button>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold">💬 {t.qa}</h3>
        <p className="text-xs text-muted-foreground">{t.qaHint}</p>
        {projects.length > 1 && (
          <select className={input} value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label={t.project}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        )}
        {qa.map((x) => (
          <div key={x.id} className="space-y-2 rounded-lg border border-border p-3">
            <input className={input} defaultValue={x.question} onBlur={(e) => e.target.value.trim() && e.target.value !== x.question && void patchQa(x.id, { question: e.target.value.trim() })} />
            <textarea className={input} rows={2} defaultValue={x.answer} onBlur={(e) => e.target.value !== x.answer && void patchQa(x.id, { answer: e.target.value })} />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={x.suggest} onChange={(e) => void patchQa(x.id, { suggest: e.target.checked })} />{t.suggest}</label>
              <button type="button" onClick={() => void delQa(x.id)} aria-label="Delete" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
        {projectId && (
          <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
            <input className={input} placeholder={t.q} value={nq} onChange={(e) => setNq(e.target.value)} />
            <textarea className={input} rows={2} placeholder={t.a} value={na} onChange={(e) => setNa(e.target.value)} />
            <button type="button" onClick={() => void addQa()} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm"><Plus className="h-4 w-4" />{t.add}</button>
          </div>
        )}
      </section>
    </div>
  );
}
