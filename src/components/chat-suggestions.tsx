import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { translateChatDisplay } from "@/lib/chat-display-translation";
import { Send } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getChatSuggestions, type ChatSuggestions as S } from "@/lib/chat-suggestions.functions";
import { ChatDisplayText } from "@/components/chat-display-text";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/lib/i18n";
import type { CreationCategory } from "@/lib/creation-category";
import { topicSuggestions, type ConversationTurn, type TopicFocus } from "@/lib/topic-conversation";

/**
 * Messenger-style quick replies: right-aligned bubbles, one tap sends.
 * Every topic opens before it develops or concludes. Never AI-written.
 */
export function ChatSuggestions({
  mindId, lang, onPick, used = [], compact = false, messages = [], focus,
}: { mindId: string | null; lang: Lang; onPick: (q: string, topic?: string) => void; used?: string[]; compact?: boolean; messages?: ConversationTurn[]; focus?: TopicFocus | undefined }) {
  const fetchFn = useServerFn(getChatSuggestions);
  const [data, setData] = useState<S | null>(null);
  useEffect(() => {
    setData(null);
    if (!mindId) return;
    let live = true;
    fetchFn({ data: { mindId } }).then((r) => live && setData(r)).catch(() => {});
    return () => { live = false; };
  }, [mindId, fetchFn]);

  const themes = useMemo(() => data?.topics.length ? data.topics : (data?.tags ?? []).map((x) => x.replace(/^#/, "")), [data]);
  const { userId } = useAuth();
  // Topic names are translated on their own, because inside a mixed sentence
  // the translator thinks the line is already in the target language.
  const [labels, setLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    setLabels({});
    if (lang === "en" || !data) return;
    const names = Array.from(new Set([...themes, ...(focus ? [focus.title] : []), ...Object.values(data.branches ?? {}).flat()]));
    let live = true;
    void Promise.all(names.map((n) => translateChatDisplay(n, lang, userId ?? "visitor").then((t) => [n, t] as const).catch(() => [n, n] as const)))
      .then((pairs) => { if (live) setLabels(Object.fromEntries(pairs)); });
    return () => { live = false; };
  }, [themes, data, lang, focus, userId]);
  const asked = new Set(used.map((u) => u.trim()));
  const available = topicSuggestions({ turns: messages, topics: themes, lang, focus, creatorQuestions: data?.creatorQuestions, branches: data?.branches, labels, topicAliases: data?.topicAliases })
    .filter((c) => !asked.has(c.text.trim()));
  const limit = compact ? 3 : 5;
  const chips = available.slice(0, limit);

  return (
    <div className="space-y-3">
      {!compact && !focus && data?.greeting && (
        <div className="max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-sm text-foreground"><ChatDisplayText text={data.greeting} lang={lang} /></div>
      )}
      {chips.length > 0 && (
        <div className="flex flex-col items-end gap-2">
          {chips.map((c) => (
            <ChatDisplayText key={c.text} text={c.text} lang={lang} controls={false}>{(shown) => asked.has(shown.trim()) ? null : <Button
              type="button"
              variant="ghost"
              onClick={() => onPick(shown, c.topic)}
              className="h-auto max-w-full whitespace-normal items-center gap-2 rounded-2xl bg-primary/15 px-4 py-2 text-right text-sm font-normal text-foreground transition-colors hover:bg-primary/25"
            >
              <span>{shown}</span>
              <Send className="h-4 w-4 shrink-0 text-primary" />
            </Button>}</ChatDisplayText>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Multimodal Diagnostic Drop ---------- */

export type DiagnosticChip = {
  id: string;
  label: Record<Lang, string>;
  /** File-picker filter for the formats this Mind can diagnose. */
  accept: string;
  /** Expert diagnostic + Mastery Challenge request, pre-filled on tap. */
  prompt: Record<Lang, string>;
};

const DIAGNOSTIC_CHIPS: Record<string, DiagnosticChip> = {
  movement: {
    id: "movement",
    label: {
      en: "📸 Upload Form Photo / Dish Spec for Critique",
      mn: "📸 Хөдөлгөөний зураг / Хоолны жорыг шүүмжлүүлэх",
      ko: "📸 자세 사진 / 요리 스펙 비평받기",
    },
    accept: ".jpg,.jpeg,.png,.webp,.mp4,.docx",
    prompt: {
      en: "I attached my form/dish file. Give me a full expert critique — what I'm doing wrong, why, and the exact fix — then give me a Mastery Challenge to drill it.",
      mn: "Би хөдөлгөөн/хоолны файл хавсаргалаа. Юг буруу байгаа, яагаад, яаж засахыг нарийн шүүмжилж, дараа нь дасгалжуулах Сорилт өгнө үү.",
      ko: "자세/요리 파일을 첨부했습니다. 무엇이 잘못됐는지, 왜인지, 정확한 교정법을 전문가처럼 비평해 주고, 연습용 마스터리 챌린지도 주세요.",
    },
  },
  knowledge: {
    id: "knowledge",
    label: {
      en: "📊 Upload Lab / Biomarker / Financial Sheet for Analysis",
      mn: "📊 Лаборатори / Биомаркер / Санхүүгийн хүснэгт шинжлүүлэх",
      ko: "📊 검사/바이오마커/재무 시트 분석받기",
    },
    accept: ".xlsx,.xls,.csv,.pdf",
    prompt: {
      en: "I attached my data sheet. Analyze it like an expert — find the problems, explain the causes, and prescribe the exact protocol — then give me a Mastery Challenge.",
      mn: "Би өгөгдлийн хүснэгт хавсаргалаа. Мэргэжилтэн шиг шинжилж, асуудал, шалтгаан, яг протоколыг хэлээд, дараа нь Сорилт өгнө үү.",
      ko: "데이터 시트를 첨부했습니다. 전문가처럼 분석해서 문제와 원인, 정확한 프로토콜을 알려주고, 마스터리 챌린지도 주세요.",
    },
  },
  robot: {
    id: "robot",
    label: {
      en: "🤖 Upload Telemetry / Policy Config for Failure Diagnosis",
      mn: "🤖 Телеметри / Полиси тохиргоо — алдааны оношлогоо",
      ko: "🤖 텔레메트리 / 정책 설정 고장 진단",
    },
    accept: ".csv,.json,.txt,.log",
    prompt: {
      en: "I attached my robot telemetry/policy config. Diagnose the failure like a robotics engineer — root cause, evidence in the data, and the exact fix — then give me a Mastery Challenge.",
      mn: "Би роботын телеметри/полиси файл хавсаргалаа. Робот инженер шиг алдааны үндсэн шалтгаан, нотолгоо, яг засварыг хэлээд, дараа нь Сорилт өгнө үү.",
      ko: "로봇 텔레메트리/정책 설정을 첨부했습니다. 로봇 엔지니어처럼 고장의 근본 원인, 데이터 근거, 정확한 수정법을 진단하고, 마스터리 챌린지도 주세요.",
    },
  },
  gaming: {
    id: "gaming",
    label: {
      en: "🎯 Upload Match Telemetry / Clip for Playbook Review",
      mn: "🎯 Тоглолтын телеметри / Бичлэг — тактикын шүүмж",
      ko: "🎯 매치 텔레메트리 / 클립 플레이북 리뷰",
    },
    accept: ".csv,.mp4,.jpg,.jpeg,.png",
    prompt: {
      en: "I attached my match telemetry/clip. Review my play like a pro coach — what I did wrong, the decision I should have made, and a drill to fix it — then give me a Mastery Challenge.",
      mn: "Би тоглолтын телеметри/бичлэг хавсаргалаа. Профи коуч шиг алдаа, зөв шийдвэр, засах дасгалыг хэлээд, дараа нь Сорилт өгнө үү.",
      ko: "매치 텔레메트리/클립을 첨부했습니다. 프로 코치처럼 잘못된 플레이, 올바른 판단, 교정 드릴을 알려주고, 마스터리 챌린지도 주세요.",
    },
  },
};

/** Sales and legacy voice minds read as knowledge diagnostics. */
export function diagnosticChipFor(category: CreationCategory | string | null | undefined): DiagnosticChip {
  return DIAGNOSTIC_CHIPS[category ?? ""] ?? DIAGNOSTIC_CHIPS["knowledge"]!;
}

/**
 * "📎 Multimodal Diagnostic Drop" quick-action chip above the input bar,
 * tailored to the Mind's creation category. Tapping it pre-fills an expert
 * diagnostic + Mastery Challenge request and opens a pre-filtered picker.
 */
export function DiagnosticChips({
  category,
  lang,
  disabled = false,
  onPick,
}: {
  category: CreationCategory | string;
  lang: Lang;
  disabled?: boolean;
  onPick: (chip: DiagnosticChip) => void;
}) {
  const chip = diagnosticChipFor(category);
  return (
    <div className="flex flex-wrap gap-1.5 border-t border-border px-3 pt-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onPick(chip)}
        className="rounded-full border border-dashed border-primary/50 bg-primary/10 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-primary/20 disabled:opacity-50"
      >
        {chip.label[lang] ?? chip.label.en}
      </button>
    </div>
  );
}
