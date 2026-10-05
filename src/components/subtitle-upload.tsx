import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Captions, Check, ChevronDown, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { pickCopy, type Lang } from "@/lib/i18n";
import { youtubeId } from "@/lib/import-sources";
import { parseSubtitleText } from "@/lib/subtitle-file";
import { saveUserCaptions } from "@/lib/user-captions.functions";

/**
 * Optional: the creator attaches the video's own subtitles (SRT / VTT / copied
 * YouTube transcript). The miner then reads these exact lines and timings
 * instead of asking YouTube, so long videos mine fast and never lose captions.
 */
export function SubtitleUpload({ lang, url }: { lang: Lang; url: string }) {
  const save = useServerFn(saveUserCaptions);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const vid = youtubeId(url) ?? "";
  const c = (en: string, mn: string, ko: string) => pickCopy({ en, mn, ko }, lang);

  const submit = async (raw: string) => {
    const cues = parseSubtitleText(raw);
    if (!vid) return toast.error(c("Paste the YouTube link first.", "Эхлээд YouTube линкээ оруулна уу.", "먼저 YouTube 링크를 넣으세요."));
    if (cues.length < 3) return toast.error(c("No timed lines found. Use SRT, VTT or the copied YouTube transcript with times.", "Цагтай мөр олдсонгүй. SRT, VTT эсвэл цагтай нь хуулсан YouTube транскрипт оруулна уу.", "시간이 있는 줄을 찾지 못했습니다. SRT, VTT 또는 시간 포함 YouTube 스크립트를 넣으세요."));
    setBusy(true);
    try {
      const r = await save({ data: { youtubeId: vid, cues } });
      setSaved(r.lines);
      toast.success(c(`${r.lines} subtitle lines saved — the miner will use them.`, `${r.lines} хадмалын мөр хадгалагдлаа — майнер эдгээрийг ашиглана.`, `자막 ${r.lines}줄 저장됨 — 마이너가 사용합니다.`));
    } catch {
      toast.error(c("Could not save subtitles.", "Хадмал хадгалж чадсангүй.", "자막을 저장하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-border bg-background/50">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground">
        <Captions className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex-1">
          {c("Add subtitles yourself (optional, most reliable)", "Хадмалаа өөрөө оруулах (заавал биш, хамгийн найдвартай)", "자막 직접 추가 (선택, 가장 안정적)")}
          {saved != null && <span className="ml-2 inline-flex items-center gap-1 text-xs text-primary"><Check className="h-3 w-3" />{saved}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3 text-xs text-muted-foreground">
          <ol className="list-decimal space-y-1 pl-4">
            <li>{c("Open the video on YouTube (computer), click \"…more\" under the video, then \"Show transcript\".", "YouTube дээр бичлэгээ (компьютерээр) нээгээд доор нь \"…more\" → \"Show transcript\" дарна.", "YouTube에서 영상을 (PC로) 열고 아래 \"…더보기\" → \"스크립트 표시\"를 누르세요.")}</li>
            <li>{c("Select all lines with their times, copy, and paste below.", "Цагтайгаа бүх мөрийг сонгоод хуулж, доор буулгана.", "시간과 함께 모든 줄을 선택해 복사하고 아래에 붙여넣으세요.")}</li>
            <li>{c("Or upload your own .srt / .vtt / .txt subtitle file (e.g. from your editor or a subtitle downloader).", "Эсвэл өөрийн .srt / .vtt / .txt хадмал файлаа (засварын программ, хадмал татагчаас) оруулна.", "또는 .srt / .vtt / .txt 자막 파일을 올리세요 (편집기나 자막 다운로더에서).")}</li>
            <li>{c("Then mine as usual — the miner reads these exact lines and times, so even a 6-hour video gets full captions.", "Дараа нь ердийнхөөрөө mine хийнэ — майнер яг эдгээр мөр, цагийг уншина, 6 цагийн бичлэг ч бүтэн хадмалтай болно.", "그다음 평소처럼 마이닝하세요 — 6시간 영상도 전체 자막을 얻습니다.")}</li>
          </ol>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={"0:00\n...\n0:05\n...\n\n— or —\n00:00:01,000 --> 00:00:04,000\n..."}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-foreground hover:border-primary/60">
              <Upload className="h-3.5 w-3.5" /> {c("Upload file", "Файл оруулах", "파일 업로드")}
              <input
                type="file"
                accept=".srt,.vtt,.txt,text/plain,text/vtt"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) await submit(await f.text());
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={() => submit(text)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {c("Save subtitles", "Хадмал хадгалах", "자막 저장")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
