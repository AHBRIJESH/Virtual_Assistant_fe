import { useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { io } from "socket.io-client";

const ASSISTANT_PLAYBACK_RATE = 0.8;
const ASSISTANT_PLAYBACK_VOLUME = 1;

const createSilentAudioUrl = () => {
  const sampleRate = 8000;
  const sampleCount = 1600;
  const samplesSize = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + samplesSize);
  const view = new DataView(buffer);
  const writeText = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + samplesSize, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samplesSize, true);

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
};

const VoiceAssistant = ({ onAvatarSpeak }) => {
  const socketRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechDebounceRef = useRef(null);
  const pendingTranscriptRef = useRef("");
  const audioRef = useRef(null);
  const activeAudioUrlRef = useRef(null);
  const isCallActiveRef = useRef(false);
  const callRequestedRef = useRef(false);
  const assistantSpeakingRef = useRef(false);
  const [isListening, setIsListening] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [status, setStatus] = useState("Tap to start the call");
  const [lastMessage, setLastMessage] = useState({
    speaker: "Assistant",
    text: "Tap Start call when you’re ready to talk.",
  });

  useEffect(() => {
    const socket = io("https://virtual-assistant-be.onrender.com/", {
      transports: ["websocket"],
      upgrade: false,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      if (callRequestedRef.current) {
        socket.emit("start_call", {
          message: "Hello! I’m ready to help. How can I assist you today?",
        });
        setStatus("Call active");
      } else {
        setStatus("Ready to call");
      }
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      if (isCallActiveRef.current) {
        setStatus("Call active — reconnecting...");
        socket.connect();
      } else {
        setStatus("Ready to call");
      }
    });

    socket.on("server_status", (payload) => {
      if (payload?.message) {
        setStatus(payload.message);
      }
    });

    socket.on("assistant_response", ({ text, audio_data }) => {
      const responseText = text || "";
      const hasAudio = Boolean(audio_data);

      setStatus("Assistant is responding...");
      assistantSpeakingRef.current = hasAudio;
      stopListening();

      if (responseText) {
        setLastMessage({ speaker: "Assistant", text: responseText });
      }

      let audio = null;
      let audioUrl = "";
      if (hasAudio) {
        const decodedAudio = Uint8Array.from(atob(audio_data), (character) => character.charCodeAt(0));
        audioUrl = URL.createObjectURL(new Blob([decodedAudio], { type: "audio/mpeg" }));
        activeAudioUrlRef.current = audioUrl;
        audio = audioRef.current || new Audio();
        audio.pause();
        audio.src = audioUrl;
        audio.muted = false;
        audio.playbackRate = ASSISTANT_PLAYBACK_RATE;
        audio.volume = ASSISTANT_PLAYBACK_VOLUME;
        audio.preservesPitch = true;
        audio.load();
        audioRef.current = audio;
      }

      let assistantTurnFinished = false;
      let finishTimeout = null;
      let handleAudioEnded = null;
      let handleAudioError = null;
      const finishAssistantTurn = () => {
        if (assistantTurnFinished) return;
        assistantTurnFinished = true;
        clearTimeout(finishTimeout);
        if (audio) {
          audio.removeEventListener("ended", handleAudioEnded);
          audio.removeEventListener("error", handleAudioError);
        }
        assistantSpeakingRef.current = false;
        if (isCallActiveRef.current) {
          setStatus("Call active");
          startListening();
        } else {
          setStatus("Tap to start the call");
        }
        if (activeAudioUrlRef.current) {
          URL.revokeObjectURL(activeAudioUrlRef.current);
          activeAudioUrlRef.current = null;
        }
        onAvatarSpeak?.({ playAudio: false, script: "output", audioUrl: "", audioElement: null, responseText: "" });
      };

      if (hasAudio) {
        handleAudioEnded = finishAssistantTurn;
        handleAudioError = () => {
          console.error("Assistant audio element error:", audio.error?.code, audio.error?.message);
          finishAssistantTurn();
        };
        audio.addEventListener("ended", handleAudioEnded);
        audio.addEventListener("error", handleAudioError);
        finishTimeout = setTimeout(() => {
          console.error("Audio playback did not finish; resetting the conversation audio state.");
          audio.pause();
          finishAssistantTurn();
        }, 120000);
      }

      onAvatarSpeak?.({ playAudio: hasAudio, script: "output", audioUrl, audioElement: audio, responseText });

      if (hasAudio) {
        audio.play().catch((error) => {
          console.error("OpenRouter audio playback failed:", error);
          finishAssistantTurn();
        });
      } else {
        finishAssistantTurn();
      }
    });

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      clearTimeout(speechDebounceRef.current);
      if (audioRef.current) audioRef.current.pause();
      if (activeAudioUrlRef.current) URL.revokeObjectURL(activeAudioUrlRef.current);
      socket.disconnect();
    };
  }, []);

  const startListening = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      setStatus("Speech recognition is not supported in this browser.");
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setStatus("Listening...");
    };

    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) {
          const finalText = result[0]?.transcript?.trim();
          if (finalText) pendingTranscriptRef.current += `${pendingTranscriptRef.current ? " " : ""}${finalText}`;
        }
      }

      if (pendingTranscriptRef.current) {
        clearTimeout(speechDebounceRef.current);
        speechDebounceRef.current = setTimeout(() => {
          const transcript = pendingTranscriptRef.current.trim();
          pendingTranscriptRef.current = "";
          if (!transcript || !isCallActiveRef.current) return;

          assistantSpeakingRef.current = true;
          setLastMessage({ speaker: "You", text: transcript });
          setStatus("Sending to assistant...");
          stopListening();
          socketRef.current?.emit("voice_prompt", { message: transcript });
        }, 450);
      } else {
        setStatus("Listening...");
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setStatus("Try speaking a little more clearly.");
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (isCallActiveRef.current && !assistantSpeakingRef.current && !pendingTranscriptRef.current && socketRef.current && !document.hidden) {
        setTimeout(() => {
          if (isCallActiveRef.current && !assistantSpeakingRef.current && !pendingTranscriptRef.current && socketRef.current && !document.hidden) {
            startListening();
          }
        }, 300);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const startCall = () => {
    if (!socketRef.current) {
      setStatus("Connecting to assistant...");
      return;
    }

    isCallActiveRef.current = true;
    callRequestedRef.current = true;
    assistantSpeakingRef.current = true;
    setIsCallActive(true);
    setStatus("Starting call...");

    const audio = new Audio();
    const silentAudioUrl = createSilentAudioUrl();
    audioRef.current = audio;
    audio.muted = true;
    audio.src = silentAudioUrl;
    audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      URL.revokeObjectURL(silentAudioUrl);
    }).catch((error) => {
      console.warn("Could not unlock audio playback:", error);
      audio.muted = false;
      URL.revokeObjectURL(silentAudioUrl);
    });

    if (!socketRef.current.connected) {
      socketRef.current.connect();
      setStatus("Connecting to assistant...");
      return;
    }

    socketRef.current.emit("start_call", {
      message: "Hello! I’m ready to help. How can I assist you today?",
    });
    setStatus("Assistant is talking...");
    stopListening();
  };

  const endCall = () => {
    isCallActiveRef.current = false;
    callRequestedRef.current = false;
    assistantSpeakingRef.current = false;
    clearTimeout(speechDebounceRef.current);
    speechDebounceRef.current = null;
    pendingTranscriptRef.current = "";
    setIsCallActive(false);
    stopListening();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = "";
    }
    if (activeAudioUrlRef.current) {
      URL.revokeObjectURL(activeAudioUrlRef.current);
      activeAudioUrlRef.current = null;
    }
    onAvatarSpeak?.({ playAudio: false, script: "output", audioUrl: "", audioElement: null, responseText: "" });
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    setStatus("Tap to start the call");
  };

  return (
    <Html fullscreen zIndexRange={[100, 0]}>
      <div className="voice-assistant-overlay">
        <section className="voice-assistant-panel" aria-label="Voice assistant controls">
          <div className="voice-assistant-status">
            <span className={`voice-assistant-status-dot ${isConnected ? "is-connected" : ""}`} />
            <span>{status}</span>
          </div>

          <div className="voice-assistant-transcript" aria-live="polite" aria-atomic="true">
            <span className="voice-assistant-speaker">{lastMessage.speaker}</span>
            <p>{lastMessage.text}</p>
          </div>

          <div className="voice-assistant-controls">
            <button
              className="voice-assistant-button voice-assistant-start"
              onClick={startCall}
              disabled={isCallActive}
              aria-label="Start call"
            >
              <span aria-hidden="true">🎙</span>
              {isCallActive ? (isListening ? "Listening" : "Call active") : "Start call"}
            </button>
            <button
              className="voice-assistant-button voice-assistant-end"
              onClick={endCall}
              disabled={!isCallActive}
              aria-label="End call"
            >
              <span aria-hidden="true">■</span>
              End call
            </button>
          </div>
        </section>
      </div>
    </Html>
  );
};

export default VoiceAssistant;
