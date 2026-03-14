"use client";

import { useCallback, useRef, useState } from "react";

const SCRIPTS_KEY = "talkbridge_scripts";
const CATEGORIES = [
  { id: "school", label: "School" },
  { id: "doctor", label: "Doctor" },
  { id: "store", label: "Store" },
  { id: "transit", label: "Transit" },
  { id: "work", label: "Work" },
] as const;

type View = "home" | "record" | "start-upload" | "conversation";

function Icon({
  name,
  className,
  size = 24,
}: {
  name: string;
  className?: string;
  size?: number;
}) {
  const s = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    className,
    "aria-hidden": true,
  };
  const path: Record<string, React.ReactNode> = {
    mic: (
      <>
        <rect x="9" y="4" width="6" height="10" rx="3" />
        <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0" />
        <path d="M12 17v3" />
        <path d="M9 20h6" />
      </>
    ),
    play: (
      <path d="M6 4v16l12-8L6 4z" fill="currentColor" stroke="none" />
    ),
    upload: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </>
    ),
    record: (
      <circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />
    ),
    back: (
      <>
        <path d="M19 12H5" />
        <polyline points="12 19 5 12 12 5" />
      </>
    ),
    home: (
      <>
        <path d="m4 11 8-6 8 6" />
        <path d="M6 10.8V19h12v-8.2" />
      </>
    ),
    person: (
      <>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
      </>
    ),
  };
  return <svg {...s}>{path[name] ?? null}</svg>;
}

function getStoredScripts(): { transcript: string; date: string }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SCRIPTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveScript(transcript: string) {
  const scripts = getStoredScripts();
  scripts.push({ transcript, date: new Date().toISOString() });
  localStorage.setItem(SCRIPTS_KEY, JSON.stringify(scripts));
}

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribeStatus, setTranscribeStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [lastTranscript, setLastTranscript] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [conversation, setConversation] = useState<
    { role: "agent" | "user"; text: string }[]
  >([]);
  const [agentLine, setAgentLine] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [startStatus, setStartStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [startError, setStartError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      setTranscribeStatus("idle");
      setLastTranscript("");
    } catch (e) {
      console.error(e);
      setTranscribeStatus("error");
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state !== "recording") {
      setRecording(false);
      return;
    }
    mr.stop();
    setRecording(false);
    setTranscribeStatus("loading");
    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const form = new FormData();
      form.set("audio", blob, "audio.webm");
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const raw = await res.text();
      if (!res.ok) {
        let errorMessage = "Transcription failed";
        try {
          const data = JSON.parse(raw) as { error?: string };
          errorMessage = data.error || raw || errorMessage;
        } catch {
          errorMessage = raw || errorMessage;
        }
        console.error("[transcribe] API error", res.status, errorMessage);
        throw new Error(errorMessage);
      }
      const data = JSON.parse(raw) as { transcript?: string };
      const transcript = data.transcript ?? "";
      setLastTranscript(transcript);
      if (transcript) saveScript(transcript);
      setTranscribeStatus("done");
    } catch (e) {
      setTranscribeStatus("error");
      setLastTranscript(e instanceof Error ? e.message : "Failed");
      console.error("[transcribe] Failed:", e);
    }
  }, []);

  const runStartFlow = useCallback(async () => {
    if (!imageFile) return;
    setStartStatus("loading");
    setStartError("");
    try {
      const buf = await imageFile.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buf).reduce((acc, b) => acc + String.fromCharCode(b), "")
      );
      const mime = imageFile.type || "image/jpeg";

      const [visionRes, scenarioRes] = await Promise.all([
        fetch("/api/vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, imageMimeType: mime }),
        }),
        (async () => {
          const scripts = getStoredScripts();
          const userInfo = {
            pastScripts: scripts.slice(-10).map((s) => s.transcript),
          };
          return fetch("/api/scenario", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: base64,
              imageMimeType: mime,
              userInfo,
              scenarioContext: selectedCategory || undefined,
            }),
          });
        })(),
      ]);

      if (!visionRes.ok) throw new Error("Image understanding failed");
      if (!scenarioRes.ok) {
        const err = await scenarioRes.json();
        throw new Error(err.error || "Scenario failed");
      }

      const scenario = await scenarioRes.json();
      setAgentLine(scenario.voiceAgentLine ?? "");
      setSuggestions(Array.isArray(scenario.suggestedUserResponses) ? scenario.suggestedUserResponses : []);
      setConversation([{ role: "agent", text: scenario.voiceAgentLine ?? "" }]);
      setStartStatus("ready");
      setView("conversation");
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Something went wrong");
      setStartStatus("error");
    }
  }, [imageFile, selectedCategory]);

  const playAgentLine = useCallback(async () => {
    if (!agentLine) return;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: agentLine }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const audio = new Audio(`data:${data.mimeType};base64,${data.audioBase64}`);
      await audio.play();
    } catch (e) {
      console.error("TTS play failed", e);
    }
  }, [agentLine]);

  const pickSuggestion = useCallback(
    async (text: string) => {
      const newHistory = [...conversation, { role: "user" as const, text }];
      setConversation(newHistory);
      setSuggestions([]);
      setAgentLine("");
      try {
        const scripts = getStoredScripts();
        const res = await fetch("/api/scenario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userInfo: { pastScripts: scripts.slice(-10).map((s) => s.transcript) },
            scenarioContext: selectedCategory || undefined,
            conversationHistory: newHistory,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const agentText = data.voiceAgentLine ?? "";
        setAgentLine(agentText);
        setSuggestions(Array.isArray(data.suggestedUserResponses) ? data.suggestedUserResponses : []);
        setConversation((c) => [...c, { role: "agent", text: agentText }]);
      } catch (e) {
        console.error(e);
      }
    },
    [conversation, selectedCategory]
  );

  return (
    <main className="mobile-shell">
      <section className="phone-frame">
        <header className="top-bar">
          <div className="brand">
            <span className="brand-mark">
              <Icon name="mic" size={20} />
            </span>
            <div>
              <p>Talkbridge</p>
              <span>
                {view === "home" && "Practice speaking"}
                {view === "record" && "Record conversation"}
                {view === "start-upload" && "Start with image"}
                {view === "conversation" && "Conversation"}
              </span>
            </div>
          </div>
          {(view === "record" || view === "start-upload" || view === "conversation") && (
            <button
              type="button"
              className="icon-circle"
              aria-label="Back"
              onClick={() => {
                setView("home");
                setStartStatus("idle");
                setImagePreview(null);
                setImageFile(null);
                setConversation([]);
                setAgentLine("");
                setSuggestions([]);
              }}
            >
              <Icon name="back" className="small-glyph" size={20} />
            </button>
          )}
          {view === "home" && (
            <button type="button" className="icon-circle" aria-label="Profile">
              <Icon name="person" className="small-glyph" size={20} />
            </button>
          )}
        </header>

        {view === "home" && (
          <>
            <section className="main-card">
              <div className="flex flex-col items-center gap-6">
                <p className="text-lg font-semibold text-[var(--foreground)]">
                  What would you like to do?
                </p>
                <div className="grid w-full grid-cols-2 gap-4">
                  <button
                    type="button"
                    className="action-button flex min-h-[5.5rem] flex-col"
                    onClick={() => setView("record")}
                    aria-label="Record conversation"
                  >
                    <span className="action-icon">
                      <Icon name="record" className="glyph" size={28} />
                    </span>
                    <span>Record</span>
                  </button>
                  <button
                    type="button"
                    className="action-button flex min-h-[5.5rem] flex-col"
                    onClick={() => setView("start-upload")}
                    aria-label="Start with image"
                  >
                    <span className="action-icon">
                      <Icon name="upload" className="glyph" size={24} />
                    </span>
                    <span>Start</span>
                  </button>
                </div>
              </div>
            </section>
            <section className="scenario-row">
              <p className="w-full text-sm font-semibold text-[var(--foreground)]/70">
                Situation
              </p>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`chip ${selectedCategory === cat.id ? "selected" : ""}`}
                  onClick={() =>
                    setSelectedCategory(selectedCategory === cat.id ? null : cat.id)
                  }
                >
                  {cat.label}
                </button>
              ))}
            </section>
          </>
        )}

        {view === "record" && (
          <section className="main-card flex flex-col items-center justify-center gap-6">
            {!recording && transcribeStatus === "idle" && (
              <button
                type="button"
                className="big-start"
                onClick={startRecording}
                aria-label="Start recording"
              >
                <span className="big-ring">
                  <Icon name="mic" className="mic-glyph" size={40} />
                </span>
                <span className="big-label">Tap to record</span>
              </button>
            )}
            {recording && (
              <button
                type="button"
                className="big-start"
                onClick={stopRecording}
                aria-label="Stop recording"
              >
                <span className="big-ring bg-red-500/20">
                  <Icon name="record" className="mic-glyph" size={40} />
                </span>
                <span className="big-label">Stop</span>
              </button>
            )}
            {transcribeStatus === "loading" && (
              <p className="text-[var(--foreground)]/70">Transcribing…</p>
            )}
            {transcribeStatus === "done" && (
              <div className="w-full space-y-3">
                <p className="text-sm font-semibold text-[var(--foreground)]">Saved to device</p>
                <p className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 text-sm text-[var(--foreground)]">
                  {lastTranscript || "—"}
                </p>
              </div>
            )}
            {transcribeStatus === "error" && !recording && (
              <p className="text-sm text-red-600">Recording or transcription failed.</p>
            )}
          </section>
        )}

        {view === "start-upload" && (
          <section className="main-card flex flex-1 flex-col gap-4">
            <p className="text-center text-[var(--foreground)]">
              Upload an image of the situation (e.g. pharmacy, bus, office).
            </p>
            {!imagePreview ? (
              <label className="flex min-h-[12rem] cursor-pointer flex-col items-center justify-center rounded-[var(--radius-card)] border-2 border-dashed border-[var(--line)] bg-[var(--panel)] transition hover:bg-[var(--pastel-sky)]/30">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setImageFile(f);
                      const r = new FileReader();
                      r.onload = () => setImagePreview(r.result as string);
                      r.readAsDataURL(f);
                    }
                  }}
                />
                <Icon name="upload" size={40} className="text-[var(--foreground)]/50" />
                <span className="mt-2 text-sm font-semibold text-[var(--foreground)]/70">
                  Tap to choose image
                </span>
              </label>
            ) : (
              <>
                <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--panel)]">
                  <img
                    src={imagePreview}
                    alt="Upload"
                    className="h-full w-full object-cover"
                  />
                </div>
                {startStatus === "idle" && (
                  <button
                    type="button"
                    className="action-button min-h-[3.5rem] w-full"
                    onClick={runStartFlow}
                  >
                    Generate conversation
                  </button>
                )}
                {startStatus === "loading" && (
                  <p className="text-center text-[var(--foreground)]/70">Understanding image & generating script…</p>
                )}
                {startStatus === "error" && (
                  <>
                    <p className="text-center text-sm text-red-600">{startError}</p>
                    <button
                      type="button"
                      className="action-button min-h-[3rem]"
                      onClick={runStartFlow}
                    >
                      Try again
                    </button>
                  </>
                )}
              </>
            )}
          </section>
        )}

        {view === "conversation" && (
          <section className="main-card flex flex-1 flex-col gap-4 overflow-auto">
            <div className="space-y-2">
              {conversation.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-[var(--radius-btn)] px-3 py-2 text-sm ${
                    m.role === "agent"
                      ? "bg-[var(--pastel-mint)]/60 text-[var(--foreground)]"
                      : "ml-4 bg-[var(--pastel-sky)]/50 text-[var(--foreground)]"
                  }`}
                >
                  {m.text}
                </div>
              ))}
            </div>
            {agentLine && (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  className="action-button min-h-[3.5rem] w-full"
                  onClick={playAgentLine}
                  aria-label="Play agent line"
                >
                  <span className="action-icon">
                    <Icon name="play" size={22} />
                  </span>
                  Listen
                </button>
                <p className="text-[var(--foreground)]/80">{agentLine}</p>
              </div>
            )}
            <div className="mt-auto flex flex-col gap-2">
              <p className="text-sm font-semibold text-[var(--foreground)]/70">
                Say something:
              </p>
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="phrase-btn w-full"
                  onClick={() => pickSuggestion(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </section>
        )}

        {view === "home" && (
          <nav className="bottom-nav" aria-label="Primary">
            <button type="button" className="nav-button active" aria-current="page">
              <Icon name="home" className="nav-glyph" />
              <span>Home</span>
            </button>
            <button type="button" className="nav-button">
              <Icon name="mic" className="nav-glyph" />
              <span>Talk</span>
            </button>
            <button type="button" className="nav-button">
              <Icon name="person" className="nav-glyph" />
              <span>Me</span>
            </button>
          </nav>
        )}
      </section>
    </main>
  );
}
