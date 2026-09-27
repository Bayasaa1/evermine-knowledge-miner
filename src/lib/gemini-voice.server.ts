/**
 * Speaking and hearing with the user's OWN Gemini key (free tier works).
 * Browsers/phones rarely ship a Mongolian voice or Mongolian speech
 * recognition, so both run through Gemini instead of the device.
 */
const TTS_MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];
const LANG_NAME: Record<string, string> = { mn: "Mongolian (Khalkha, fluent native speaker)", ko: "Korean", en: "English" };

export async function geminiSpeak(apiKey: string, text: string, lang: string, voice = "Puck"): Promise<string> {
  const style = `Read this aloud in ${LANG_NAME[lang] ?? "the text's own language"}, with natural native pronunciation, warm and conversational:`;
  let last = "";
  for (const model of TTS_MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${style}\n\n${text.slice(0, 3000)}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] };
      const audio = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
      if (audio) return audio; // base64 PCM16 mono 24kHz
      last = "empty audio";
      continue;
    }
    last = `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`;
    if (res.status !== 404 && res.status !== 400) break;
  }
  throw new Error(`Gemini voice failed: ${last}`);
}

export async function geminiHear(apiKey: string, audioB64: string, mime: string, lang: string): Promise<string> {
  const { GEMINI_DEFAULT_MODEL } = await import("@/lib/gemini-models");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_DEFAULT_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType: mime, data: audioB64 } },
          { text: `Transcribe exactly what the speaker says. The speaker most likely speaks ${LANG_NAME[lang] ?? "any language"}; write Mongolian in Cyrillic. Output only the words spoken, nothing else. If there is no speech, output nothing.` },
        ],
      }],
      generationConfig: { temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini hearing failed: ${res.status}`);
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
}
