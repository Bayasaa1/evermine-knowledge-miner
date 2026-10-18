import { ShareModal } from "@/components/share-modal";
import type { ShareContent } from "@/lib/share-content";

export function ShareSheet({ open, onClose, url, title, content }: { open: boolean; onClose: () => void; url: string; title: string; content?: ShareContent }) {
  return <ShareModal open={open} onClose={onClose} content={content || { kind: "video", id: url, title, url }} />;
}