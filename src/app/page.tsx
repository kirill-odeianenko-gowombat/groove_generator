"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Mic, Volume2, VolumeX } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";

interface Track {
  name: string;
  id: number;
  url: string | null;
  muted?: boolean;
}

type RecognitionEvent = { results: Array<Array<{ transcript: string }>> };

interface WebkitSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    webkitSpeechRecognition: new () => WebkitSpeechRecognition;
  }
}

export default function GrooveApp() {
  const [tracks, setTracks] = useState<Track[]>([{ name: "Drums", id: Date.now(), url: null, muted: false }]);
  const [history, setHistory] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<WebkitSpeechRecognition | null>(null);
  const audioRefs = useRef<Map<number, HTMLAudioElement>>(new Map());

  const instrumentDefs: { name: string; icon: string }[] = [
    { name: "Piano", icon: "/icons/keyboard.png" },
    { name: "Saxophone", icon: "/icons/saxophone.png" },
    { name: "Electric Guitar", icon: "/icons/electric-guitar.png" },
    { name: "Bass Guitar", icon: "/icons/bass-guitar.png" },
    { name: "Electric Bass", icon: "/icons/electric-bass.png" },
    { name: "Drum Set", icon: "/icons/drum-set.png" },
    { name: "Maracas", icon: "/icons/maracas.png" },
    { name: "Trumpet", icon: "/icons/trumpet.png" },
  ];
  const availableInstruments = instrumentDefs.map((i) => i.name);

  async function generateTrack(inst: string): Promise<string | null> {
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/music/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": process.env.NEXT_PUBLIC_ELEVEN_API_KEY || "",
        },
        body: JSON.stringify({
          prompt: `Generate a ${inst} groove track`,
          duration: 10,
          format: "mp3"
        }),
      });
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch (err) {
      console.error("Generation error:", err);
      return null;
    }
  }

  async function addTrack(inst: string) {
    if (!tracks.find((t) => t.name === inst)) {
      const url = await generateTrack(inst);
      const newTrack: Track = { name: inst, id: Date.now(), url, muted: false };
      setTracks([...tracks, newTrack]);
      setHistory([...history, `Added ${inst} as a new track`]);
    }
  }

  async function playAll() {
    const refs = audioRefs.current;
    tracks.forEach((t) => {
      const audio = refs.get(t.id);
      if (audio && t.url) {
        try {
          audio.currentTime = 0;
          audio.muted = !!t.muted;
          void audio.play();
        } catch {}
      }
    });
  }

  function toggleMute(trackId: number) {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)));
    const audio = audioRefs.current.get(trackId);
    if (audio) audio.muted = !audio.muted;
  }

  useEffect(() => {
    if (typeof window !== "undefined" && "webkitSpeechRecognition" in window) {
      recognitionRef.current = new window.webkitSpeechRecognition();
      const rec = recognitionRef.current;
      rec.lang = "en-US";
      rec.continuous = false;
      rec.interimResults = false;

      rec.onresult = (event: RecognitionEvent) => {
        const command = event.results[0][0].transcript;
        const match = availableInstruments.find((inst) =>
          command.toLowerCase().includes(inst.toLowerCase())
        );
        if (match) addTrack(match);
      };

      rec.onend = () => setListening(false);
    }
    // We intentionally do not include addTrack/availableInstruments to avoid
    // reinitializing recognition on every render. These values are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleListening() {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
    } else {
      rec.start();
      setListening(true);
    }
  }

  return (
    <div className="min-h-screen px-6 py-16">
      <motion.h1
        className="text-center text-4xl sm:text-5xl font-extrabold drop-shadow mb-2"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        Mini Groove Generator
      </motion.h1>
      <p className="text-center text-white/80 mb-8">Build your groove, layer by layer</p>

      {/* Current Tracks Card */}
      <Card className="max-w-2xl mx-auto glass-card text-white/90">
        <CardContent className="p-8">
          <h2 className="font-semibold mb-4 text-neutral-800">Current Tracks</h2>
          <motion.div className="space-y-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {tracks.map((track, index) => (
              <motion.div
                key={track.id}
                className="flex items-center justify-between glass-input px-5 py-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <span className="font-medium text-white/95">{track.name}</span>
                {track.url ? (
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={() => toggleMute(track.id)}
                      className="glass-pill h-9 w-9 p-0 rounded-full flex items-center justify-center"
                      aria-label={track.muted ? "Unmute" : "Mute"}
                      title={track.muted ? "Unmute" : "Mute"}
                    >
                      {track.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </Button>
                    <audio
                      ref={(el) => {
                        if (el) audioRefs.current.set(track.id, el);
                        else audioRefs.current.delete(track.id);
                      }}
                      muted={track.muted}
                      controls
                      src={track.url}
                      className="h-8"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-white/70">loading...</span>
                )}
              </motion.div>
            ))}
          </motion.div>

          <div className="flex gap-3 mt-6">
            <Button onClick={playAll} className="glass-pill px-6 py-3 text-white flex items-center gap-2 shadow">
              <Play size={18} /> Play All
            </Button>
            <Button
              onClick={toggleListening}
              className={`glass-pill px-6 py-3 flex items-center gap-2 ${listening ? "!bg-red-300/40" : ""}`}
            >
              <Mic size={18} /> {listening ? "Stop" : "Voice Add"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add instruments */}
      <Card className="max-w-2xl mx-auto mt-8 glass-card text-white/90">
        <CardContent className="p-8">
          <h2 className="font-semibold mb-4 text-white/90">Add instruments</h2>
          <div className="grid grid-cols-4 gap-5 place-items-center">
            {instrumentDefs.map(({ name, icon }) => (
              <Button
                key={name}
                onClick={() => addTrack(name)}
                aria-label={name}
                title={name}
                className="glass-pill rounded-full h-14 w-14 sm:h-16 sm:w-16 p-0 text-white flex items-center justify-center hover:brightness-110"
              >
                <Image src={icon} alt={name} width={28} height={28} className="h-7 w-7 sm:h-8 sm:w-8" />
                <span className="sr-only">{name}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <Card className="max-w-2xl mx-auto mt-8 glass-card text-white/90">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-white/90 mb-4">History</h2>
          <div className="space-y-2">
            {history.length === 0 && (
              <div className="text-white/70 text-sm">• No changes yet</div>
            )}
            {history.map((h, i) => (
              <motion.div
                key={i}
                className="text-sm text-white/90 glass-input px-3 py-2"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                {h}
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
