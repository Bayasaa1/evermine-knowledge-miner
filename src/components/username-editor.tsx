import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getMyUsername, setMyUsername, USERNAME_RE } from "@/lib/friends";
import { useLang, pickCopy } from "@/lib/i18n";

const COPY = {
  en: { set: "Set your @username", save: "Save", rule: "3–24 letters, numbers or _", taken: "That @username is taken", invalid: "Use 3–24 lowercase letters, numbers or _", ok: "Saved" },
  mn: { set: "@username-ээ оруулах", save: "Хадгалах", rule: "3–24 жижиг үсэг, тоо эсвэл _", taken: "Энэ @username аль хэдийн авагдсан", invalid: "3–24 жижиг латин үсэг, тоо эсвэл _ ашиглана уу", ok: "Хадгалагдлаа" },
  ko: { set: "@사용자명 설정", save: "저장", rule: "3–24자 영문 소문자, 숫자, _", taken: "이미 사용 중인 @사용자명입니다", invalid: "영문 소문자, 숫자, _ 3–24자", ok: "저장됨" },
};

export function UsernameEditor() {
  const { lang } = useLang();
  const t = pickCopy(COPY, lang);
  const [current, setCurrent] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getMyUsername().then((u) => { setCurrent(u); setValue(u ?? ""); }).catch(() => {});
  }, []);

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
        {current ? `@${current}` : t.set}
      </button>
    );
  }
  const clean = value.trim().replace(/^@/, "").toLowerCase();
  return (
    <div className="mt-1 flex items-center gap-1">
      <span className="text-xs text-muted-foreground">@</span>
      <input autoFocus value={value} onChange={(e) => setValue(e.target.value.toLowerCase())} placeholder={t.rule}
        className="w-36 rounded-full border border-border bg-background px-2 py-1 text-xs" />
      <button disabled={busy || !USERNAME_RE.test(clean)}
        onClick={async () => {
          setBusy(true);
          try {
            const u = await setMyUsername(clean);
            setCurrent(u); setEditing(false); toast.success(t.ok);
          } catch (e) {
            const m = (e as Error).message;
            toast.error(m === "taken" ? t.taken : m === "invalid" ? t.invalid : m);
          } finally { setBusy(false); }
        }}
        className="rounded-full bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50">{t.save}</button>
    </div>
  );
}
