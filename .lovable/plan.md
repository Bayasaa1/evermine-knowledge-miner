# Чат шинэчлэх товч — дүрс + ой санамжийн reset

## Юу хийх вэ

### 1. Reset товчийг Refresh-тэй андуурахгүй болгох
- `src/components/talk-to-mind-modal.tsx`-ийн толгойд байгаа `RotateCcw` (эргэдэг сум) дүрсийг **`Eraser`** (баллуур) дүрсээр солино.
- Хажууд нь жижиг бичиг (`Шинэ яриа` / `New chat` / `새 채팅`) нэмж, зөвхөн дүрс бус тодорхой болгоно.

### 2. Reset = чат + ой санамж хоёулаа цэвэрлэгдэнэ
- Одоогийн `resetChat` зөвхөн `chat_messages`-ийг устгадаг. Одоо:
  - `chat_messages` (тухайн mind-тай яриа) — бүрэн устгана.
  - `viewer_brains.payload` доторх тухайн mind-ийн session ой санамж — мөн цэвэрлэнэ (Mind таныг дахиад "таньсан" хэвээр үлдэхгүй).
- `viewer-brain.functions.ts`-д mindId-аар ой санамжийг цэвэрлэх шинэ server function нэмнэ (user_id шалгалттай).

### 3. Анхааруулга текст (дарахын өмнө)
- `window.confirm` дээр одоогийн "Reset this chat?" оронд:
  - MN: "Энэ яриаг бүрэн шинэчлэх үү? Бүх мессеж болон энэ Mind-ийн таны тухай ой санамж устана. Буцаах боломжгүй."
  - EN: "Fully reset this chat? All messages and this Mind's memory of you will be deleted. This cannot be undone."
  - KO: 동일한 의미로 번역.
- Эдгээр текстийг `src/lib/i18n.ts`-ийн орчуулгын объектод нэмж, гурван хэл дээр зөв харагдуулна.

## Техникийн дэлгэрэнгэй
- Өөрчлөгдөх файлууд: `src/components/talk-to-mind-modal.tsx`, `src/lib/viewer-brain.functions.ts`, `src/lib/i18n.ts`.
- viewer_brains мөр байхгүй бол (шинэ хэрэглэгч) алдаагүй алгасна.
- Шалгалт: `bunx tsgo --noEmit`, дараа нь build log шалгана.
