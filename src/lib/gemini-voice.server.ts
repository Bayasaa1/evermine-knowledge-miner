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
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_DEFAULT_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType: mime, data: audioB64 } },
          { text: [
            `Listen and transcribe exactly what the speaker says, word for word.`,
            `Do NOT assume a single language. First detect which language each part of the speech is in, then write each part in that language's own script and spelling.`,
            `The speaker often code-switches: one sentence can mix Mongolian, English, Korean and other languages. Keep every word in the language it was actually spoken in — never translate, never force everything into one language.`,
            `Write Mongolian strictly in Cyrillic (e.g. "Сайн байна уу"). Write Korean in Hangul, English in normal Latin spelling.`,
            `Be extremely precise with Mongolian grammar, suffixes, and particles. Transcribe exactly what is heard, including filler words or hesitations if they occur, but prioritize a clean and accurate text representation of the spoken content.`,
            `The app language is ${LANG_NAME[lang] ?? "unknown"}, which is only a weak hint — trust what you actually hear over this hint.`,
            `Output only the words spoken, nothing else. If there is no speech, output nothing.`,
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
  if (!res.ok) throw new Error(`Gemini hearing failed: ${res.status}`);
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
}
