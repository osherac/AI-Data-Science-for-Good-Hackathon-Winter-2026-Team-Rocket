# Talkbridge

Talkbridge is a voice-first, image-assisted English learning app for newcomers practicing real-world conversations (school, doctor, store, transit, and work).

## What the software does

- Lets learners record short speech samples and saves transcripts locally.
- Lets learners upload or capture a photo of a real-life situation.
- Generates a role-play conversation based on the learner profile + scene.
- Suggests simple reply options learners can tap.
- Reads agent lines aloud with text-to-speech.
- Continues the conversation turn-by-turn to simulate practice.

## How it works

1. The learner records audio in the browser.
2. Audio is sent to `/api/transcribe` (OpenAI Whisper) and transcript is stored in `localStorage`.
3. The learner uploads/captures an image and picks a scenario category.
4. The app calls:
- `/api/vision` to describe the scene.
- `/api/scenario` to generate the conversation starter and reply suggestions.
5. `/api/scenario` runs a LangGraph pipeline:
- `learner` agent profiles the learner from saved transcripts/history.
- `image_understanding` agent summarizes the image context.
- `orchestrator` combines learner + scene into structured scenario context.
- `planner` drafts conversation plan and suggestions.
- `task_generator` creates the next agent line.
- `feedback` validates/simplifies output quality.
6. Agent text is optionally sent to `/api/tts` (Cartesia) and played back in the UI.
7. On every learner response, `/api/scenario` is called again with `conversationHistory` to get the next turn.

## Technologies used

### Frontend

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS 4
- Browser APIs: `MediaRecorder`, `getUserMedia`, `localStorage`
- PWA support (`manifest.webmanifest`, service worker registration)

### Backend / AI

- Next.js Route Handlers (`app/api/*`)
- LangGraph (`@langchain/langgraph`) for multi-agent orchestration
- LangChain Core + Google GenAI integration
- Gemini models (`gemini-2.0-flash`, `gemini-2.5-flash`) for scenario and vision reasoning
- OpenAI Whisper (`whisper-1`) for speech-to-text
- Cartesia TTS (`sonic-3`) for voice playback

### Deployment

- OpenNext Cloudflare adapter (`@opennextjs/cloudflare`)
- Cloudflare Workers + Wrangler

## API endpoints

- `POST /api/transcribe`:
- Input: multipart form with `audio`
- Output: `{ transcript: string }`

- `POST /api/vision`:
- Input: `{ imageBase64, imageMimeType }`
- Output: `{ description: string }`

- `POST /api/scenario`:
- Input: learner info, image (optional), scenario context, conversation history
- Output: `{ voiceAgentLine: string, suggestedUserResponses: string[] }`

- `POST /api/tts`:
- Input: `{ transcript: string }`
- Output: `{ audioBase64: string, mimeType: string }`

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Add environment variables (`.env.local`)

```bash
GEMINI_API_KEY=...
OPENAI_API_KEY=...
CARTESIA_API_KEY=...
```

### 3. Start dev server

```bash
npm run dev
```

Open `http://localhost:3000`.

## Deployment (Cloudflare)

```bash
npm run deploy
```

This builds with OpenNext and deploys to Cloudflare Workers.

For full hosting/domain setup, see [`HOSTING.md`](./HOSTING.md).

## Project structure

```text
app/
  api/
    scenario/route.ts
    transcribe/route.ts
    tts/route.ts
    vision/route.ts
  page.tsx
lib/
  scenario-graph.ts
  scenario-state.ts
```