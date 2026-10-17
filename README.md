# Evermine: Your Mind's Vault

Build a clean, modern, single-page web app named "Evermine". 

Tagline: "A life becomes a mind."

DESIGN & LAYOUT REQUIREMENTS:

- Style: Sleek dark-mode dashboard with subtle border lines, rounded cards (12px radius), and clean typography. Include "Noto Sans Mongolian" in the font stack.

- Navigation: Left sidebar containing the app title ("Evermine"), tagline, a language selector (English / Mongolian), and quick links to sections.

- Main Workspace:

  1. Header: Page title and tagline.

  2. Top Bar / Status Banner: State indicator showing app readiness.

  3. Main Grid:

     - API Key Card: Provider selector dropdown (Google Gemini as default) and an API Key input field with a "Save Key" button.

     - Video Upload Card: Modern drag-and-drop file upload area with a primary action button ("Mine Video").

     - Results Area: Tabs for "Structured Knowledge" (bullet points), "Transcript", and "App Log".

- Primary Accent Color: Muted terracotta/clay (#e8734a). Status colors: Green for complete, Amber for processing, Red for errors.

Keep the UI responsive, spacious, and free of clutter. Focus on getting the layout completely rendered first.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://evermine-knowledge-miner.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/38c32737-cd95-407b-9774-cbd43525ae03).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
