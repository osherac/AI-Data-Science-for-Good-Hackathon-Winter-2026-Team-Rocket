"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

const SCRIPTS_KEY = "talkbridge_scripts";
const CONVERSATIONS_KEY = "talkbridge_conversations";
const MAX_RECORDINGS = 20;
const MAX_SAVED_CONVERSATIONS = 50;
const CATEGORIES = [
  { id: "school", label: "School" },
  { id: "doctor", label: "Doctor" },
  { id: "store", label: "Store" },
  { id: "transit", label: "Transit" },
  { id: "work", label: "Work" },
] as const;

const HOME_SCENARIO_IMAGE_POOL = [
  { title: "Classroom", imageSrc: "/classroom.jpg" },
  { title: "Garden", imageSrc: "/garden.jpg" },
  { title: "Grocery", imageSrc: "/grocery.jpg" },
] as const;

const HOME_EXAMPLE_SCENARIOS = Array.from({ length: 18 }, (_, index) => {
  const item = HOME_SCENARIO_IMAGE_POOL[index % HOME_SCENARIO_IMAGE_POOL.length];
  return {
    id: `sample-${index + 1}`,
    title: item.title,
    imageSrc: item.imageSrc,
  };
});

export type StoredRecording = {
  id: string;
  transcript: string;
  date: string;
};

type View = "home" | "record" | "start-upload" | "conversation" | "recordings";

type ConversationMessage = {
  role: "agent" | "user";
  text: string;
  errorRanges?: { start: number; end: number }[];
};

/** Strip JSON from AI output so only readable text is shown. */
function stripJsonFromText(text: string): string {
  if (typeof text !== "string") return "";
  const t = text.trim();
  if (!t) return "";
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const parsed = JSON.parse(t) as unknown;
      if (typeof parsed === "string") return parsed;
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        const preferred = obj.voiceAgentLine ?? obj.message ?? obj.text ?? obj.content;
        if (typeof preferred === "string") return preferred;
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "string") return parsed[0];
        const firstStr = Object.values(obj).find((v) => typeof v === "string");
        if (typeof firstStr === "string") return firstStr;
      }
    } catch {
      // fall through
    }
  }
  return text;
}

/** Pick an emoji to add context for an AI message. */
function getAgentMessageEmoji(text: string): string {
  if (!text || typeof text !== "string") return "💬";
  const lower = text.toLowerCase();
  if (/\?$/.test(text.trim()) || lower.includes("what ") || lower.includes("how ") || lower.includes("would you")) return "🤔";
  if (lower.includes("great") || lower.includes("good job") || lower.includes("well done") || lower.includes("nice")) return "👍";
  if (lower.includes("try saying") || lower.includes("you could") || lower.includes("suggest")) return "💡";
  if (lower.includes("hello") || lower.includes("hi ") || lower.includes("welcome")) return "👋";
  if (text.length < 60 && !/[.!?]/.test(text)) return "💬";
  return "💬";
}

function renderTextWithHighlights(
  text: string,
  errorRanges: { start: number; end: number }[] | undefined
): React.ReactNode {
  if (!text) return "\u00A0";
  if (!Array.isArray(errorRanges) || errorRanges.length === 0) return text;
  const sorted = [...errorRanges].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of sorted) {
    if (r.start >= r.end || r.end > text.length) continue;
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ start: r.start, end: r.end });
    }
  }
  const out: React.ReactNode[] = [];
  let pos = 0;
  for (const r of merged) {
    if (r.start > pos) out.push(text.slice(pos, r.start));
    out.push(
      <span key={`${r.start}-${r.end}`} style={{ color: "#b91c1c", textDecoration: "underline" }}>
        {text.slice(r.start, r.end)}
      </span>
    );
    pos = r.end;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

function Icon({
  name,
  className,
  size = 24,
  strokeWidth = 1.8,
}: {
  name: string;
  className?: string;
  size?: number;
  strokeWidth?: number;
}) {
  const s = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth,
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
    pause: (
      <>
        <rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
        <rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
      </>
    ),
    upload: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </>
    ),
    image: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="2.2" />
        <circle cx="9" cy="10" r="1.4" />
        <path d="m20 15-4-4-4 4-2.4-2.4L4 18" />
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
    eye: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    "eye-off": (
      <>
        <path d="M3 3l18 18" />
        <path d="M10.9 10.9a1.5 1.5 0 0 0 2.1 2.1" />
        <path d="M6.4 6.4A16.3 16.3 0 0 0 2 12s3.5 6 10 6a9.7 9.7 0 0 0 4.7-1.1" />
        <path d="M9.1 5.3A10 10 0 0 1 12 6c6.5 0 10 6 10 6a16.7 16.7 0 0 1-2.6 3.3" />
      </>
    ),
    check: <path d="M20 6 9 17l-5-5" />,
    cycle: (
      <>
        <path d="M3 12a9 9 0 0 1 14.8-6.9" />
        <polyline points="18 2 18 6 14 6" />
        <path d="M21 12a9 9 0 0 1-14.8 6.9" />
        <polyline points="6 22 6 18 10 18" />
      </>
    ),
    trash: (
      <>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
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

export type StoredConversation = {
  id: string;
  createdAt: string;
  conversation: ConversationMessage[];
  scenarioContext?: string;
  title?: string;
  /** Data URL of the image used when starting this conversation (camera/upload). */
  imageDataUrl?: string;
};

function getStoredConversations(): StoredConversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    return list
      .map((item: { id?: string; createdAt?: string; conversation?: ConversationMessage[]; scenarioContext?: string; title?: string; imageDataUrl?: string }, i: number) => ({
        id: item.id ?? `conv-${i}-${Date.now()}`,
        createdAt: item.createdAt ?? new Date().toISOString(),
        conversation: Array.isArray(item.conversation) ? (item.conversation as ConversationMessage[]) : [],
        scenarioContext: item.scenarioContext,
        title: item.title,
        imageDataUrl: typeof item.imageDataUrl === "string" ? item.imageDataUrl : undefined,
      }))
      .slice(0, MAX_SAVED_CONVERSATIONS);
  } catch {
    return [];
  }
}

function saveConversationToStorage(
  conversation: ConversationMessage[],
  scenarioContext?: string,
  imageDataUrl?: string | null
): void {
  if (typeof window === "undefined" || !Array.isArray(conversation)) return;
  if (conversation.length === 0) return;
  const list = getStoredConversations();
  const id = `conv-${Date.now()}`;
  const firstLine = conversation.find((m) => m.role === "agent")?.text;
  const title = firstLine ? stripJsonFromText(firstLine).slice(0, 40) + (firstLine.length > 40 ? "…" : "") : undefined;
  const entry: StoredConversation = {
    id,
    createdAt: new Date().toISOString(),
    conversation,
    scenarioContext,
    title,
    imageDataUrl: imageDataUrl || undefined,
  };
  const updated = [entry, ...list.filter((c) => c.id !== id)].slice(0, MAX_SAVED_CONVERSATIONS);
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(updated));
}

function deleteSavedConversation(id: string): void {
  if (typeof window === "undefined") return;
  const list = getStoredConversations().filter((c) => c.id !== id);
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(list));
}

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribeStatus, setTranscribeStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [lastTranscript, setLastTranscript] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [sessionImageBase64, setSessionImageBase64] = useState<string | null>(null);
  const [sessionImageMimeType, setSessionImageMimeType] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [agentLine, setAgentLine] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [agentTurnLoading, setAgentTurnLoading] = useState(false);
  const [startStatus, setStartStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [startError, setStartError] = useState("");
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [expandedRecordingId, setExpandedRecordingId] = useState<string | null>(null);
  const [recordingsList, setRecordingsList] = useState<StoredRecording[]>([]);
  const [savedConversations, setSavedConversations] = useState<StoredConversation[]>([]);
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
  const lineAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingLineKey, setPlayingLineKey] = useState<string | null>(null);
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

  useEffect(() => {
    if (view === "home") {
      refreshRecordings();
    }
  }, [view, refreshRecordings]);

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

  const openUploadView = useCallback(() => {
    setView("start-upload");
    setStartStatus("idle");
    setImagePreview(null);
    setImageFile(null);
    setSessionImageBase64(null);
    setSessionImageMimeType(null);
    setStartError("");
    setImagePreview(null);
    setImageFile(null);
    setSessionImageBase64(null);
    setSessionImageMimeType(null);
    setCameraError(null);
    if (cameraOpen) closeCamera();
  }, [cameraOpen, closeCamera]);

  /** Open Camera: start a new conversation (clear current convo, then go to start-upload). */
  const startNewConversation = useCallback(() => {
    setConversation([]);
    setAgentLine("");
    setSuggestions([]);
    setConversationError(null);
    openUploadView();
  }, [openUploadView]);

  const refreshSavedConversations = useCallback(() => {
    setSavedConversations(getStoredConversations());
  }, []);

  const openSavedConversation = useCallback((stored: StoredConversation) => {
    setConversation(stored.conversation);
    const lastAgent = [...stored.conversation].reverse().find((m) => m.role === "agent");
    setAgentLine(lastAgent ? stripJsonFromText(lastAgent.text) : "");
    setSuggestions([]);
    setConversationError(null);
    setImagePreview(stored.imageDataUrl ?? null);
    setStartStatus("ready");
    setView("conversation");
  }, []);

  const handleDeleteSavedConversation = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    deleteSavedConversation(id);
    setSavedConversations(getStoredConversations());
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

  useEffect(() => {
    if (view !== "start-upload" || imagePreview || cameraOpen || cameraError) return;
    const timer = window.setTimeout(() => {
      void startCamera();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [view, imagePreview, cameraOpen, cameraError, startCamera]);

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
      mr.onstop = function (e) {
        prevOnStop?.call(mr, e);
        resolve(undefined);
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
      setSessionImageBase64(base64);
      setSessionImageMimeType(mime);

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
              conversationHistory: [],
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
      const rawVoice = scenario?.voiceAgentLine ?? "";
      const voiceLine = stripJsonFromText(typeof rawVoice === "string" ? rawVoice : String(rawVoice));
      const suggested = Array.isArray(scenario?.suggestedUserResponses) ? scenario.suggestedUserResponses : [];
      flushSync(() => {
        setAgentLine(voiceLine);
        setSuggestions(suggested);
        setConversation([{ role: "agent", text: voiceLine }]);
        setStartStatus("ready");
      });
      setView("conversation");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setStartError(msg);
      setStartStatus("error");
      console.error("[Start flow] Error:", e);
    }
  }, [imageFile, selectedCategory]);

  const toggleLinePlayback = useCallback(
    async (text: string, key: string) => {
      if (!text || typeof text !== "string" || !text.trim()) return;

      const currentAudio = lineAudioRef.current;
      if (playingLineKey === key && currentAudio && !currentAudio.paused) {
        currentAudio.pause();
        lineAudioRef.current = null;
        setPlayingLineKey(null);
        return;
      }

      if (currentAudio) {
        currentAudio.pause();
        lineAudioRef.current = null;
      }

      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: text }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const audio = new Audio(`data:${data.mimeType};base64,${data.audioBase64}`);
        lineAudioRef.current = audio;
        setPlayingLineKey(key);

        const clearIfCurrent = () => {
          if (lineAudioRef.current === audio) {
            lineAudioRef.current = null;
            setPlayingLineKey(null);
          }
        };

        audio.onended = clearIfCurrent;
        audio.onerror = clearIfCurrent;
        audio.onpause = () => {
          if (!audio.ended) clearIfCurrent();
        };

        await audio.play();
      } catch (e) {
        if (lineAudioRef.current) {
          lineAudioRef.current.pause();
          lineAudioRef.current = null;
        }
        setPlayingLineKey(null);
        console.error("TTS play failed", e);
      }
    },
    [playingLineKey]
  );

  useEffect(() => {
    return () => {
      if (lineAudioRef.current) {
        lineAudioRef.current.pause();
        lineAudioRef.current = null;
      }
    };
  }, []);

  const fetchErrorRanges = useCallback((text: string) => {
    fetch("/api/check-words", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.ranges)) {
          setConversation((c) => {
            const next = [...c];
            const last = next[next.length - 1];
            if (last?.role === "user" && last?.text === text) {
              next[next.length - 1] = { ...last, errorRanges: data.ranges };
            }
            return next;
          });
        }
      })
      .catch(() => {});
  }, []);

  const pickSuggestion = useCallback(
    async (text: string) => {
      const currentConversation = conversationRef.current;
      const newHistory = [...currentConversation, { role: "user" as const, text }];
      setConversation(newHistory);
      setConversationError(null);
      setAgentTurnLoading(true);
      setSuggestions([]);
      fetchErrorRanges(text);
      try {
        const recordings = getStoredRecordings();
        const res = await fetch("/api/scenario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: sessionImageBase64 ?? undefined,
            imageMimeType: sessionImageMimeType ?? undefined,
            userInfo: { recordings },
            scenarioContext: selectedCategory || undefined,
            conversationHistory: newHistory.map(({ role, text }) => ({ role, text })),
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
        let data: { voiceAgentLine?: string; suggestedUserResponses?: string[] };
        try {
          data = JSON.parse(raw) as { voiceAgentLine?: string; suggestedUserResponses?: string[] };
        } catch {
          setConversationError("Invalid response from server");
          return;
        }
        const rawAgent = data?.voiceAgentLine ?? "";
        const agentText = stripJsonFromText(typeof rawAgent === "string" ? rawAgent : String(rawAgent));
        const nextSuggestions = Array.isArray(data?.suggestedUserResponses) ? data.suggestedUserResponses : [];
        setAgentLine(agentText);
        setSuggestions(nextSuggestions);
        setConversation((c) => [...c, { role: "agent", text: agentText }]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong";
        setConversationError(msg);
        console.error("[pickSuggestion] Error:", e);
      } finally {
        setAgentTurnLoading(false);
      }
    },
    [conversation, selectedCategory, fetchErrorRanges, sessionImageBase64, sessionImageMimeType]
  );

  useEffect(() => {
    pickSuggestionRef.current = pickSuggestion;
  }, [pickSuggestion]);

  useEffect(() => {
    if (view === "conversation" && conversation.length > 0) {
      saveConversationToStorage(conversation, selectedCategory ?? undefined, imagePreview);
    }
  }, [view, conversation, selectedCategory, imagePreview]);

  useEffect(() => {
    if (view === "home") refreshSavedConversations();
  }, [view, refreshSavedConversations]);

  return (
    <main className="mobile-shell">
      <section className="phone-frame">
        <header className="top-bar">
          <div className="brand">
            <span className="brand-mark">
              <Image
                src="/logo%202.png"
                alt="Salamalaikum logo"
                width={44}
                height={44}
                className="brand-logo"
                priority
              />
            </span>
            <div>
              <p>Salamalaikum</p>
              <span>
                {view === "home" && "Learn the words you need, right where you are"}
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
                if (view === "conversation" && conversation.length > 0) {
                  saveConversationToStorage(conversation, selectedCategory ?? undefined, imagePreview);
                }
                setView("home");
                setStartStatus("idle");
                setImagePreview(null);
                setImageFile(null);
                setSessionImageBase64(null);
                setSessionImageMimeType(null);
                setConversation([]);
                setAgentLine("");
                setSuggestions([]);
                setAgentTurnLoading(false);
                setConversationError(null);
                setExpandedRecordingId(null);
                recordingForConversationRef.current = false;
                if (cameraOpen) closeCamera();
              }}
            >
              <Icon name="back" className="small-glyph" size={20} />
            </button>
          )}
        </header>

        {view === "home" && (
          <>
            <section className="main-card home-main-card">
              <div className="home-front">
                <div className="home-top-actions">
                  <button
                    type="button"
                    className="camera-launch"
                    onClick={startNewConversation}
                    aria-label="Start with camera"
                  >
                    <span className="camera-launch-icon">
                      <Icon name="camera" size={42} />
                    </span>
                  </button>
                  <button
                    type="button"
                    className="camera-launch recordings-launch"
                    onClick={() => {
                      setView("recordings");
                      refreshRecordings();
                    }}
                    aria-label="View recordings"
                  >
                    <span className="camera-launch-icon">
                      <Icon name="mic" size={42} />
                    </span>
                  </button>
                </div>

                <div className="past-scenarios-wrap">
                  <div className="past-scenarios-head">
                    <p>Saved conversations</p>
                  </div>

                  <div className="past-scenarios-grid" aria-label="Saved conversations list">
                    {savedConversations.map((stored) => (
                      <div
                        key={stored.id}
                        role="button"
                        tabIndex={0}
                        className="past-scenario-card saved-conversation-card"
                        onClick={() => openSavedConversation(stored)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openSavedConversation(stored);
                          }
                        }}
                      >
                        {stored.imageDataUrl ? (
                          <img
                            src={stored.imageDataUrl}
                            alt=""
                            className="past-scenario-image"
                          />
                        ) : null}
                        <span className="past-scenario-overlay" />
                        <span className="past-scenario-title">
                          {stored.title ?? "Conversation"}
                        </span>
                        <span className="past-scenario-date">
                          {new Date(stored.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <button
                          type="button"
                          className="saved-conversation-delete"
                          onClick={(e) => handleDeleteSavedConversation(e, stored.id)}
                          aria-label="Delete conversation"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    ))}
                    {HOME_EXAMPLE_SCENARIOS.map((scenario) => (
                      <button
                        key={scenario.id}
                        type="button"
                        className="past-scenario-card"
                        onClick={openUploadView}
                      >
                        <img
                          src={scenario.imageSrc}
                          alt={`${scenario.title} example`}
                          className="past-scenario-image"
                        />
                        <span className="past-scenario-overlay" />
                        <span className="past-scenario-title">{scenario.title}</span>
                        <span className="past-scenario-date">Start with image</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
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
              </button>
            )}
            {recording && (
              <button
                type="button"
                className="big-start"
                onClick={stopRecording}
                aria-label="Stop recording"
              >
                <span className="big-ring recording-pulse">
                  <Icon name="record" className="mic-glyph" size={40} />
                </span>
              </button>
            )}
            {transcribeStatus === "loading" && (
              <p className="text-[var(--foreground)]/70"></p>
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
                      closeCamera();
                    }
                    e.target.value = "";
                  }}
                />
                <div className="flex flex-col gap-3">
                  <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-black">
                    {cameraOpen ? (
                      <>
                        <video
                          ref={cameraVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          className="absolute bottom-3 left-1/2 inline-flex h-10 min-w-[4.75rem] -translate-x-1/2 items-center justify-center rounded-full border border-white/45 bg-black/68 text-white shadow-[0_10px_24px_rgba(0,0,0,0.38)] backdrop-blur-sm transition hover:bg-black/78 active:scale-[0.98]"
                          onClick={captureFromCamera}
                          aria-label="Capture photo"
                        >
                          <Icon name="camera" size={20} />
                        </button>
                      </>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm font-semibold text-white/80">
                        {cameraError ? "Camera unavailable." : "Opening camera..."}
                      </div>
                    )}
                  </div>
                  {cameraError && (
                    <button
                      type="button"
                      className="mx-auto inline-flex min-h-12 w-full max-w-[12rem] items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 text-sm font-semibold text-[var(--foreground)] shadow-[var(--shadow)] transition hover:bg-[var(--pastel-sky)]/30 active:scale-[0.98]"
                      onClick={startCamera}
                      aria-label="Retry camera"
                    >
                      <Icon name="camera" size={18} />
                      <span>Retry camera</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="mx-auto inline-flex min-h-11 w-full max-w-[10.75rem] items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 text-sm font-semibold text-[var(--foreground)]/85 shadow-[var(--shadow)] transition hover:bg-[var(--pastel-sky)]/30 active:scale-[0.98]"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Upload image"
                  >
                    <Icon name="image" size={18} className="text-[var(--foreground)]/80" />
                    <span>Upload image</span>
                  </button>
                </div>
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
                    <div className="home-top-actions post-image-actions">
                      <button
                        type="button"
                        className="camera-launch post-image-action"
                        onClick={runStartFlow}
                        aria-label="Generate conversation"
                      >
                        <Icon name="check" size={42} strokeWidth={2.8} />
                      </button>
                      <button
                        type="button"
                        className="camera-launch post-image-action"
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview(null);
                          setSessionImageBase64(null);
                          setSessionImageMimeType(null);
                        }}
                        aria-label="Change image"
                      >
                        <Icon name="cycle" size={42} strokeWidth={2.2} />
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
          <section
            className="main-card conversation-card flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
            style={{ justifyContent: "flex-start", minHeight: "50vh" }}
          >
            {conversationError && (
              <div className="shrink-0 rounded-[var(--radius-btn)] border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {conversationError}
              </div>
            )}
            {imagePreview && (
              <div className="shrink-0">
                <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--panel)]">
                  <img
                    src={imagePreview}
                    alt="Scenario image"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            )}
            <div
              className="flex-1 overflow-y-auto overflow-x-hidden"
              style={{ minHeight: 0, flex: "1 1 0%" }}
            >
              <div className="space-y-2 pb-2" style={{ color: "#2c2c2c", minHeight: "80px" }}>
                {Array.isArray(conversation) &&
                  conversation.map((m, i) => {
                    const role = m?.role === "user" ? "user" : "agent";
                    const rawText = typeof m?.text === "string" ? m.text : "";
                    const text = role === "agent" ? stripJsonFromText(rawText) : rawText;
                    const lineKey = `msg-${i}`;
                    const content =
                      role === "user" && m?.errorRanges
                        ? renderTextWithHighlights(text, m.errorRanges)
                        : (text || "\u00A0");
                    return (
                      <div
                        key={i}
                        className={
                          role === "agent"
                            ? "rounded-[var(--radius-btn)] bg-[var(--pastel-mint)]/60 px-3 py-2 text-sm"
                            : "ml-4 rounded-[var(--radius-btn)] bg-[var(--pastel-sky)]/50 px-3 py-2 text-sm"
                        }
                        style={{ color: "#2c2c2c" }}
                      >
                        <div className="flex items-start gap-2">
                          {role === "agent" && (
                            <span className="shrink-0" aria-hidden>{getAgentMessageEmoji(rawText)}</span>
                          )}
                          <div className="min-w-0 flex-1 break-words">{content}</div>
                          <button
                            type="button"
                            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--line)] text-[var(--foreground)] transition-all duration-150 ${
                              playingLineKey === lineKey
                                ? "bg-[var(--accent)] text-white shadow-[0_8px_18px_rgba(53,41,25,0.2)]"
                                : "bg-white/75 shadow-[0_2px_8px_rgba(53,41,25,0.08)] hover:scale-110 hover:bg-white hover:shadow-[0_10px_20px_rgba(53,41,25,0.16)] active:scale-95"
                            }`}
                            onClick={() => toggleLinePlayback(text, lineKey)}
                            aria-label={playingLineKey === lineKey ? "Pause message audio" : "Play message audio"}
                            disabled={!text.trim()}
                          >
                            <Icon name={playingLineKey === lineKey ? "pause" : "play"} size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                {agentTurnLoading && (
                  <div className="w-fit rounded-[var(--radius-btn)] bg-[var(--pastel-mint)]/55 px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[var(--foreground)]/45 animate-pulse" />
                      <span
                        className="h-2 w-2 rounded-full bg-[var(--foreground)]/45 animate-pulse"
                        style={{ animationDelay: "120ms" }}
                      />
                      <span
                        className="h-2 w-2 rounded-full bg-[var(--foreground)]/45 animate-pulse"
                        style={{ animationDelay: "240ms" }}
                      />
                    </div>
                  </div>
                )}
                {Array.isArray(suggestions) && suggestions.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm font-semibold" style={{ color: "#2c2c2c" }}>
                      You could say something like:
                    </p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {suggestions.map((s, idx) => {
                        const suggestionText = typeof s === "string" ? s : String(s);
                        const suggestionKey = `suggestion-${idx}`;
                        return (
                          <li
                            key={idx}
                            className="rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--panel)] px-2 py-2"
                            style={{ color: "#2c2c2c" }}
                          >
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="min-w-0 flex-1 rounded-lg px-2 py-1 text-left transition hover:bg-white/70 active:scale-[0.99]"
                                onClick={() => pickSuggestion(suggestionText)}
                                aria-label={`Use suggestion: ${suggestionText}`}
                              >
                                {suggestionText}
                              </button>
                              <button
                                type="button"
                                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--line)] text-[var(--foreground)] transition-all duration-150 ${
                                  playingLineKey === suggestionKey
                                    ? "bg-[var(--accent)] text-white shadow-[0_8px_18px_rgba(53,41,25,0.2)]"
                                    : "bg-white/75 shadow-[0_2px_8px_rgba(53,41,25,0.08)] hover:scale-110 hover:bg-white hover:shadow-[0_10px_20px_rgba(53,41,25,0.16)] active:scale-95"
                                }`}
                                onClick={() => toggleLinePlayback(suggestionText, suggestionKey)}
                                aria-label={playingLineKey === suggestionKey ? "Pause option audio" : "Play option audio"}
                                disabled={!suggestionText.trim()}
                              >
                                <Icon name={playingLineKey === suggestionKey ? "pause" : "play"} size={14} />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {(!Array.isArray(conversation) || conversation.length === 0) &&
                  (agentLine == null || String(agentLine).trim() === "") &&
                  (!Array.isArray(suggestions) || suggestions.length === 0) && (
                    <p className="py-4 text-sm opacity-80" style={{ color: "#2c2c2c" }}>
                      Conversation will appear here.
                    </p>
                  )}
              </div>
            </div>
            <div className="shrink-0 flex flex-col gap-2 border-[var(--line)] pt-3" style={{ color: "#2c2c2c" }}>

              {!recording ? (
                <button
                  type="button"
                  className="mx-auto inline-flex h-24 w-24 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel)] shadow-[0_10px_24px_rgba(53,41,25,0.14)] transition hover:scale-105 hover:shadow-[0_14px_30px_rgba(53,41,25,0.2)] active:scale-95"
                  onClick={() => {
                    recordingForConversationRef.current = true;
                    startRecording();
                  }}
                  aria-label="Record your response"
                >
                  <Icon name="mic" size={38} />
                  <span className="sr-only">Record</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="mx-auto inline-flex h-24 w-24 items-center justify-center rounded-full border border-red-600 bg-red-600 text-white shadow-[0_10px_24px_rgba(185,28,28,0.28)] transition hover:scale-105 hover:bg-red-700 active:scale-95"
                  onClick={stopRecording}
                  aria-label="Stop recording"
                >
                  <Icon name="mic" size={38} />
                  <span className="sr-only">Stop recording</span>
                </button>
              )}

            </div>
          </section>
        )}

        {view === "recordings" && (
          <section className="main-card home-main-card">
            <div className="home-front">
              <div className="home-top-actions">
                <button
                  type="button"
                  className="camera-launch"
                  onClick={() => setView("record")}
                  aria-label="Record"
                >
                  <span className="camera-launch-icon">
                    <Icon name="record" size={42} />
                  </span>
                  <span className="camera-launch-title">Record</span>
                </button>

              </div>
              <div className="past-scenarios-wrap">

                {recordingsList.length === 0 ? (
                  <p className="past-scenarios-empty text-[var(--foreground)]/60">
                    No recordings yet. Record from the home screen.
                  </p>
                ) : (
                  <div className="past-scenarios-grid" aria-label="Recordings list">
                    {recordingsList.map((rec, i) => (
                      <div
                        key={rec.id}
                        className="past-scenario-card recordings-card"
                      >
                        <span className="past-scenario-title">
                          Recording {recordingsList.length - i}
                        </span>
                        <span className="past-scenario-date">
                          {new Date(rec.date).toLocaleString(undefined, {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <button
                          type="button"
                          className="recordings-view-btn"
                          onClick={() =>
                            setExpandedRecordingId(expandedRecordingId === rec.id ? null : rec.id)
                          }
                          aria-label={
                            expandedRecordingId === rec.id ? "Hide transcript" : "Show transcript"
                          }
                        >
                          <Icon name={expandedRecordingId === rec.id ? "eye" : "eye-off"} size={20} />
                        </button>
                        {expandedRecordingId === rec.id && (
                          <div className="recordings-transcript">
                            {rec.transcript || "—"}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

      </section>
    </main>
  );
}
