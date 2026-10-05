/**
 * Speaking and hearing with the user's OWN Gemini key (free tier works).
 * Browsers/phones rarely ship a Mongolian voice or Mongolian speech
 * recognition, so both run through Gemini instead of the device.
 */
const TTS_MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];
const LANG_NAME: Record<string, string> = { mn: "Mongolian (Khalkha, fluent native speaker)", ko: "Korean", en: "English" };

export async function geminiSpeak(apiKey: string, text: string, lang: string, voice = "Puck"): Promise<string> {
  // The reply may mix languages in one sentence (e.g. Mongolian with English
  // game words), so never force a single pronunciation on the whole text.
  const style = `Read this aloud exactly as written, warm and conversational. Pronounce every word natively in whatever language it is written in — the text may mix ${LANG_NAME[lang] ?? "several languages"} with other languages inside one sentence, and each word must keep its own native pronunciation:`;
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
  const models = ["gemini-2.5-flash", GEMINI_DEFAULT_MODEL];
  let lastStatus = 0;
  for (const model of [...new Set(models)]) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType: mime, data: audioB64 } },
          { text: [
            `Transcribe this speech verbatim. Never translate or summarize.`,
            `The speaker's main language is ${LANG_NAME[lang] ?? "unknown"}; they are asking a question in a casual voice chat.`,
            `Speech may mix Mongolian, English, Korean in one sentence: keep each word in the language spoken.`,
            `Mongolian in correct Cyrillic spelling (fix only obvious mishearings into real Mongolian words), Korean in Hangul, English in Latin letters.`,
            `Output only the spoken words; output nothing if silent. Never invent words that were not spoken.`,
          ].join("\n") },
        ],
      }],
      generationConfig: { 
        temperature: 0,
        topP: 0.1,
        topK: 1,
      },
    }),
  });
  if (!res.ok) {
    lastStatus = res.status;
    if (res.status === 400 || res.status === 404) continue;
    throw new Error(`Gemini hearing failed: ${res.status}`);
  }
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  }
  throw new Error(`Gemini hearing failed: ${lastStatus || "no supported model"}`);
}
