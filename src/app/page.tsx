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
    
    // Initialize Web Audio API
    if (typeof window !== 'undefined' && 'AudioContext' in window) {
      try {
        audioContextRef.current = new AudioContext();
        setWebAudioSupported(true);
        console.log('🎧 Web Audio API initialized for seamless looping');
      } catch (e) {
        console.warn('⚠️ Web Audio API not supported, falling back to HTML5 audio');
        setWebAudioSupported(false);
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
  const loopHandlers = useRef<Map<number, () => void>>(new Map());
  
  // Web Audio API for seamless looping
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBuffersRef = useRef<Map<number, AudioBuffer>>(new Map());
  const sourceNodesRef = useRef<Map<number, AudioBufferSourceNode>>(new Map());
  const gainNodesRef = useRef<Map<number, GainNode>>(new Map());
  const [webAudioSupported, setWebAudioSupported] = useState(false);
  const [isPlayingAll, setIsPlayingAll] = useState(false);

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
  
  // Calculate optimal duration for complete musical phrases
  function calculateOptimalDuration(bpm: number, timeSignature: { beats: number, noteValue: number } = { beats: 4, noteValue: 4 }): number {
    // Calculate seconds per beat
    const secondsPerBeat = 60 / bpm;
    
    // Calculate seconds per measure/bar
    const secondsPerBar = secondsPerBeat * timeSignature.beats;
    
    // Find the minimum number of bars that gives us at least 10 seconds
    const minBars = Math.ceil(10 / secondsPerBar);
    
    // Calculate total duration in seconds (rounded to avoid floating point issues)
    const durationSeconds = Math.round(minBars * secondsPerBar * 1000) / 1000;
    
    console.log(`🎵 Calculated duration for ${bpm} BPM: ${minBars} bars = ${durationSeconds.toFixed(2)} seconds`);
    
    return durationSeconds;
  }
  
  // Show current optimal duration in UI
  function getCurrentDuration(): string {
    const duration = calculateOptimalDuration(currentBPM);
    const bars = Math.ceil(10 / ((60 / currentBPM) * 4));
    return `${bars} bars (${duration.toFixed(1)}s)`;
  }
  
  // Load audio buffer for Web Audio API seamless looping
  async function loadAudioBuffer(trackId: number, url: string): Promise<void> {
    if (!audioContextRef.current || !webAudioSupported) return;
    
    try {
      console.log(`🎧 Loading audio buffer for track ${trackId}`);
      
      // Fetch audio data
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      
      // Decode audio data
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      audioBuffersRef.current.set(trackId, audioBuffer);
      
      console.log(`✅ Audio buffer loaded for track ${trackId}, duration: ${audioBuffer.duration.toFixed(2)}s`);
    } catch (error) {
      console.error(`❌ Failed to load audio buffer for track ${trackId}:`, error);
    }
  }
  
  // Play track with Web Audio API (seamless looping)
  function playTrackWebAudio(trackId: number, muted: boolean = false): void {
    if (!audioContextRef.current || !webAudioSupported) return;

    const audioBuffer = audioBuffersRef.current.get(trackId);
    if (!audioBuffer) return;

    // Stop existing source if playing
    const existingSource = sourceNodesRef.current.get(trackId);
    if (existingSource) {
      existingSource.stop();
      sourceNodesRef.current.delete(trackId);
    }

    // Create new source node
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true; // Web Audio seamless loop!

    // Limit loop to 8-10 seconds for diverse, consistent looping
    const MAX_LOOP_DURATION = 10.0;
    const MIN_LOOP_DURATION = 8.0;

    if (audioBuffer.duration > MAX_LOOP_DURATION) {
      source.loopStart = 0;
      source.loopEnd = MAX_LOOP_DURATION;
      console.log(`🔄 Limited Web Audio diverse loop for track ${trackId} to ${MAX_LOOP_DURATION}s (original: ${audioBuffer.duration.toFixed(2)}s)`);
    } else if (audioBuffer.duration >= MIN_LOOP_DURATION) {
      console.log(`✅ Web Audio diverse loop for track ${trackId}: ${audioBuffer.duration.toFixed(2)}s (perfect range)`);
    }

    // Create gain node for volume control
    const gainNode = audioContextRef.current.createGain();
    gainNode.gain.value = muted ? 0 : 1;

    // Connect: source -> gain -> destination
    source.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);

    // Store references
    sourceNodesRef.current.set(trackId, source);
    gainNodesRef.current.set(trackId, gainNode);

    // Start playing
    source.start();
    console.log(`🎵 Started Web Audio seamless loop for track ${trackId}`);
  }
  
  // Stop track with Web Audio API
  function stopTrackWebAudio(trackId: number): void {
    const source = sourceNodesRef.current.get(trackId);
    if (source) {
      source.stop();
      sourceNodesRef.current.delete(trackId);
      gainNodesRef.current.delete(trackId);
      console.log(`⏹️ Stopped Web Audio track ${trackId}`);
    }
  }
  
  // Toggle mute with Web Audio API
  function toggleMuteWebAudio(trackId: number, muted: boolean): void {
    const gainNode = gainNodesRef.current.get(trackId);
    if (gainNode) {
      gainNode.gain.value = muted ? 0 : 1;
    }
  }

  async function generateTrack(inst: string, style?: string): Promise<string | null> {
    try {
      const displayName = style ? `${style} ${inst}` : inst;
      console.log(`🎵 Generating ${displayName} track...`);
      console.log(`🔧 Using API endpoint: /v1/music/compose`);
      
      // Build context from existing tracks
      const existingInstruments = tracks
        .filter(t => t.url) // Only successful tracks
        .map(t => t.name.toLowerCase());
      
      let prompt = "";
      
      const styleDescription = style ? ` in ${style} style` : '';
      const instrumentWithStyle = style ? `${style} ${inst.toLowerCase()}` : inst.toLowerCase();

      // Different complexity instructions for drums vs melodic instruments
      const isDrumInstrument = inst.toLowerCase().includes('drum') || inst.toLowerCase().includes('maracas');
      const complexityInstruction = isDrumInstrument
        ? "Use a minimum of 10 different drum sounds/percussion elements throughout the loop - include kick, snare, hi-hats (open/closed), crash cymbals, ride, toms (high/mid/low), floor tom, rim shots, and other percussion elements to create maximum rhythmic and timbral diversity."
        : "Use a minimum of 10 different notes/pitches throughout the loop - include various octaves, chord tones, passing notes, chromatic runs, arpeggios, and melodic intervals to create maximum harmonic and melodic diversity.";
      
      if (existingInstruments.length === 0) {
        // First track - establish the groove
        prompt = `Generate a diverse 10 second SOLO ${instrumentWithStyle} loop at ${currentBPM} BPM, 4/4 time signature${styleDescription}. Create a VARIED and INTERESTING loopable pattern with multiple musical phrases, dynamic changes, fills, and variations - NOT repetitive. The loop should be musically rich and diverse, containing at least 2-4 different patterns or variations within the 8-10 seconds. MUSICAL COMPLEXITY: ${complexityInstruction} Avoid repetitive single ${isDrumInstrument ? 'drum hits' : 'notes'} or simple patterns. CRITICAL: ONLY ${inst.toLowerCase().toUpperCase()} SOUND - absolutely NO other instruments, NO backing tracks, NO accompaniment, NO drums (unless this IS drums), NO bass (unless this IS bass), NO piano, NO guitar, NO vocals, NO harmony instruments. This must be a COMPLETELY ISOLATED ${inst.toLowerCase()} track - pure ${inst.toLowerCase()} sound only, as if recorded in isolation for layering. START IMMEDIATELY from first millisecond - no count-in, no intro, no drum stick clicks, no silence at beginning. Begin playing the ${instrumentWithStyle} groove from the very first moment. Create MUSICAL DIVERSITY within the loop - different patterns, fills, dynamics, and use ${isDrumInstrument ? '10+ different drum/percussion sounds' : '10+ different notes/pitches'}. IMPORTANT: Keep it 8-10 seconds long. Maintain CONSISTENT VOLUME throughout - no fade-in, no fade-out, no volume changes. End abruptly at full volume for seamless looping. DURATION: 8-10 seconds with maximum musical and ${isDrumInstrument ? 'rhythmic/timbral' : 'melodic/harmonic'} variation. SOLO INSTRUMENT ONLY.`;
      } else {
        // Additional tracks - match existing groove
        const contextInstruments = existingInstruments.join(", ");
        prompt = `Generate a diverse 10 second SOLO ${instrumentWithStyle} loop that complements existing ${contextInstruments} at ${currentBPM} BPM, 4/4 time${styleDescription}. Create a VARIED and INTERESTING loopable pattern with multiple musical phrases, counter-melodies, harmonic variations, and complementary fills - NOT repetitive. The loop should be musically rich and diverse, containing at least 2-4 different patterns or variations within the 8-10 seconds that work with existing tracks. MUSICAL COMPLEXITY: ${complexityInstruction} while complementing existing instruments. Avoid repetitive single ${isDrumInstrument ? 'drum hits' : 'notes'} or simple patterns. CRITICAL: ONLY ${inst.toLowerCase().toUpperCase()} SOUND - absolutely NO other instruments mixed in, NO backing tracks, NO accompaniment, NO drums (unless this IS drums), NO bass (unless this IS bass), NO piano, NO guitar, NO vocals, NO harmony instruments. This must be a COMPLETELY ISOLATED ${inst.toLowerCase()} track - pure ${inst.toLowerCase()} sound only, recorded in isolation for perfect layering with other tracks. START IMMEDIATELY from first millisecond - no count-in, no intro, no drum stick clicks, no silence at beginning. Begin playing the ${instrumentWithStyle} part from the very first moment. Create MUSICAL DIVERSITY within the loop - different patterns, complementary fills, harmonic variations, and use ${isDrumInstrument ? '10+ different drum/percussion sounds' : '10+ different notes/pitches'}. IMPORTANT: Keep it 8-10 seconds long. Maintain CONSISTENT VOLUME throughout - no fade-in, no fade-out, no volume changes. End abruptly at full volume for seamless looping. DURATION: 8-10 seconds with maximum musical and ${isDrumInstrument ? 'rhythmic/timbral' : 'melodic/harmonic'} variation. SOLO INSTRUMENT ONLY.`;
      }
      
      // Calculate optimal duration for current BPM to get complete musical phrases
      const optimalDurationSeconds = calculateOptimalDuration(currentBPM);

      // Force consistent duration - 8-10 seconds for diverse loops
      const CONSISTENT_DURATION = 10.0; // Target 10 second duration for diverse loops
      const durationMs = Math.round(CONSISTENT_DURATION * 1000);
      
      const requestBody = {
        prompt: prompt,
        music_length_ms: durationMs, // Dynamic duration based on BPM for complete phrases
        model_id: "music_v1", // Explicitly specify model
        output_format: "mp3_44100_128" // Explicitly specify output format
      };

      console.log(`🎵 ElevenLabs Request for SOLO ${inst}:`);
      console.log(`   - BPM: ${currentBPM}`);
      console.log(`   - Optimal duration (calculated): ${optimalDurationSeconds}s`);
      console.log(`   - Target duration: ${CONSISTENT_DURATION}s (${durationMs}ms) - diverse loop`);
      console.log(`   - ISOLATION: Only ${inst.toUpperCase()} sound, no other instruments`);
      console.log(`   - COMPLEXITY: ${isDrumInstrument ? '10+ different drum/percussion sounds' : '10+ different notes/pitches'}`);
      console.log(`   - Request includes: musical diversity, variations, fills, complexity`);
      console.log(`   - Request body:`, requestBody);
      
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

      // Check actual audio duration and trim if needed
      const tempAudio = new Audio(audioUrl);
      tempAudio.addEventListener('loadedmetadata', () => {
        const actualDuration = tempAudio.duration;
        console.log(`⏱️ ${inst} track durations:`);
        console.log(`   - Requested: ${CONSISTENT_DURATION.toFixed(2)}s`);
        console.log(`   - Actual: ${actualDuration.toFixed(2)}s`);
        console.log(`   - Difference: ${(actualDuration - CONSISTENT_DURATION).toFixed(2)}s`);

        if (actualDuration > CONSISTENT_DURATION + 2) {
          console.warn(`⚠️ Track ${inst} is too long (${actualDuration.toFixed(2)}s), will be limited to ${CONSISTENT_DURATION}s diverse loop during playback`);
        } else if (actualDuration >= 8 && actualDuration <= 12) {
          console.log(`✅ Track ${inst} duration is good for diverse looping: ${actualDuration.toFixed(2)}s`);
        }
      });

      console.log(`✅ ${inst} track generated successfully`);
      
      return audioUrl;
    } catch (err) {
      console.error("Generation error for", inst, ":", err);
      return null;
    }
  }

  async function addTrack(inst: string, style?: string) {
    const displayName = style ? `${style} ${inst}` : inst;
    console.log(`🎹 addTrack called for: ${displayName}`);
    console.log(`🎹 Current tracks count: ${tracks.length}`);
    console.log(`🎹 Current tracks:`, tracks.map(t => t.name));
    
    if (!tracks.find((t) => t.name === displayName)) {
      // Add track with loading state first
      const loadingTrack: Track = { name: displayName, id: Date.now(), url: null, muted: false };
      console.log(`🎹 Adding loading track:`, loadingTrack);
      setTracks(prev => [...prev, loadingTrack]);
      setHistory(prev => [...prev, `🎵 Adding ${displayName}...`]);
      
      // Generate audio
      const url = await generateTrack(inst, style);
      
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
      
      // Load audio buffer for Web Audio API if available
      if (url && webAudioSupported) {
        await loadAudioBuffer(loadingTrack.id, url);
      }
      
      // Update history
      setHistory(prev => [
        ...prev.slice(0, -1), // Remove loading message
        url ? `✅ ${displayName} added successfully` : `❌ Failed to generate ${displayName}`
      ]);
    }
  }

  async function playAll() {
    try {
      console.log("🎵 PlayAll function started");
      console.log("🎵 Total tracks:", tracks.length);
      console.log("🎵 Tracks with URLs:", tracks.filter(t => t.url).length);
      console.log("🎵 Web Audio supported:", webAudioSupported);
      console.log("🎵 AudioContext state:", audioContextRef.current?.state);

      // Check if we have any tracks to play
      const playableTracks = tracks.filter(t => t.url);
      if (playableTracks.length === 0) {
        console.warn("⚠️ No tracks available to play");
        alert("No tracks loaded yet. Please add some tracks first.");
        return;
      }

      console.log("🎵 Proceeding with playback of", playableTracks.length, "tracks");

      // First, stop all HTML5 audio to prevent conflicts
      const refs = audioRefs.current;
      tracks.forEach((t) => {
        const audio = refs.get(t.id);
        if (audio && t.url) {
          audio.pause();
          audio.currentTime = 0;
        }
      });

      // Resume AudioContext if suspended (required by browsers)
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        console.log("🎧 Resuming suspended AudioContext");
        await audioContextRef.current.resume();
      }

      setIsPlayingAll(true);

      if (webAudioSupported && audioContextRef.current) {
        // Use Web Audio API for perfect seamless looping
        console.log(`🎧 Starting ${playableTracks.length} tracks with Web Audio API`);
        const startTime = performance.now();

        // Check if audio buffers are loaded
        let buffersLoaded = 0;
        for (const track of playableTracks) {
          if (audioBuffersRef.current.has(track.id)) {
            buffersLoaded++;
          } else if (track.url) {
            // Load buffer if not already loaded
            console.log(`📥 Loading missing audio buffer for ${track.name}`);
            await loadAudioBuffer(track.id, track.url);
            if (audioBuffersRef.current.has(track.id)) {
              buffersLoaded++;
            }
          }
        }

        console.log(`📊 Audio buffers loaded: ${buffersLoaded}/${playableTracks.length}`);

        // Play tracks that have loaded buffers
        playableTracks.forEach((track) => {
          if (track.url && audioBuffersRef.current.has(track.id)) {
            playTrackWebAudio(track.id, !!track.muted);
          } else {
            console.warn(`⚠️ Cannot play ${track.name}: buffer not loaded`);
          }
        });

        console.log(`🎵 Started ${buffersLoaded} Web Audio tracks synchronously at ${startTime}`);
      } else {
        // Fallback to HTML5 audio
        console.log(`🎵 Using HTML5 audio fallback for ${playableTracks.length} tracks`);
        const audioElements: HTMLAudioElement[] = [];

        // Prepare all audio elements
        playableTracks.forEach((t) => {
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
            // Wait for all audio elements to be ready
            await Promise.all(
              audioElements.map(audio => {
                return new Promise<void>((resolve, reject) => {
                  const timeout = setTimeout(() => {
                    reject(new Error(`Timeout loading ${audio.src}`));
                  }, 5000);

                  audio.addEventListener('canplaythrough', () => {
                    clearTimeout(timeout);
                    resolve();
                  }, { once: true });

                  if (audio.readyState >= 4) {
                    clearTimeout(timeout);
                    resolve(); // Already loaded
                  }
                });
              })
            );

            // Play all at the exact same moment
            const startTime = performance.now();
            const playPromises = audioElements.map(audio => {
              return audio.play().catch(err => {
                console.error(`Failed to play audio: ${err.message}`);
                return Promise.resolve();
              });
            });

            await Promise.all(playPromises);
            console.log(`🎵 Started ${audioElements.length} HTML5 tracks synchronously at ${startTime}`);
          } catch (err) {
            console.error("Sync playback error:", err);
            // Don't return here - still set playing state
          }
        }
      }
    } catch (err) {
      console.error("PlayAll error:", err);
      setIsPlayingAll(false);
    }
  }

  function stopAll() {
    setIsPlayingAll(false);
    
    // ALWAYS stop both Web Audio AND HTML5 audio to prevent conflicts
    
    // Stop Web Audio tracks
    if (webAudioSupported) {
      tracks.forEach((track) => {
        stopTrackWebAudio(track.id);
      });
      console.log(`⏹️ Stopped all Web Audio tracks`);
    }
    
    // Also stop HTML5 audio tracks
    const refs = audioRefs.current;
    const handlers = loopHandlers.current;
    
    tracks.forEach((t) => {
      const audio = refs.get(t.id);
      const handler = handlers.get(t.id);
      
      if (audio && t.url) {
        audio.pause();
        audio.currentTime = 0;
        
        // Remove event listener using stored handler
        if (handler) {
          audio.removeEventListener('ended', handler);
          handlers.delete(t.id);
        }
      }
    });
    console.log(`⏹️ Stopped all HTML5 tracks`);
  }

  function toggleMute(trackId: number) {
    const track = tracks.find(t => t.id === trackId);
    const newMutedState = !track?.muted;
    
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, muted: newMutedState } : t)));
    
    if (isPlayingAll && webAudioSupported) {
      // Toggle mute with Web Audio API when playing all
      toggleMuteWebAudio(trackId, newMutedState);
    } else {
      // Fallback to HTML5 audio or when not playing all
      const audio = audioRefs.current.get(trackId);
      if (audio) audio.muted = newMutedState;
    }
  }

  function removeTrack(trackId: number) {
    const track = tracks.find(t => t.id === trackId);
    if (track) {
      // Stop Web Audio track if it's playing
      if (webAudioSupported) {
        stopTrackWebAudio(trackId);
        audioBuffersRef.current.delete(trackId);
      }
      
      // Stop and clean up HTML5 audio
      const audio = audioRefs.current.get(trackId);
      const handler = loopHandlers.current.get(trackId);
      
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        
        // Remove loop handler
        if (handler) {
          audio.removeEventListener('ended', handler);
          loopHandlers.current.delete(trackId);
        }
        
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
        
        // Parse style and instrument from command
        function parseVoiceCommand(command: string): { instrument: string; style?: string } {
          // Common musical styles
          const styles = [
            'jazz', 'rock', 'blues', 'funk', 'funky', 'classical', 'acoustic', 'electric',
            'latin', 'reggae', 'country', 'pop', 'metal', 'punk', 'ambient', 'electronic',
            'hip hop', 'rap', 'rnb', 'soul', 'disco', 'techno', 'house', 'dubstep',
            'джаз', 'рок', 'блюз', 'фанк', 'классика', 'акустик', 'электрик', 'метал'
          ];
          
          let detectedStyle = '';
          let remainingCommand = command;
          
          // Check for style keywords
          for (const style of styles) {
            if (command.includes(style)) {
              detectedStyle = style;
              remainingCommand = command.replace(new RegExp(style, 'gi'), '').trim();
              break;
            }
          }
          
          const instrument = (remainingCommand || command).trim();
          return { 
            instrument, 
            style: detectedStyle || undefined 
          };
        }
        
        const { instrument: commandInstrument, style: commandStyle } = parseVoiceCommand(command);
        
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
        
        // First try exact matches on cleaned instrument command
        const cleanedInstrument = (commandInstrument || "").trim();
        let matchedInstrument = cleanedInstrument ? instrumentMap[cleanedInstrument] : undefined;
        
        // Then try partial matches
        if (!matchedInstrument) {
          for (const [keyword, instrument] of Object.entries(instrumentMap)) {
            if (cleanedInstrument.includes(keyword)) {
              matchedInstrument = instrument;
              break;
            }
          }
        }
        
        if (matchedInstrument) {
          const displayName = commandStyle ? `${commandStyle} ${matchedInstrument}` : matchedInstrument;
          console.log(`✅ Voice matched: ${matchedInstrument} ${commandStyle ? `with style: ${commandStyle}` : ''}`);
          addTrack(matchedInstrument, commandStyle);
          setHistory(prev => [...prev, `🎤 Voice added: ${displayName}`]);
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
              <div className="text-xs text-neutral-500 bg-neutral-50 px-2 py-1 rounded" title="Track duration for complete musical phrases">
                {getCurrentDuration()}
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
                            if (el) {
                              audioRefs.current.set(track.id, el);
                              
                              // Set up seamless looping only if not already set
                              if (!loopHandlers.current.has(track.id)) {
                                const MAX_HTML5_DURATION = 10.0;
                                let loopTimeout: NodeJS.Timeout | null = null;

                                const loopHandler = () => {
                                  console.log(`🔄 Track ${track.name} (${track.id}) ended, restarting loop`);
                                  el.currentTime = 0;
                                  el.play().catch((err) => {
                                    console.error(`❌ Loop restart failed for ${track.name}:`, err);
                                  });

                                  // Set timeout to force restart at 10s if track is longer
                                  if (el.duration > MAX_HTML5_DURATION) {
                                    if (loopTimeout) clearTimeout(loopTimeout);
                                    loopTimeout = setTimeout(() => {
                                      if (!el.paused && el.currentTime > MAX_HTML5_DURATION) {
                                        console.log(`⏰ Force restart HTML5 track ${track.name} at ${MAX_HTML5_DURATION}s`);
                                        el.currentTime = 0;
                                        el.play().catch(() => {});
                                      }
                                    }, MAX_HTML5_DURATION * 1000);
                                  }

                                  console.log(`✅ Track ${track.name} loop restarted`);
                                };
                                
                                // Also set up timeupdate listener to force loop at exactly 10s
                                const timeUpdateHandler = () => {
                                  if (el.currentTime >= MAX_HTML5_DURATION && el.duration > MAX_HTML5_DURATION) {
                                    console.log(`⏰ Force loop HTML5 track ${track.name} at ${el.currentTime.toFixed(2)}s`);
                                    el.currentTime = 0;
                                  }
                                };

                                loopHandlers.current.set(track.id, loopHandler);
                                el.addEventListener('ended', loopHandler);
                                el.addEventListener('timeupdate', timeUpdateHandler);
                              }
                              
                              // Log duration when metadata loads
                              el.addEventListener('loadedmetadata', () => {
                                console.log(`📏 Track ${track.name} duration: ${el.duration.toFixed(2)} seconds`);
                                if (el.duration >= 8 && el.duration <= 12) {
                                  console.log(`✅ Track ${track.name} has good duration for diverse looping: ${el.duration.toFixed(2)}s`);
                                } else if (el.duration > 12) {
                                  console.warn(`⚠️ Track ${track.name} is ${el.duration.toFixed(2)}s - will be limited to 10s diverse loop!`);
                                } else {
                                  console.warn(`⚠️ Track ${track.name} is too short: ${el.duration.toFixed(2)}s - should be 8-10s for diverse patterns!`);
                                }
                              });
                              
                            } else {
                              // Cleanup when element is removed
                              const handler = loopHandlers.current.get(track.id);
                              if (handler) {
                                const audio = audioRefs.current.get(track.id);
                                if (audio) {
                                  audio.removeEventListener('ended', handler);
                                }
                                loopHandlers.current.delete(track.id);
                              }
                              audioRefs.current.delete(track.id);
                            }
                          }}
                          muted={track.muted}
                          controls
                          src={track.url}
                          className={`w-full h-8 ${isPlayingAll ? 'opacity-50 pointer-events-none' : ''}`}
                          style={isPlayingAll ? { pointerEvents: 'none' } : {}}
                        />
                        {isPlayingAll && (
                          <div className="text-xs text-white/60 text-center mt-1">
                            🎧 Playing with Web Audio (seamless loops)
                          </div>
                        )}
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
                  <Button
                    onClick={() => {
                      console.log("🎯 Play All button clicked!");
                      console.log("Current tracks:", tracks.length);
                      console.log("Tracks with URLs:", tracks.filter(t => t.url).length);
                      playAll();
                    }}
                    className="glass-pill px-6 py-3 text-white flex items-center gap-2 shadow"
                  >
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
          <div className={`grid gap-x-4 gap-y-8 place-items-center ${
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
              Try saying: &ldquo;Jazz drums&rdquo;, &ldquo;Rock guitar&rdquo;, &ldquo;Acoustic piano&rdquo;, &ldquo;Funky bass&rdquo;
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
