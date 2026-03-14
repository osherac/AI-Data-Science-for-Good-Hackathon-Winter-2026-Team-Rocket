"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SCRIPTS_KEY = "talkbridge_scripts";
const MAX_RECORDINGS = 20;
const CATEGORIES = [
  { id: "school", label: "School" },
  { id: "doctor", label: "Doctor" },
  { id: "store", label: "Store" },
  { id: "transit", label: "Transit" },
  { id: "work", label: "Work" },
] as const;

export type StoredRecording = {
  id: string;
  transcript: string;
  date: string;
};

type View = "home" | "record" | "start-upload" | "conversation" | "recordings";

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
    camera: (
      <>
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </>
    ),
  };
  return <svg {...s}>{path[name] ?? null}</svg>;
}

function getStoredRecordings(): StoredRecording[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SCRIPTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    return list
      .map((item: { id?: string; transcript?: string; date?: string }, i: number) => ({
        id: item.id ?? `recording-${i}-${item.date ?? Date.now()}`,
        transcript: item.transcript ?? "",
        date: item.date ?? new Date().toISOString(),
      }))
      .slice(0, MAX_RECORDINGS);
  } catch {
    return [];
  }
}

function saveRecording(transcript: string): StoredRecording {
  const list = getStoredRecordings();
  const id = `recording-${Date.now()}`;
  const rec: StoredRecording = { id, transcript, date: new Date().toISOString() };
  list.unshift(rec);
  const capped = list.slice(0, MAX_RECORDINGS);
  localStorage.setItem(SCRIPTS_KEY, JSON.stringify(capped));
  return rec;
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
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [expandedRecordingId, setExpandedRecordingId] = useState<string | null>(null);
  const [recordingsList, setRecordingsList] = useState<StoredRecording[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const conversationRef = useRef(conversation);
  const recordingForConversationRef = useRef(false);
  const pickSuggestionRef = useRef<(text: string) => void>(() => {});
  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    if (!cameraOpen || !cameraStreamRef.current) return;
    const video = cameraVideoRef.current;
    if (!video) return;
    video.srcObject = cameraStreamRef.current;
    return () => {
      video.srcObject = null;
    };
  }, [cameraOpen]);

  const refreshRecordings = useCallback(() => {
    setRecordingsList(getStoredRecordings());
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      cameraStreamRef.current = stream;
      setCameraOpen(true);
    } catch (e) {
      try {
        const fallback = await navigator.mediaDevices.getUserMedia({ video: true });
        cameraStreamRef.current = fallback;
        setCameraOpen(true);
      } catch (e2) {
        setCameraError(e2 instanceof Error ? e2.message : "Camera access denied");
      }
    }
  }, []);

  const closeCamera = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    setCameraOpen(false);
    setCameraError(null);
  }, []);

  const captureFromCamera = useCallback(() => {
    const video = cameraVideoRef.current;
    const stream = cameraStreamRef.current;
    if (!video || !stream || video.readyState < 2) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
        setImageFile(file);
        const url = URL.createObjectURL(blob);
        setImagePreview(url);
        closeCamera();
      },
      "image/jpeg",
      0.9
    );
  }, [closeCamera]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      mr.start(250);
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
    setRecording(false);
    setTranscribeStatus("loading");

    const stopped = new Promise<void>((resolve) => {
      const prevOnStop = mr.onstop;
      mr.onstop = () => {
        prevOnStop?.();
        resolve();
      };
    });
    mr.stop();
    await stopped;

    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      if (blob.size === 0) {
        setTranscribeStatus("error");
        setLastTranscript("No audio recorded. Try speaking and record a bit longer.");
        return;
      }
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
      if (recordingForConversationRef.current) {
        recordingForConversationRef.current = false;
        if (transcript) {
          pickSuggestionRef.current(transcript);
        } else {
          setConversationError("No speech detected. Try recording again.");
        }
        setTranscribeStatus("idle");
      } else {
        if (transcript) saveRecording(transcript);
        setTranscribeStatus("done");
      }
    } catch (e) {
      setTranscribeStatus("error");
      setLastTranscript(e instanceof Error ? e.message : "Failed");
      if (recordingForConversationRef.current) {
        recordingForConversationRef.current = false;
        setConversationError(e instanceof Error ? e.message : "Recording failed");
      }
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
          const recordings = getStoredRecordings();
          const userInfo = {
            recordings: recordings,
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

      if (!visionRes.ok) {
        const visionText = await visionRes.text();
        let visionErr = "Image understanding failed";
        try {
          const v = JSON.parse(visionText);
          if (v.error) visionErr = v.error;
        } catch {
          if (visionText) visionErr = visionText;
        }
        throw new Error(visionErr);
      }
      if (!scenarioRes.ok) {
        const scenarioText = await scenarioRes.text();
        let scenarioErr = "Scenario generation failed";
        try {
          const s = JSON.parse(scenarioText);
          if (s.error) scenarioErr = s.error;
        } catch {
          if (scenarioText) scenarioErr = scenarioText;
        }
        throw new Error(scenarioErr);
      }

      const scenario = await scenarioRes.json();
      setAgentLine(scenario.voiceAgentLine ?? "");
      setSuggestions(Array.isArray(scenario.suggestedUserResponses) ? scenario.suggestedUserResponses : []);
      setConversation([{ role: "agent", text: scenario.voiceAgentLine ?? "" }]);
      setStartStatus("ready");
      setView("conversation");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setStartError(msg);
      setStartStatus("error");
      console.error("[Start flow] Error:", e);
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
      const currentConversation = conversationRef.current;
      const newHistory = [...currentConversation, { role: "user" as const, text }];
      setConversation(newHistory);
      setSuggestions([]);
      setAgentLine("");
      setConversationError(null);
      try {
        const recordings = getStoredRecordings();
        const res = await fetch("/api/scenario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userInfo: { recordings },
            scenarioContext: selectedCategory || undefined,
            conversationHistory: newHistory,
          }),
        });
        const raw = await res.text();
        if (!res.ok) {
          let errMsg = "Failed to get next turn";
          try {
            const data = JSON.parse(raw);
            if (data.error) errMsg = data.error;
          } catch {
            if (raw) errMsg = raw;
          }
          setConversationError(errMsg);
          console.error("[pickSuggestion] API error", res.status, errMsg);
          return;
        }
        const data = JSON.parse(raw) as { voiceAgentLine?: string; suggestedUserResponses?: string[] };
        const agentText = data.voiceAgentLine ?? "";
        setAgentLine(agentText);
        setSuggestions(Array.isArray(data.suggestedUserResponses) ? data.suggestedUserResponses : []);
        setConversation((c) => [...c, { role: "agent", text: agentText }]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong";
        setConversationError(msg);
        console.error("[pickSuggestion] Error:", e);
      }
    },
    [conversation, selectedCategory]
  );

  useEffect(() => {
    pickSuggestionRef.current = pickSuggestion;
  }, [pickSuggestion]);

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
                {view === "recordings" && "Recordings"}
              </span>
            </div>
          </div>
          {(view === "record" || view === "start-upload" || view === "conversation" || view === "recordings") && (
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
                setConversationError(null);
                setExpandedRecordingId(null);
                recordingForConversationRef.current = false;
                if (cameraOpen) closeCamera();
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
                <button
                  type="button"
                  className="text-sm font-semibold text-[var(--accent)] underline underline-offset-2"
                  onClick={() => {
                    setView("recordings");
                    refreshRecordings();
                  }}
                >
                  View recordings
                </button>
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
                <button
                  type="button"
                  className="text-sm font-semibold text-[var(--accent)] underline underline-offset-2"
                  onClick={() => {
                    setView("recordings");
                    refreshRecordings();
                  }}
                >
                  View all recordings
                </button>
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
              Add an image of the situation (e.g. pharmacy, bus, office). Take a photo or choose from gallery.
            </p>
            {!imagePreview ? (
              <div className="flex min-h-[12rem] flex-col gap-3">
                <input
                  ref={fileInputRef}
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
                    e.target.value = "";
                  }}
                />
                {cameraOpen ? (
                  <div className="flex flex-col gap-3">
                    <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-black">
                      <video
                        ref={cameraVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="h-full w-full object-cover"
                        style={{ transform: "scaleX(-1)" }}
                      />
                    </div>
                    {cameraError && (
                      <p className="text-center text-sm text-red-600">{cameraError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="action-button min-h-[3rem] flex-1"
                        onClick={captureFromCamera}
                      >
                        Capture
                      </button>
                      <button
                        type="button"
                        className="min-h-[3rem] rounded-[var(--radius-btn)] border border-[var(--line)] px-4 text-sm font-medium"
                        onClick={closeCamera}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className="flex min-h-[10rem] cursor-pointer flex-col items-center justify-center rounded-[var(--radius-card)] border-2 border-dashed border-[var(--line)] bg-[var(--panel)] transition hover:bg-[var(--pastel-sky)]/30"
                    onClick={startCamera}
                  >
                    <Icon name="camera" size={40} className="text-[var(--foreground)]/50" />
                    <span className="mt-2 text-sm font-semibold text-[var(--foreground)]/70">
                      Take photo
                    </span>
                  </button>
                  <button
                    type="button"
                    className="flex min-h-[10rem] cursor-pointer flex-col items-center justify-center rounded-[var(--radius-card)] border-2 border-dashed border-[var(--line)] bg-[var(--panel)] transition hover:bg-[var(--pastel-sky)]/30"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Icon name="upload" size={40} className="text-[var(--foreground)]/50" />
                    <span className="mt-2 text-sm font-semibold text-[var(--foreground)]/70">
                      Choose image
                    </span>
                  </button>
                </div>
                )}
              </div>
            ) : (
              <>
                <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--panel)]">
                  <img
                    src={imagePreview}
                    alt="Scene"
                    className="h-full w-full object-cover"
                  />
                </div>
                {startStatus === "idle" && (
                  <>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="action-button min-h-[3.5rem] flex-1"
                        onClick={runStartFlow}
                      >
                        Generate conversation
                      </button>
                      <button
                        type="button"
                        className="min-h-[3.5rem] rounded-[var(--radius-btn)] border border-[var(--line)] px-4 text-sm font-medium text-[var(--foreground)]/80 hover:bg-[var(--panel)]"
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview(null);
                        }}
                      >
                        Change image
                      </button>
                    </div>
                  </>
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
            {conversationError && (
              <div className="rounded-[var(--radius-btn)] border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {conversationError}
              </div>
            )}
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
            <div className="mt-auto flex flex-col gap-3">
              {suggestions.length > 0 && (
                <>
                  <p className="text-sm font-semibold text-[var(--foreground)]/70">
                    You could say something like:
                  </p>
                  <ul className="space-y-1 text-sm text-[var(--foreground)]/80">
                    {suggestions.map((s) => (
                      <li key={s} className="rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
                        {s}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="text-sm font-semibold text-[var(--foreground)]/70">
                Record your response:
              </p>
              {!recording ? (
                <button
                  type="button"
                  className="action-button min-h-[3.5rem] w-full"
                  onClick={() => {
                    recordingForConversationRef.current = true;
                    startRecording();
                  }}
                  aria-label="Record your response"
                >
                  <span className="action-icon">
                    <Icon name="record" size={22} />
                  </span>
                  Record
                </button>
              ) : (
                <button
                  type="button"
                  className="action-button min-h-[3.5rem] w-full bg-red-600 text-white hover:bg-red-700"
                  onClick={stopRecording}
                  aria-label="Stop recording"
                >
                  <span className="action-icon">
                    <Icon name="record" size={22} />
                  </span>
                  Stop recording
                </button>
              )}
              {transcribeStatus === "loading" && (
                <p className="text-center text-sm text-[var(--foreground)]/70">Transcribing…</p>
              )}
            </div>
          </section>
        )}

        {view === "recordings" && (
          <section className="main-card flex flex-1 flex-col gap-3 overflow-auto">
            <p className="text-sm text-[var(--foreground)]/70">
              Up to {MAX_RECORDINGS} recordings saved on this device. Tap View to see the transcribed text.
            </p>
            {recordingsList.length === 0 ? (
              <p className="text-sm text-[var(--foreground)]/60">No recordings yet. Record from the home screen.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {recordingsList.map((rec, i) => (
                  <li
                    key={rec.id}
                    className="rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--panel)] p-3 shadow-[var(--shadow)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[var(--foreground)]">
                        Recording {recordingsList.length - i}
                      </span>
                      <span className="text-xs text-[var(--foreground)]/55">
                        {new Date(rec.date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="mt-2 w-full rounded-lg bg-[var(--accent-soft)] py-2 text-sm font-semibold text-[var(--foreground)] transition hover:brightness-95"
                      onClick={() =>
                        setExpandedRecordingId(expandedRecordingId === rec.id ? null : rec.id)
                      }
                    >
                      {expandedRecordingId === rec.id ? "Hide text" : "View"}
                    </button>
                    {expandedRecordingId === rec.id && (
                      <div className="mt-3 rounded-lg border border-[var(--line)] bg-white/60 p-3 text-sm text-[var(--foreground)]">
                        {rec.transcript || "—"}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
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
