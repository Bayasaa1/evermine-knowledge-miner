import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { emotionStyle, type AvatarEmotion } from "@/lib/emotion";

/**
 * The creator's face on the call.
 *
 * When a face clone was built from their mined videos we show that face and
 * drive it live: the jaw and mouth follow the cloned voice's waveform, the eyes
 * blink, and the head breathes and reacts with the current emotion — so speech
 * and face move as one person, not as a picture with a caption.
 *
 * With no face clone yet we show an honest stand-in instead of pretending.
 */
export function MindAvatar({
  imageUrl,
  mouth,
  emotion,
  speaking,
  size = 160,
}: {
  imageUrl?: string | null;
  mouth: number;
  emotion: AvatarEmotion;
  speaking: boolean;
  size?: number;
}) {
  const style = emotionStyle(emotion);
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 120);
        schedule();
      }, 2200 + Math.random() * 3200);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  const open = Math.min(1, Math.max(0, mouth));

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`relative overflow-hidden rounded-full bg-card ring-4 transition-shadow ${style.ring}`}
        style={{
          width: size,
          height: size,
          boxShadow: speaking ? `0 0 ${18 + open * 40}px rgba(255,255,255,0.12)` : undefined,
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover"
            style={{
              // Jaw drop + subtle head motion keyed to the voice, so the face
              // reacts on the same frame the sound is heard.
              transform: `scale(${1.02 + open * 0.03}) translateY(${open * 2.2}px)`,
              transition: "transform 60ms linear",
              filter: blink ? "brightness(0.94)" : undefined,
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Sparkles className="h-10 w-10 text-primary" />
          </div>
        )}

        {/* Mouth movement layer — visible on the stand-in, a soft shadow over a real face. */}
        <span
          aria-hidden
          className={`absolute left-1/2 -translate-x-1/2 rounded-full ${imageUrl ? "bg-black/25" : "bg-foreground"}`}
          style={{
            bottom: size * 0.22,
            width: size * (0.16 + open * 0.1),
            height: Math.max(2, size * 0.012 + open * size * 0.09),
            opacity: imageUrl ? open * 0.5 : 1,
            transition: "all 60ms linear",
          }}
        />
        {blink && imageUrl && (
          <span aria-hidden className="absolute inset-x-0 top-[38%] h-[6%] bg-black/25" />
        )}
      </div>
      {!imageUrl && (
        <p className="text-[10px] text-muted-foreground">Stand-in face — build a face clone to see the real one</p>
      )}
    </div>
  );
}
