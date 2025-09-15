"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Mic, Volume2, VolumeX, Square, Trash2 } from "lucide-react";
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
  // Always start with empty tracks for SSR compatibility
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isClient, setIsClient] = useState(false);
  
  // Debug: track every state change
  console.log(`🔄 Component render - tracks count: ${tracks.length}`, tracks.map(t => t.name));
  
  // Load from localStorage only on client side
  useEffect(() => {
    setIsClient(true);
    const saved = localStorage.getItem('groove-app-tracks');
    if (saved) {
      try {
        const parsedTracks = JSON.parse(saved);
        setTracks(parsedTracks);
      } catch (e) {
        console.warn('Failed to parse saved tracks:', e);
      }
    }
  }, []);
  
  // Save tracks to localStorage whenever they change (only on client)
  useEffect(() => {
    if (isClient) {
      localStorage.setItem('groove-app-tracks', JSON.stringify(tracks));
    }
  }, [tracks, isClient]);
  const [history, setHistory] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [currentBPM, setCurrentBPM] = useState(120);
  const recognitionRef = useRef<WebkitSpeechRecognition | null>(null);
  const audioRefs = useRef<Map<number, HTMLAudioElement>>(new Map());

  const instrumentDefs: { name: string; emoji: string }[] = [
    { name: "Piano", emoji: "🎹" },
    { name: "Saxophone", emoji: "🎷" }, 
    { name: "Electric Guitar", emoji: "🎸" },
    { name: "Bass Guitar", emoji: "🎸" },
    { name: "Electric Bass", emoji: "🎸" },
    { name: "Drum Set", emoji: "🥁" },
    { name: "Maracas", emoji: "🪇" },
    { name: "Trumpet", emoji: "🎺" },
  ];
  const availableInstruments = instrumentDefs.map((i) => i.name);
  
  // BPM presets for easy selection
  const bpmPresets = [80, 90, 100, 110, 120, 130, 140, 150];

  async function generateTrack(inst: string): Promise<string | null> {
    try {
      console.log(`🎵 Generating ${inst} track...`);
      console.log(`🔧 Using API endpoint: /v1/music/compose`);
      
      // Build context from existing tracks
      const existingInstruments = tracks
        .filter(t => t.url) // Only successful tracks
        .map(t => t.name.toLowerCase());
      
      let prompt = "";
      
      if (existingInstruments.length === 0) {
        // First track - establish the groove
        prompt = `Generate ONLY a clean ${inst.toLowerCase()} track at ${currentBPM} BPM, 4/4 time signature. ISOLATED ${inst.toLowerCase()} ONLY - no other instruments, no drums, no bass, no melody. Pure ${inst.toLowerCase()} sound only. START IMMEDIATELY - no count-in, no intro, no drum stick clicks, no silence at beginning. Begin playing the ${inst.toLowerCase()} groove from the very first moment.`;
      } else {
        // Additional tracks - match existing groove
        const contextInstruments = existingInstruments.join(", ");
        prompt = `Generate ONLY a clean ${inst.toLowerCase()} track that fits with existing ${contextInstruments} at ${currentBPM} BPM, 4/4 time. IMPORTANT: Generate ISOLATED ${inst.toLowerCase()} ONLY - no other instruments mixed in, no accompaniment. Pure ${inst.toLowerCase()} track that will layer with existing instruments. START IMMEDIATELY - no count-in, no intro, no drum stick clicks, no silence at beginning. Begin playing the ${inst.toLowerCase()} part from the very first moment.`;
      }
      
      const requestBody = {
        prompt: prompt,
        music_length_ms: 10000, // 10 seconds minimum as per API docs
        // format: "mp3", // Not needed, API returns MP3 by default
        // mode: "music", // Not a valid parameter
        // quality: "standard", // Not a valid parameter
        // seed: Math.floor(Date.now() / 1000), // Not a valid parameter for music API
      };
      
      console.log(`🎵 ElevenLabs Request for ${inst}:`, requestBody);
      
      const response = await fetch("https://api.elevenlabs.io/v1/music/compose", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": process.env.NEXT_PUBLIC_ELEVEN_API_KEY || "",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API Error:", response.status, errorText);
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }

      console.log(`📊 ElevenLabs Response Headers:`, Object.fromEntries(response.headers.entries()));
      
      const blob = await response.blob();
      console.log(`📁 Generated blob size: ${blob.size} bytes (${(blob.size / 1024).toFixed(2)} KB)`);
      
      const audioUrl = URL.createObjectURL(blob);
      console.log(`✅ ${inst} track generated successfully`);
      
      return audioUrl;
    } catch (err) {
      console.error("Generation error for", inst, ":", err);
      return null;
    }
  }

  async function addTrack(inst: string) {
    console.log(`🎹 addTrack called for: ${inst}`);
    console.log(`🎹 Current tracks count: ${tracks.length}`);
    console.log(`🎹 Current tracks:`, tracks.map(t => t.name));
    
    if (!tracks.find((t) => t.name === inst)) {
      // Add track with loading state first
      const loadingTrack: Track = { name: inst, id: Date.now(), url: null, muted: false };
      console.log(`🎹 Adding loading track:`, loadingTrack);
      setTracks(prev => [...prev, loadingTrack]);
      setHistory(prev => [...prev, `🎵 Adding ${inst}...`]);
      
      // Generate audio
      const url = await generateTrack(inst);
      
      // Update track with generated audio or error state
      console.log(`🎹 Updating track ${loadingTrack.id} with URL:`, url ? 'SUCCESS' : 'FAILED');
      setTracks(prev => {
        console.log(`🎹 Before update - tracks count: ${prev.length}`);
        const updated = prev.map(t => 
          t.id === loadingTrack.id 
            ? { ...t, url } 
            : t
        );
        console.log(`🎹 After update - tracks count: ${updated.length}`);
        console.log(`🎹 Updated tracks:`, updated.map(t => `${t.name}(${t.url ? 'loaded' : 'loading'})`));
        return updated;
      });
      
      // Update history
      setHistory(prev => [
        ...prev.slice(0, -1), // Remove loading message
        url ? `✅ ${inst} added successfully` : `❌ Failed to generate ${inst}`
      ]);
    }
  }

  async function playAll() {
    const refs = audioRefs.current;
    const audioElements: HTMLAudioElement[] = [];
    
    // Prepare all audio elements
    tracks.forEach((t) => {
      const audio = refs.get(t.id);
      if (audio && t.url) {
        audio.currentTime = 0;
        audio.muted = !!t.muted;
        audioElements.push(audio);
      }
    });
    
    // Synchronize start - all tracks begin at exactly the same time
    if (audioElements.length > 0) {
      try {
        // Start all simultaneously using Promise.all
        await Promise.all(
          audioElements.map(audio => {
            return new Promise<void>((resolve) => {
              audio.addEventListener('canplaythrough', () => resolve(), { once: true });
              if (audio.readyState >= 4) resolve(); // Already loaded
            });
          })
        );
        
        // Play all at the exact same moment
        const startTime = performance.now();
        audioElements.forEach(audio => {
          audio.play().catch(() => {}); // Ignore play errors
        });
        
        console.log(`🎵 Started ${audioElements.length} tracks synchronously at ${startTime}`);
      } catch (err) {
        console.error("Sync playback error:", err);
      }
    }
  }

  function stopAll() {
    const refs = audioRefs.current;
    tracks.forEach((t) => {
      const audio = refs.get(t.id);
      if (audio && t.url) {
        audio.pause();
        audio.currentTime = 0;
      }
    });
    console.log(`⏹️ Stopped all tracks`);
  }

  function toggleMute(trackId: number) {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)));
    const audio = audioRefs.current.get(trackId);
    if (audio) audio.muted = !audio.muted;
  }

  function removeTrack(trackId: number) {
    const track = tracks.find(t => t.id === trackId);
    if (track) {
      // Stop and clean up audio
      const audio = audioRefs.current.get(trackId);
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        if (track.url) {
          URL.revokeObjectURL(track.url); // Clean up blob URL
        }
      }
      audioRefs.current.delete(trackId);
      
      // Remove from tracks
      setTracks(prev => prev.filter(t => t.id !== trackId));
      setHistory(prev => [...prev, `🗑️ Removed ${track.name}`]);
      
      console.log(`🗑️ Removed track: ${track.name}`);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined" && "webkitSpeechRecognition" in window) {
      recognitionRef.current = new window.webkitSpeechRecognition();
      const rec = recognitionRef.current;
      rec.lang = "en-US"; // можно изменить на "ru-RU" для русского
      rec.continuous = false;
      rec.interimResults = false;

      rec.onresult = (event: RecognitionEvent) => {
        const command = event.results[0][0].transcript.toLowerCase();
        console.log(`🎤 Voice command: "${command}"`);
        
        // Enhanced matching with synonyms and variations (English + Russian)
        const instrumentMap: { [key: string]: string } = {
          // Piano variations
          'piano': 'Piano',
          'keyboard': 'Piano', 
          'keys': 'Piano',
          'пианино': 'Piano',
          'клавиши': 'Piano',
          'фортепиано': 'Piano',
          
          // Guitar variations (order matters - more specific first!)
          'bass guitar': 'Bass Guitar', 
          'electric bass': 'Electric Bass',
          'electric guitar': 'Electric Guitar',
          'acoustic guitar': 'Electric Guitar',
          'guitar': 'Electric Guitar',
          'bass': 'Bass Guitar',
          'гитара': 'Electric Guitar',
          'электрогитара': 'Electric Guitar',
          'бас': 'Bass Guitar',
          'басс': 'Bass Guitar',
          'бас-гитара': 'Bass Guitar',
          
          // Drums variations
          'drums': 'Drum Set',
          'drum set': 'Drum Set',
          'drum': 'Drum Set',
          'percussion': 'Drum Set',
          'барабаны': 'Drum Set',
          'барабан': 'Drum Set',
          'ударные': 'Drum Set',
          
          // Wind instruments
          'saxophone': 'Saxophone',
          'sax': 'Saxophone', 
          'trumpet': 'Trumpet',
          'саксофон': 'Saxophone',
          'сакс': 'Saxophone',
          'труба': 'Trumpet',
          'трубка': 'Trumpet',
          
          // Other
          'maracas': 'Maracas',
          'shaker': 'Maracas',
          'маракасы': 'Maracas',
          'маракас': 'Maracas'
        };
        
        // First try exact matches
        let matchedInstrument = instrumentMap[command];
        
        // Then try partial matches
        if (!matchedInstrument) {
          for (const [keyword, instrument] of Object.entries(instrumentMap)) {
            if (command.includes(keyword)) {
              matchedInstrument = instrument;
              break;
            }
          }
        }
        
        if (matchedInstrument) {
          console.log(`✅ Voice matched: ${matchedInstrument}`);
          addTrack(matchedInstrument);
          setHistory(prev => [...prev, `🎤 Voice added: ${matchedInstrument}`]);
        } else {
          console.log(`❌ Voice command not recognized: "${command}"`);
          setHistory(prev => [...prev, `🎤 Couldn't understand: "${command}"`]);
        }
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

  function changeBPM(newBPM: number) {
    if (tracks.filter(t => t.url).length > 0) {
      // Warn user if tracks already exist
      if (confirm(`Changing BPM will affect future tracks. Current tracks are at ${currentBPM} BPM. Continue?`)) {
        setCurrentBPM(newBPM);
        setHistory(prev => [...prev, `🎵 Changed tempo to ${newBPM} BPM`]);
      }
    } else {
      setCurrentBPM(newBPM);
      setHistory(prev => [...prev, `🎵 Set tempo to ${newBPM} BPM`]);
    }
  }
  
  // Development helper - clear all tracks
  function clearAllTracks() {
    if (confirm('Clear all tracks? This will remove all generated music.')) {
      setTracks([]);
      setHistory([]);
      if (isClient) {
        localStorage.removeItem('groove-app-tracks');
      }
      console.log('🧹 Cleared all tracks');
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
        Groove Generator
      </motion.h1>
      <p className="text-center text-white/80 mb-8">Build your groove, layer by layer</p>

      {/* Current Tracks Card */}
      <Card className="max-w-2xl mx-auto glass-card text-white/90">
        <CardContent className="p-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-neutral-800">Current Tracks</h2>
            <div className="flex items-center gap-3">
              <select 
                value={currentBPM}
                onChange={(e) => changeBPM(Number(e.target.value))}
                className="text-sm text-neutral-700 bg-neutral-100 border border-neutral-300 px-2 py-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {bpmPresets.map(bpm => (
                  <option key={bpm} value={bpm}>{bpm} BPM</option>
                ))}
              </select>
              <div className="text-sm text-neutral-600 bg-neutral-100 px-3 py-1 rounded-full">
                4/4
              </div>
            </div>
          </div>
          {tracks.length === 0 ? (
            <motion.div 
              className="text-center py-12"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="text-6xl mb-4">🎵</div>
              <h3 className="text-xl font-semibold text-white/90 mb-2">No tracks yet</h3>
              <p className="text-white/70 mb-8">Start by adding your first instrument using voice or buttons below</p>
              
              {/* Large Voice Add Button */}
              <motion.div 
                className="mb-6"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  onClick={toggleListening}
                  className={`glass-pill w-24 h-24 rounded-full text-white flex flex-col items-center justify-center gap-1 transition-all duration-300 ${
                    listening 
                      ? "bg-red-400/50 shadow-lg shadow-red-500/25 animate-pulse" 
                      : "hover:shadow-lg hover:shadow-purple-500/25"
                  }`}
                >
                  <Mic size={28} />
                  <span className="text-xs font-medium">
                    {listening ? "Stop" : "Voice"}
                  </span>
                </Button>
              </motion.div>
              
              <p className="text-white/60 text-sm">
                {listening ? "🎤 Say an instrument name..." : "Tap to start voice recording"}
              </p>
            </motion.div>
          ) : (
            <>
              <motion.div className="space-y-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {tracks.map((track, index) => (
                  <motion.div
                    key={track.id}
                    className="glass-input px-3 sm:px-5 py-3"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-white/95 truncate flex-shrink-0 min-w-0">
                        {track.name}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          onClick={() => toggleMute(track.id)}
                          className="glass-pill h-7 w-7 sm:h-8 sm:w-8 p-0 rounded-full flex items-center justify-center hover:brightness-110"
                          aria-label={track.muted ? "Unmute" : "Mute"}
                          title={track.muted ? "Unmute" : "Mute"}
                        >
                          {track.muted ? <VolumeX size={12} className="sm:w-3.5 sm:h-3.5" /> : <Volume2 size={12} className="sm:w-3.5 sm:h-3.5" />}
                        </Button>
                        <Button
                          onClick={() => removeTrack(track.id)}
                          className="glass-pill h-7 w-7 sm:h-8 sm:w-8 p-0 rounded-full flex items-center justify-center hover:brightness-110 hover:bg-red-400/30 transition-all"
                          aria-label="Remove track"
                          title="Remove track"
                        >
                          <Trash2 size={12} className="sm:w-3.5 sm:h-3.5" />
                        </Button>
                      </div>
                    </div>
                    
                    {track.url ? (
                      <div className="mt-2">
                        <audio
                          ref={(el) => {
                            if (el) audioRefs.current.set(track.id, el);
                            else audioRefs.current.delete(track.id);
                          }}
                          muted={track.muted}
                          controls
                          loop
                          src={track.url}
                          className="w-full h-8"
                        />
                      </div>
                    ) : (
                      <div className="mt-2 text-center">
                        <span className="text-sm text-white/70 animate-pulse">loading...</span>
                      </div>
                    )}
                  </motion.div>
                ))}
              </motion.div>

              <div className="flex flex-col items-center gap-4 mt-6">
                {/* Main Voice Button - Always Large and Centered */}
                <motion.div 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    onClick={toggleListening}
                    className={`glass-pill w-20 h-20 rounded-full text-white flex flex-col items-center justify-center gap-1 transition-all duration-300 ${
                      listening 
                        ? "bg-red-400/50 shadow-lg shadow-red-500/25 animate-pulse" 
                        : "hover:shadow-lg hover:shadow-purple-500/25"
                    }`}
                  >
                    <Mic size={24} />
                    <span className="text-xs font-medium">
                      {listening ? "Stop" : "Voice"}
                    </span>
                  </Button>
                </motion.div>
                
                {/* Control Buttons */}
                <div className="flex gap-3">
                  <Button onClick={playAll} className="glass-pill px-6 py-3 text-white flex items-center gap-2 shadow">
                    <Play size={18} /> Play All
                  </Button>
                  <Button onClick={stopAll} className="glass-pill px-6 py-3 text-white flex items-center gap-2 shadow">
                    <Square size={18} /> Stop
                  </Button>
                  <Button onClick={clearAllTracks} className="glass-pill px-4 py-3 text-white/70 hover:text-white text-xs">
                    Clear All
                  </Button>
                </div>
                
                <p className="text-white/60 text-sm text-center">
                  {listening ? "🎤 Say an instrument name..." : "Use voice or buttons below to add tracks"}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Tempo Control Card - Only show when tracks exist */}
      {tracks.length > 0 && (
        <Card className="max-w-2xl mx-auto mt-8 glass-card text-white/90">
          <CardContent className="p-6">
            <h2 className="font-semibold mb-4 text-white/90">Tempo Control</h2>
            
            {/* Main BPM Control */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <Button 
                onClick={() => changeBPM(Math.max(60, currentBPM - 10))}
                className="glass-pill h-8 w-8 p-0 text-white hover:brightness-110"
              >
                -
              </Button>
              <div className="glass-input px-4 py-2 min-w-[80px] text-center">
                <span className="font-bold text-white">{currentBPM}</span>
                <span className="text-white/70 text-sm ml-1">BPM</span>
              </div>
              <Button 
                onClick={() => changeBPM(Math.min(200, currentBPM + 10))}
                className="glass-pill h-8 w-8 p-0 text-white hover:brightness-110"
              >
                +
              </Button>
            </div>
            
            {/* Quick Preset Buttons */}
            <div className="flex gap-2 justify-center flex-wrap">
              {[80, 100, 120, 140].map(bpm => (
                <Button
                  key={bpm}
                  onClick={() => changeBPM(bpm)}
                  className={`glass-pill px-4 py-2 text-sm transition-all ${
                    currentBPM === bpm 
                      ? 'bg-white/40 text-white font-bold shadow-lg' 
                      : 'text-white/80 hover:brightness-110 hover:scale-105'
                  }`}
                >
                  {bpm}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add instruments */}
      <Card className="max-w-2xl mx-auto mt-8 glass-card text-white/90">
        <CardContent className="p-8">
          <h2 className="font-semibold mb-6 text-white/90 text-center">
            {tracks.length === 0 ? "Choose your first instrument" : "Add more instruments"}
          </h2>
          <div className={`grid gap-4 place-items-center ${
            tracks.length === 0 ? "grid-cols-4" : "grid-cols-4 sm:grid-cols-6"
          }`}>
            {instrumentDefs.map(({ name, emoji }) => (
              <motion.div
                key={name}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="relative"
              >
                <Button
                  onClick={() => addTrack(name)}
                  aria-label={name}
                  title={name}
                  className={`glass-pill rounded-full p-0 text-white flex flex-col items-center justify-center hover:brightness-110 transition-all ${
                    tracks.length === 0 
                      ? "h-16 w-16 sm:h-20 sm:w-20 hover:shadow-lg hover:shadow-purple-500/25" 
                      : "h-16 w-16 sm:h-20 sm:w-20"
                  }`}
                >
                  <span className={tracks.length === 0 ? "text-3xl sm:text-4xl" : "text-3xl sm:text-4xl"}>
                    {emoji}
                  </span>
                  <span className="sr-only">{name}</span>
                </Button>
                
                {/* Curved text around button - ALWAYS visible */}
                <div className="absolute inset-0 pointer-events-none" style={{ transform: 'scale(1.4)' }}>
                  <svg
                    className="w-full h-full"
                    viewBox="0 0 100 100"
                    style={{ overflow: 'visible' }}
                  >
                    <defs>
                      <path
                        id={`circle-${name}`}
                        d="M 50,50 m -42,0 a 42,42 0 1,1 84,0 a 42,42 0 1,1 -84,0"
                        fill="none"
                      />
                    </defs>
                    <text
                      className="fill-white/80 font-medium"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{ fontSize: '9px' }}
                    >
                      <textPath href={`#circle-${name}`} startOffset="25%">
                        {name.toUpperCase()}
                      </textPath>
                    </text>
                  </svg>
                </div>
              </motion.div>
            ))}
          </div>
          
          {/* Voice Button Below Instruments */}
          <div className="flex justify-center mt-6">
            <motion.div 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                onClick={toggleListening}
                className={`glass-pill w-16 h-16 sm:w-20 sm:h-20 rounded-full text-white flex flex-col items-center justify-center gap-1 transition-all duration-300 ${
                  listening 
                    ? "bg-red-400/50 shadow-lg shadow-red-500/25 animate-pulse" 
                    : "hover:shadow-lg hover:shadow-purple-500/25"
                }`}
              >
                <Mic size={20} className="sm:w-6 sm:h-6" />
                <span className="text-xs font-medium">
                  {listening ? "Stop" : "Voice"}
                </span>
              </Button>
            </motion.div>
          </div>
          
          {tracks.length === 0 && (
            <motion.p 
              className="text-center text-white/60 text-sm mt-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              Or try saying: &ldquo;Add piano&rdquo;, &ldquo;Добавь барабаны&rdquo;, &ldquo;Sax please&rdquo;
            </motion.p>
          )}
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
