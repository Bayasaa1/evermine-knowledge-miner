# Why subtitles stay untranslated — and the fix

## What I found

I signed in as a real viewer, played a Mongolian video and watched the live app:

- With subtitles set to **Korean**, they translate correctly. I captured the Korean lines on screen, and the replies came back through the OpenRouter key on the Translating job.
- With subtitles set to **English** — the default choice almost everyone lands on — nothing is ever translated. The Mongolian speech stays Mongolian.

The cause is in the shared translation cache: English is treated as "the language everything is already written in". Any request for English text is answered instantly with the original string and never sent to the AI. That was true back when all mined text was stored in English, but videos are now mined in the language they were spoken in — Mongolian, Korean, anything — so English viewers get the raw source and it looks like translation is broken.

This affects more than the new subtitle picker: every mined title, description, tag and moment label on the app also stays in its original language whenever the app language is English.

## The fix

Stop treating English as a special "no work needed" case, while keeping the cost saving that rule was protecting.

1. Text already written in plain Latin letters is still left alone when the target is English — that is the genuinely free case and it is what keeps English pages from paying to translate themselves.
2. Anything else (Mongolian Cyrillic, Korean, Japanese, Chinese, Arabic …) is translated into English through exactly the same cached, batched path every other language uses — the Translating job in the API Manager, with its automatic key switching.
3. English results are cached and saved on the device like every other language, so a line is paid for once.

## Where it changes

- `src/lib/dynamic-translate.ts`: `getCachedTranslation` no longer returns the source string for `en`; `requestTranslation` no longer refuses `en`. Both gain the same Latin-only shortcut that `display()` already uses, so English→English is still never sent. The cache key stays `evermind-i18n-cache:en`.
- `src/lib/i18n.ts`: `display()` keeps its Latin-only guard (now the single place that decides "no translation needed"); `tr()` keeps returning the local dictionary string for `en` first, so UI labels are untouched.

No backend, schema or API Manager change: the same `translateTexts` server function and the same account keys do the work.

## How it will be proved

Signed in as a real viewer, on a Mongolian video: subtitle language English shows English lines, Korean shows Korean, "Original (as spoken)" shows Mongolian — with the History in the API Manager showing those exact calls on the assigned key.
