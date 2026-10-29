import { useEffect, useRef, useState } from "react";
import { ExternalLink, ImageOff } from "lucide-react";
import { roomMediaUrl, type RoomAttachment } from "@/lib/chat-rooms";
import { SharedContentCard } from "@/components/chat/shared-content-card";
import type { ShareContent } from "@/lib/share-content";

export function RoomMedia({ attachment, onMind, openLabel, onAdd }: { attachment: RoomAttachment; onMind: (id: string) => void; openLabel: string; onAdd?: (content: ShareContent) => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const resumeRef = useRef<{ t: number; playing: boolean } | null>(null);
  const path = attachment.kind === "mind" ? "" : attachment.path;
  useEffect(() => {
    let live = true;
    setUrl(""); setError(false);
    const refresh = () => { if (path) void roomMediaUrl(path).then((u) => {
      if (!live) return;
      // The signed URL rotates every 50s; remember playback position so the video does not restart.
      const v = videoRef.current;
      if (v && v.currentTime > 0) resumeRef.current = { t: v.currentTime, playing: !v.paused };
      setUrl(u);
    }).catch(() => { if (live) setError(true); }); };
    refresh();
    const timer = window.setInterval(refresh, 50 * 1000);
    return () => { live = false; window.clearInterval(timer); };
  }, [path]);
  if (attachment.kind === "mind" && attachment.share) return <div className="my-2"><SharedContentCard content={attachment.share} onMind={onMind} {...(onAdd ? { onAdd } : {})} /></div>;
  if (attachment.kind === "mind") return <div className="my-2"><SharedContentCard content={{ kind: attachment.mindId.startsWith("project:") ? "project" : "mind", id: attachment.mindId, mindId: attachment.mindId, title: attachment.name, url: `https://ever-mind.dev/search?q=${encodeURIComponent(attachment.name)}` }} onMind={onMind} {...(onAdd ? { onAdd } : {})} /></div>;
  if (error) return <div className="flex items-center gap-2 py-3 text-muted-foreground"><ImageOff className="h-4 w-4" />{attachment.name}</div>;
  if (!url) return <div className="my-2 h-32 animate-pulse rounded-lg bg-muted" />;
  return attachment.kind === "image"
    ? <a href={url} target="_blank" rel="noopener noreferrer" aria-label={openLabel}><img src={url} alt={attachment.name} loading="lazy" onError={() => setError(true)} className="my-2 max-h-80 w-full rounded-lg object-contain" /></a>
    : <video ref={videoRef} src={url} controls playsInline preload="metadata" className="my-2 max-h-80 w-full rounded-lg" onLoadedMetadata={() => {
        const r = resumeRef.current;
        if (r && videoRef.current) {
          videoRef.current.currentTime = r.t;
          if (r.playing) void videoRef.current.play().catch(() => {});
          resumeRef.current = null;
        }
      }} />;
}

export function RoomAvatar({ path, title }: { path: string | null; title: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    setUrl("");
    if (path) void roomMediaUrl(path).then((u) => { if (live) setUrl(u); }).catch(() => {});
    return () => { live = false; };
  }, [path]);
  return <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold">{url ? <img src={url} alt={title} onError={() => setUrl("")} className="h-full w-full object-cover" /> : title.slice(0, 1).toUpperCase()}</div>;
}

export function SharedLink({ url, openLabel }: { url: string; openLabel: string }) {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (!["https:", "http:"].includes(parsed.protocol)) return null;
  const youtube = ["www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"].includes(parsed.hostname);
  const id = parsed.hostname === "youtu.be" ? parsed.pathname.slice(1) : parsed.searchParams.get("v") || parsed.pathname.match(/\/(?:shorts|embed)\/([\w-]+)/)?.[1];
  return <a href={parsed.href} target="_blank" rel="noopener noreferrer" className="my-2 flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground">
    {youtube && id && /^[\w-]{11}$/.test(id) && <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" className="aspect-video w-full object-cover" />}
    <span className="flex items-center gap-2 p-3 text-xs"><ExternalLink className="h-3 w-3 shrink-0" /><span className="min-w-0 truncate">{openLabel} · {parsed.hostname}</span></span>
  </a>;
}