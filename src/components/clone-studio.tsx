import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Smile, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { getUserAiKeyStatus, saveUserAiKey } from "@/lib/user-ai-keys.functions";
import { extractVoiceSample } from "@/lib/voice-sample";
import {
  deleteClone,
  findClone,
  isLive,
  listClones,
  upsertClone,
  type PersonaClone,
} from "@/lib/persona-clones";

/**
 * Voice and face cloning for a persona.
 *
 * The voice clone is built from the creator's own speech taken out of a video
 * they mined, so the Mind answers in their real voice — in any language, not a
 * generic reader voice. The face clone is the face callers see, moved live by
 * that same voice. Both need the owner to confirm it is them.
 */
export function CloneStudio({
  userId,
  personaId,
  personaName,
}: {
  userId: string;
  personaId: string;
  personaName: string;
}) {
  const [clones, setClones] = useState<PersonaClone[]>([]);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [faceUrl, setFaceUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // Your own voice key. Without it, minds speak with the free device voice.
  const [voiceKey, setVoiceKey] = useState("");
  const [hasVoiceKey, setHasVoiceKey] = useState(false);

  const voice = findClone(clones, "voice");
  const face = findClone(clones, "face");

  const reload = async () => {
    const rows = await listClones(personaId);
    setClones(rows);
    const f = findClone(rows, "face");
    if (f?.remote_id) setFaceUrl(f.remote_id);
    if (findClone(rows, "voice")?.consent || f?.consent) setConsent(true);
  };

  useEffect(() => {
    void reload();
  }, [personaId]);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await getUserAiKeyStatus();
        setHasVoiceKey(rows.some((r) => r.provider === "elevenlabs"));
      } catch {
        /* not signed in yet */
      }
    })();
  }, []);

  const saveVoiceKey = async () => {
    const key = voiceKey.trim();
    if (key.length < 8) {
      setStatus("Paste your voice key first.");
      return;
    }
    setBusy(true);
    try {
      await saveUserAiKey({ data: { provider: "elevenlabs", apiKey: key } });
      setHasVoiceKey(true);
      setVoiceKey("");
      setStatus("Voice key saved. You can build your real voice now.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "That key was not saved.");
    } finally {
      setBusy(false);
    }
  };

  const buildVoice = async (file: File) => {
    if (!consent) {
      setStatus("Confirm this is your own voice first.");
      return;
    }
    setBusy(true);
    try {
      setStatus("Taking a clean 60-second speech sample from your video…");
      const sample = await extractVoiceSample(file, 0, 60, { isolateSpeech: true });
      const blob = await (await fetch(sample.url)).blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read the sample."));
        reader.readAsDataURL(blob);
      });

      await upsertClone({ userId, personaId, kind: "voice", status: "building", consent: true, error: null });
      setStatus("Building your voice clone…");
      const res = await apiFetch("/api/voice-clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${personaName} (Evermind)`, consent: true, samples: [dataUrl] }),
      });
      const data = (await res.json()) as { voiceId?: string; engine?: string; error?: string };
      if (!res.ok || !data.voiceId) {
        await upsertClone({
          userId,
          personaId,
          kind: "voice",
          status: "error",
          error: data.error ?? "Cloning failed.",
        });
        setStatus(data.error ?? "Cloning failed.");
      } else {
        await upsertClone({
          userId,
          personaId,
          kind: "voice",
          engine: data.engine ?? "elevenlabs",
          remoteId: data.voiceId,
          status: "ready",
          error: null,
          consent: true,
          samples: [{ label: file.name.slice(0, 60), seconds: Math.round(sample.duration), source: "mined video" }],
        });
        setStatus("Your voice clone is live — calls now answer in your own voice.");
      }
      await reload();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Cloning failed.");
    } finally {
      setBusy(false);
    }
  };

  const saveFace = async () => {
    if (!consent) {
      setStatus("Confirm this is your own face first.");
      return;
    }
    setBusy(true);
    await upsertClone({
      userId,
      personaId,
      kind: "face",
      engine: "canvas",
      remoteId: faceUrl.trim() || null,
      status: faceUrl.trim().startsWith("https://") ? "ready" : "draft",
      consent: true,
      error: null,
    });
    await reload();
    setBusy(false);
    setStatus(
      faceUrl.trim().startsWith("https://")
        ? "Your face is live on calls and moves with your voice."
        : "Add a direct https link to a clear photo of your face.",
    );
  };

  const remove = async (kind: "voice" | "face") => {
    setBusy(true);
    await deleteClone(personaId, kind);
    if (kind === "face") setFaceUrl("");
    await reload();
    setBusy(false);
    setStatus("Clone removed.");
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <header>
        <h3 className="text-sm font-semibold">Your voice and face</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Build them once and {personaName} talks to people in your real voice, in whatever language they choose, with
          your face reacting as you speak.
        </p>
      </header>

      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        <span>This is my own voice and face, and I allow Evermind to use them for this persona.</span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-border p-4">
          <p className="flex items-center gap-2 text-xs font-semibold">
            <Mic className="h-3.5 w-3.5" /> Voice
          </p>
          <p className="text-[11px] text-muted-foreground">
            {isLive(voice)
              ? "Live — every call uses your cloned voice."
              : voice?.status === "error"
                ? voice.error ?? "Last build failed."
                : "Not built yet — calls use a stand-in voice until you build it."}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="video/*,audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void buildVoice(file);
              e.target.value = "";
            }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {isLive(voice) ? "Rebuild from a video" : "Build from a video"}
            </button>
            {voice && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove("voice")}
                aria-label="Remove voice clone"
                className="rounded-lg border border-border px-2 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-border p-4">
          <p className="flex items-center gap-2 text-xs font-semibold">
            <Smile className="h-3.5 w-3.5" /> Face
          </p>
          <p className="text-[11px] text-muted-foreground">
            {isLive(face) ? "Live on video calls." : "Not set — callers see a stand-in face."}
          </p>
          <input
            value={faceUrl}
            onChange={(e) => setFaceUrl(e.target.value)}
            placeholder="https://… clear photo of your face"
            className="w-full rounded-lg border border-border bg-muted px-3 py-1.5 text-xs outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveFace()}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              Save face
            </button>
            {face && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove("face")}
                aria-label="Remove face clone"
                className="rounded-lg border border-border px-2 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {status && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {status}
        </p>
      )}
    </section>
  );
}
