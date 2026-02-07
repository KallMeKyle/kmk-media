// src/App.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  Edit,
  Film,
  LogOut,
  Menu,
  MonitorPlay,
  Play,
  Plus,
  Save,
  Settings,
  Shield,
  Trash2,
  Volume2,
  VolumeX,
  X,
  Youtube,
} from 'lucide-react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import { createClient, type Session, type User as SupabaseUser } from '@supabase/supabase-js';

import logo from './assets/logo.png';

// --- TYPES & INTERFACES ---

type ProjectType = 'machinima' | 'edit';

interface Project {
  id: string;
  title: string;
  slug: string;
  type: ProjectType;
  thumbnail: string;
  youtubeUrl: string;
  description: string;
  shortDescription: string;
  tags: string[];
  year: string;
  client?: string;
  seriesName?: string;
  episode?: string;
  published: boolean;
}

interface User {
  email: string;
  name: string;
  role: 'admin' | 'user';
}

interface SiteSettings {
  featuredVideoUrl: string;
  soundEnabled: boolean; // local-only (SFX)
  soundVolume: number; // local-only (SFX)
}

// --- SUPABASE CLIENT ---

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.toLowerCase();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_ANON_KEY ?? '');

// --- BRAND TOKENS (match your logo) ---
const BRAND = {
  cyan: '#00E5FF',
  magenta: '#FF4FD8',
  orange: '#FF7A18',
};

// --- SOUND ENGINE (Web Audio API) ---

class AudioEngine {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  enabled = true;
  volume = 0.3;

  constructor() {
    try {
      // @ts-ignore
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.updateVolume(this.volume);

      const unlock = () => {
        if (this.ctx?.state === 'suspended') {
          this.ctx.resume().then(() => console.log('Audio Engine Resumed'));
        }
        window.removeEventListener('click', unlock);
        window.removeEventListener('keydown', unlock);
      };

      window.addEventListener('click', unlock);
      window.addEventListener('keydown', unlock);
    } catch {
      console.warn('Web Audio API not supported');
    }
  }

  updateVolume(vol: number) {
    this.volume = vol;
    if (this.masterGain) this.masterGain.gain.value = this.enabled ? vol : 0;
  }

  toggle(enabled: boolean) {
    this.enabled = enabled;
    if (this.masterGain) this.masterGain.gain.value = enabled ? this.volume : 0;
    if (enabled && this.ctx?.state === 'suspended') this.ctx.resume();
  }

  playClick() {
    if (!this.ctx || !this.enabled) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.masterGain!);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playHover() {
    if (!this.ctx || !this.enabled) return;
    if (this.ctx.state === 'suspended') return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.masterGain!);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2000, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.03);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.03);
  }

  playSwoosh() {
    if (!this.ctx || !this.enabled) return;
    if (this.ctx.state === 'suspended') return;

    const bufferSize = this.ctx.sampleRate * 1.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 1;

    const gain = this.ctx.createGain();

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);

    filter.frequency.setValueAtTime(100, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.4);
    filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 1.2);

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, this.ctx.currentTime + 0.4);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.2);

    noise.start();
  }
}

let audio: AudioEngine | null = null;
const getAudio = () => {
  if (!audio) audio = new AudioEngine();
  return audio;
};

// --- UI COMPONENTS ---

const FilmGrain = () => (
  <div className="pointer-events-none fixed inset-0 z-[60] h-full w-full opacity-[0.04] mix-blend-overlay">
    <svg className="h-full w-full">
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#noise)" />
    </svg>
  </div>
);

const CustomCursor = () => {
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const springConfig = { damping: 25, stiffness: 700 };
  const cursorXSpring = useSpring(cursorX, springConfig);
  const cursorYSpring = useSpring(cursorY, springConfig);
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const moveCursor = (e: MouseEvent) => {
      cursorX.set(e.clientX - 16);
      cursorY.set(e.clientY - 16);

      const target = e.target as HTMLElement;
      setIsHovering(!!target.closest('button, a, input, select, textarea, [data-hover]'));
    };
    window.addEventListener('mousemove', moveCursor);
    return () => window.removeEventListener('mousemove', moveCursor);
  }, [cursorX, cursorY]);

  return (
    <motion.div
      className="pointer-events-none fixed top-0 left-0 w-8 h-8 rounded-full border border-white/50 z-[70] mix-blend-difference hidden md:block"
      style={{ x: cursorXSpring, y: cursorYSpring }}
      animate={{
        scale: isHovering ? 2.5 : 1,
        backgroundColor: isHovering ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
        borderColor: isHovering ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.5)',
      }}
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-white rounded-full" />
    </motion.div>
  );
};

// Helper: Enhanced Youtube ID extraction
const getYoutubeId = (url: string) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
};

const getYoutubeThumbnailCandidates = (youtubeUrl: string) => {
  const id = getYoutubeId(youtubeUrl);
  if (!id) return [];
  return [
    `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  ];
};

const resolveProjectThumbnail = (p: Project) => {
  const explicit = p.thumbnail?.trim();
  if (explicit) return explicit;
  const [maxres, hq] = getYoutubeThumbnailCandidates(p.youtubeUrl);
  return maxres || hq || '';
};

// Navbar
const Navbar = ({
  view,
  setView,
  user,
  settings,
  updateSettings,
  logout,
}: {
  view: string;
  setView: (v: string) => void;
  user: User | null;
  settings: SiteSettings;
  updateSettings: (s: SiteSettings) => void;
  logout: () => void;
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLinkClick = (id: string) => {
    if (view !== id) {
      getAudio().playClick();
      setView(id);
    }
  };

  const navLinks = [
    { id: 'home', label: 'Home' },
    { id: 'machinimas', label: 'Machinimas' },
    { id: 'edits', label: 'Editing Portfolio' },
    { id: 'about', label: 'About' },
    { id: 'contact', label: 'Contact' },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled ? 'bg-zinc-950/90 backdrop-blur-md py-4 border-b border-white/5' : 'bg-transparent py-6'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
        <div onClick={() => handleLinkClick('home')} className="cursor-pointer flex items-center gap-3 group" data-hover>
          <img src={logo} alt="KMK Media" className="h-12 md:h-14 w-auto select-none" draggable={false} />
        </div>

        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => handleLinkClick(link.id)}
              onMouseEnter={() => getAudio().playHover()}
              className={`text-sm tracking-widest uppercase hover:opacity-90 transition-colors ${
                view === link.id ? 'font-semibold' : 'text-zinc-400'
              }`}
              style={{ color: view === link.id ? BRAND.cyan : undefined }}
            >
              {link.label}
            </button>
          ))}

          <button
            onClick={() => {
              getAudio().playClick();
              updateSettings({ ...settings, soundEnabled: !settings.soundEnabled });
              getAudio().toggle(!settings.soundEnabled);
            }}
            className="text-zinc-500 hover:text-zinc-100 transition-colors"
            title={settings.soundEnabled ? 'Mute SFX' : 'Enable SFX'}
          >
            {settings.soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          {user ? (
            <div className="flex items-center gap-4 border-l border-zinc-800 pl-4">
              <button
                onClick={() => handleLinkClick('admin')}
                className="text-xs font-mono hover:opacity-90"
                style={{ color: BRAND.magenta }}
              >
                ADMIN
              </button>
              <button onClick={logout} className="text-zinc-500 hover:text-red-500">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button onClick={() => handleLinkClick('login')} className="text-zinc-600 hover:text-zinc-300">
              <Shield size={16} />
            </button>
          )}
        </div>

        <button
          className="md:hidden text-zinc-100"
          onClick={() => {
            getAudio().playClick();
            setMobileMenuOpen(!mobileMenuOpen);
          }}
        >
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden absolute top-full left-0 w-full bg-zinc-900 border-b border-zinc-800 p-6 flex flex-col gap-4"
          >
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => {
                  handleLinkClick(link.id);
                  setMobileMenuOpen(false);
                }}
                className="text-left text-lg font-medium text-zinc-300"
              >
                {link.label}
              </button>
            ))}
            <button
              onClick={() => {
                handleLinkClick('login');
                setMobileMenuOpen(false);
              }}
              className="text-left text-sm font-mono text-zinc-500 pt-4 border-t border-zinc-800"
            >
              STAFF ACCESS
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

// Hero (StrictMode-safe countdown -> play; ends -> static; slider + restart)
const Hero = ({ onExplore, featuredVideoUrl }: { onExplore: (type: string) => void; featuredVideoUrl: string }) => {
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);

  const [heroVolume, setHeroVolume] = useState<number>(0);
  const [countdown, setCountdown] = useState<number | null>(null);

  const videoId = getYoutubeId(featuredVideoUrl);

  const intervalRef = useRef<number | null>(null);
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const lastVideoIdRef = useRef<string | null>(null);

  useEffect(() => {
    const onScroll = () => setHasScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if ((window as any).YT?.Player) return;

    const existing = document.querySelector('script[data-yt-iframe-api="true"]') as HTMLScriptElement | null;
    if (existing) return;

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    tag.dataset.ytIframeApi = 'true';
    document.head.appendChild(tag);
  }, []);

  const applyVolume = useCallback((vol: number) => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.setVolume(vol);
      if (vol <= 0) p.mute();
      else p.unMute();
    } catch {
      // no-op
    }
  }, []);

  // Countdown (every reload; once per load; StrictMode-safe)
  useEffect(() => {
    if (!videoId) return;
    if (immersiveMode || videoEnded) return;

    if (countdown === null) setCountdown(5);

    if (intervalRef.current === null && countdown !== null) {
      intervalRef.current = window.setInterval(() => {
        setCountdown((prev) => {
          if (prev === null) return null;

          if (prev <= 1) {
            if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
            intervalRef.current = null;

            setImmersiveMode(true);
            getAudio().playSwoosh();
            return null;
          }

          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [videoId, immersiveMode, videoEnded, countdown]);

  // Create / reuse player when immersiveMode + videoId are ready
  useEffect(() => {
    if (!immersiveMode) return;
    if (!videoId) return;
    if (!playerHostRef.current) return;

    const YT = (window as any).YT;
    if (!YT?.Player) return;

    if (playerRef.current && lastVideoIdRef.current === videoId) {
      try {
        setVideoEnded(false);
        applyVolume(heroVolume);
        playerRef.current.playVideo();
      } catch {
        // no-op
      }
      return;
    }

    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch {
        // no-op
      }
      playerRef.current = null;
    }

    lastVideoIdRef.current = videoId;

    playerRef.current = new YT.Player(playerHostRef.current, {
      videoId,
      playerVars: {
        autoplay: 1,
        controls: 0,
        rel: 0,
        playsinline: 1,
        loop: 0,
        modestbranding: 1,
        iv_load_policy: 3,
        fs: 0,
        disablekb: 1,
      },
      events: {
        onReady: (event: any) => {
          try {
            setVideoEnded(false);
            event.target.playVideo();
            applyVolume(heroVolume);
          } catch {
            // no-op
          }
        },
        onStateChange: (event: any) => {
          const YTState = (window as any).YT?.PlayerState;
          if (YTState && event.data === YTState.ENDED) {
            try {
              event.target.stopVideo();
            } catch {
              // no-op
            }
            setVideoEnded(true);
            setImmersiveMode(false);
          }
        },
      },
    });
  }, [immersiveMode, videoId, applyVolume, heroVolume]);

  // Live volume update without restart
  useEffect(() => {
    if (!immersiveMode) return;
    applyVolume(heroVolume);
  }, [heroVolume, immersiveMode, applyVolume]);

  const handleRestart = () => {
    if (!videoId) return;

    setCountdown(null);
    setVideoEnded(false);
    setImmersiveMode(true);

    const p = playerRef.current;
    if (!p) return;

    try {
      p.seekTo(0, true);
      p.playVideo();
      applyVolume(heroVolume);
    } catch {
      // no-op
    }
  };

  const showControls = !!videoId && (immersiveMode || videoEnded);

  return (
    <section className="relative h-screen w-full flex items-center justify-center overflow-hidden bg-black">
      {/* Immersive Video Layer */}
      <motion.div
        className="absolute inset-0 z-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: immersiveMode ? 1 : 0 }}
        transition={{ duration: 2 }}
      >
        {videoId && (
          <div className="w-full h-full object-cover scale-125">
            <div ref={playerHostRef} className="w-full h-full" />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black opacity-60" />

        {/* Bottom fade-on-scroll */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-b from-transparent to-zinc-950"
          initial={{ opacity: 0 }}
          animate={{ opacity: immersiveMode && hasScrolled ? 1 : 0 }}
          transition={{ duration: 0.6 }}
        />
      </motion.div>

      {/* Countdown behind static content */}
      <AnimatePresence>
        {countdown !== null && !immersiveMode && !videoEnded && (
          <motion.div
            key="countdown"
            initial={{ opacity: 0, scale: 0.9, filter: 'blur(8px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 1.05, filter: 'blur(6px)' }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="absolute inset-0 z-[15] flex items-center justify-center pointer-events-none select-none"
          >
            <motion.div
              aria-hidden
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.35 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              style={{
                background: `radial-gradient(circle at 50% 50%, ${BRAND.cyan}22 0%, ${BRAND.magenta}14 35%, transparent 70%)`,
              }}
            />

            <div
              aria-hidden
              className="absolute inset-0 opacity-[0.18]"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(to bottom, rgba(255,255,255,0.08), rgba(255,255,255,0.08) 1px, rgba(0,0,0,0) 6px, rgba(0,0,0,0) 12px)',
                mixBlendMode: 'overlay',
              }}
            />

            <motion.div
              className="relative font-black leading-none tracking-tighter text-transparent bg-clip-text"
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                fontSize: 'min(50vw, 640px)',
                backgroundImage: `linear-gradient(90deg, ${BRAND.cyan}, ${BRAND.magenta}, ${BRAND.orange})`,
                opacity: 0.5,
                textShadow: `
                  0 0 20px rgba(0,229,255,0.25),
                  0 0 60px rgba(255,79,216,0.18),
                  0 0 120px rgba(255,122,24,0.12)
                `,
                filter: 'drop-shadow(0 0 18px rgba(0,229,255,0.22))',
              }}
            >
              {countdown}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="absolute top-24 right-6 z-30 pointer-events-auto flex flex-col gap-2"
          >
            {immersiveMode && (
              <div
                className="bg-black/40 backdrop-blur-md border border-white/10 text-zinc-100 px-4 py-3 hover:bg-black/60 transition-colors"
                data-hover
              >
                <div className="flex items-center gap-3">
                  {heroVolume <= 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={heroVolume}
                    onChange={(e) => setHeroVolume(Number(e.target.value))}
                    onMouseDown={() => getAudio().playClick()}
                    className="w-32 md:w-40 accent-white"
                    aria-label="Hero video volume"
                  />
                  <span className="text-[10px] font-mono text-zinc-300 w-8 text-right">{heroVolume}</span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                getAudio().playClick();
                handleRestart();
              }}
              onMouseEnter={() => getAudio().playHover()}
              className="bg-black/30 backdrop-blur-md border border-white/10 text-zinc-100 px-4 py-2 text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-black/50 transition-colors"
              title="Restart video"
              data-hover
            >
              <ArrowUp size={14} />
              Restart
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Static Content Layer */}
      <motion.div
        className="absolute inset-0 z-10 bg-gradient-to-br from-zinc-950 via-zinc-900 to-slate-900"
        animate={{ opacity: immersiveMode ? 0 : 1 }}
        transition={{ duration: 1.5 }}
      />

      {/* Glows */}
      <motion.div animate={{ opacity: immersiveMode ? 0 : 1 }} className="absolute inset-0 z-10 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-[120px]" style={{ backgroundColor: `${BRAND.cyan}25` }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-[120px]" style={{ backgroundColor: `${BRAND.magenta}1a` }} />
      </motion.div>

      {/* Hero Content */}
      <motion.div
        className="relative z-20 text-center px-4 max-w-4xl"
        animate={{ opacity: immersiveMode ? 0 : 1, y: immersiveMode ? 50 : 0 }}
        transition={{ duration: 1 }}
      >
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: 'easeOut' }}>
          <h2 className="tracking-[0.3em] text-sm font-bold mb-4 uppercase" style={{ color: BRAND.cyan }}>
            Est. 2022
          </h2>

          <h1 className="text-5xl md:text-8xl font-black text-white tracking-tighter mb-6 leading-tight">
            STORIES FORGED <br />
            <span
              className="text-transparent bg-clip-text"
              style={{ backgroundImage: `linear-gradient(90deg, ${BRAND.cyan}, ${BRAND.magenta}, ${BRAND.orange})` }}
            >
              IN VIRTUALITY
            </span>
          </h1>

          <p className="text-zinc-400 text-lg md:text-xl max-w-2xl mx-auto mb-10 font-light leading-relaxed">
            Premium machinima production and high-octane video editing. Blurring the line between game engine and cinema.
          </p>

          <div className="flex flex-col md:flex-row gap-4 justify-center">
            <button
              onClick={() => {
                getAudio().playClick();
                onExplore('machinimas');
              }}
              onMouseEnter={() => getAudio().playHover()}
              className="text-black px-8 py-4 font-bold tracking-widest transition-all duration-300 flex items-center justify-center gap-2 group"
              style={{ backgroundImage: `linear-gradient(90deg, ${BRAND.cyan}, ${BRAND.magenta}, ${BRAND.orange})` }}
            >
              <Film size={20} />
              WATCH FILMS
              <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={() => {
                getAudio().playClick();
                onExplore('edits');
              }}
              onMouseEnter={() => getAudio().playHover()}
              className="bg-transparent border border-zinc-700 text-zinc-300 px-8 py-4 font-bold tracking-widest hover:border-zinc-100 hover:text-white transition-all duration-300 flex items-center justify-center gap-2"
            >
              <MonitorPlay size={20} />
              EDITING PORTFOLIO
            </button>
          </div>
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        animate={{ opacity: immersiveMode ? 0 : 1 }}
        transition={{ delay: 1.5, duration: 1 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-zinc-600 z-20"
      >
        <span className="text-[10px] uppercase tracking-widest">Scroll</span>
        <div className="w-[1px] h-12 bg-gradient-to-b from-zinc-600 to-transparent" />
      </motion.div>
    </section>
  );
};

// Project Card
const ProjectCard = ({ project, onClick }: { project: Project; onClick: () => void }) => {
  const fallbackCandidates = useMemo(() => getYoutubeThumbnailCandidates(project.youtubeUrl), [project.youtubeUrl]);
  const resolved = useMemo(() => resolveProjectThumbnail(project), [project]);

  return (
    <motion.div
      layoutId={`card-${project.id}`}
      onClick={() => {
        getAudio().playClick();
        onClick();
      }}
      onMouseEnter={() => getAudio().playHover()}
      whileHover={{ y: -5 }}
      className="group relative cursor-pointer bg-zinc-900 overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-colors"
      data-hover
    >
      <div className="aspect-video w-full overflow-hidden relative">
        <img
          src={resolved}
          alt={project.title}
          loading="lazy"
          onError={(e) => {
            const img = e.currentTarget;
            const hq = fallbackCandidates[1];
            if (hq && img.src !== hq) img.src = hq;
          }}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-80 group-hover:opacity-100"
        />
        <div className="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-colors duration-300" />

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20">
            <Play fill="white" className="text-white ml-1" />
          </div>
        </div>

        <div className="absolute top-3 left-3 flex gap-2">
          <span className="bg-black/60 backdrop-blur-sm text-zinc-200 text-xs px-2 py-1 uppercase tracking-wider font-semibold border border-white/10">
            {project.type}
          </span>
          {project.seriesName && (
            <span
              className="backdrop-blur-sm text-xs px-2 py-1 uppercase tracking-wider font-semibold border"
              style={{ backgroundColor: `${BRAND.cyan}22`, borderColor: `${BRAND.cyan}55`, color: BRAND.cyan }}
            >
              {project.seriesName}
            </span>
          )}
          {!project.published && (
            <span className="bg-yellow-900/40 text-yellow-200 text-xs px-2 py-1 uppercase tracking-wider font-semibold border border-yellow-500/20">
              draft
            </span>
          )}
        </div>
      </div>

      <div className="p-5">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-xl font-bold text-zinc-100 group-hover:opacity-90 transition-colors line-clamp-1">{project.title}</h3>
          <span className="text-xs text-zinc-500 font-mono">{project.year}</span>
        </div>
        <p className="text-zinc-400 text-sm line-clamp-2 leading-relaxed mb-4">{project.shortDescription}</p>

        <div className="flex flex-wrap gap-2">
          {project.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[10px] text-zinc-500 uppercase tracking-wider border border-zinc-800 px-2 py-1 rounded-sm">
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

// Project Detail
const ProjectDetail = ({ project, onBack }: { project: Project; onBack: () => void }) => {
  const videoId = getYoutubeId(project.youtubeUrl);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pt-24 min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-6">
        <button
          onClick={() => {
            getAudio().playClick();
            onBack();
          }}
          onMouseEnter={() => getAudio().playHover()}
          className="mb-6 flex items-center gap-2 text-zinc-400 hover:text-white transition-colors uppercase text-xs tracking-widest"
        >
          <ChevronRight className="rotate-180" size={14} /> Back to List
        </button>

        <div className="w-full aspect-video bg-black rounded-sm overflow-hidden border border-zinc-800 shadow-2xl mb-8 relative">
          {videoId ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`}
              title={project.title}
              className="w-full h-full"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-500">Video URL unavailable</div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">{project.title}</h1>
            <div className="flex items-center gap-4 text-zinc-400 mb-6 font-mono text-sm">
              <span>{project.year}</span>
              <span>•</span>
              <span className="uppercase">{project.type}</span>
              {project.seriesName && (
                <>
                  <span>•</span>
                  <span style={{ color: BRAND.cyan }}>
                    {project.seriesName} Ep.{project.episode}
                  </span>
                </>
              )}
              {!project.published && (
                <>
                  <span>•</span>
                  <span className="text-yellow-300">DRAFT</span>
                </>
              )}
            </div>

            <div className="prose prose-invert prose-lg max-w-none text-zinc-300">
              <p>{project.description}</p>
            </div>
          </div>

          <div className="bg-zinc-900/50 p-6 border border-zinc-800 h-fit">
            <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-4">Project Details</h3>

            <div className="space-y-4">
              <div>
                <span className="block text-xs text-zinc-600 uppercase mb-1">Tags</span>
                <div className="flex flex-wrap gap-2">
                  {project.tags.map((tag) => (
                    <span key={tag} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded-sm border border-zinc-700">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {project.client && (
                <div>
                  <span className="block text-xs text-zinc-600 uppercase mb-1">Client</span>
                  <span className="text-zinc-200">{project.client}</span>
                </div>
              )}

              <div className="pt-6 border-t border-zinc-800 mt-6">
                <button
                  onMouseEnter={() => getAudio().playHover()}
                  className="w-full text-black py-3 font-bold text-sm tracking-widest transition-colors"
                  style={{ backgroundImage: `linear-gradient(90deg, ${BRAND.cyan}, ${BRAND.magenta}, ${BRAND.orange})` }}
                >
                  SHARE PROJECT
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// Admin Dashboard (Supabase-backed)
const AdminDashboard = ({
  projects,
  refreshProjects,
  user,
  settings,
  updateFeaturedVideoUrl,
  logout,
}: {
  projects: Project[];
  refreshProjects: () => Promise<void>;
  user: User;
  settings: SiteSettings;
  updateFeaturedVideoUrl: (url: string) => Promise<void>;
  logout: () => void;
}) => {
  const [activeTab, setActiveTab] = useState<'projects' | 'settings'>('projects');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [formState, setFormState] = useState<Partial<Project>>({
    type: 'machinima',
    tags: [],
    published: true,
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const ytThumbFallback = (formState.youtubeUrl ? getYoutubeThumbnailCandidates(formState.youtubeUrl) : [])[0] || '';

      const payload = {
        title: formState.title ?? '',
        slug: (formState.slug ?? formState.title ?? 'untitled')
          .toString()
          .toLowerCase()
          .trim()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, ''),
        type: (formState.type ?? 'machinima') as ProjectType,
        thumbnail: (formState.thumbnail?.trim() || ytThumbFallback) ?? '',
        youtube_url: formState.youtubeUrl ?? '',
        description: formState.description ?? '',
        short_description: formState.shortDescription ?? '',
        tags: formState.tags ?? [],
        year: formState.year ?? '',
        client: formState.client ?? null,
        series_name: formState.seriesName ?? null,
        episode: formState.episode ?? null,
        published: formState.published ?? true,
      };

      if (editingId === 'new') {
        const { error } = await supabase.from('projects').insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('projects').update(payload).eq('id', editingId);
        if (error) throw error;
      }

      getAudio().playClick();
      setEditingId(null);
      setFormState({ type: 'machinima', tags: [], published: true });
      await refreshProjects();
    } catch (err: any) {
      // eslint-disable-next-line no-alert
      alert(err?.message ?? 'Failed to save project');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure? This cannot be undone.')) return;

    try {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) throw error;
      getAudio().playClick();
      await refreshProjects();
    } catch (err: any) {
      // eslint-disable-next-line no-alert
      alert(err?.message ?? 'Failed to delete project');
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setFormState((prev) => ({ ...prev, thumbnail: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const videoIdCheck = settings.featuredVideoUrl ? getYoutubeId(settings.featuredVideoUrl) : null;

  if (editingId) {
    return (
      <div className="pt-32 pb-20 max-w-3xl mx-auto px-6">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-white">{editingId === 'new' ? 'Create Project' : 'Edit Project'}</h2>
          <button onClick={() => setEditingId(null)} className="text-zinc-500 hover:text-white">
            Cancel
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs uppercase text-zinc-500 mb-2">Title</label>
              <input
                required
                className="w-full bg-zinc-900 border border-zinc-700 p-3 text-white outline-none"
                value={formState.title || ''}
                onChange={(e) => setFormState({ ...formState, title: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs uppercase text-zinc-500 mb-2">Type</label>
              <select
                className="w-full bg-zinc-900 border border-zinc-700 p-3 text-white outline-none"
                value={formState.type}
                onChange={(e) => setFormState({ ...formState, type: e.target.value as ProjectType })}
              >
                <option value="machinima">Machinima</option>
                <option value="edit">Video Edit</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase text-zinc-500 mb-2">YouTube URL</label>
            <div className="relative">
              <Youtube className="absolute left-3 top-3 text-zinc-600" size={18} />
              <input
                required
                placeholder="https://youtube.com/watch?v=..."
                className="w-full bg-zinc-900 border border-zinc-700 p-3 pl-10 text-white outline-none font-mono text-sm"
                value={formState.youtubeUrl || ''}
                onChange={(e) => setFormState({ ...formState, youtubeUrl: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase text-zinc-500 mb-2">Thumbnail (Optional)</label>
            <p className="text-zinc-600 text-xs mb-3">
              If you leave this empty, we’ll automatically use the YouTube thumbnail.
            </p>
            <div className="flex gap-4 items-center">
              {(formState.thumbnail || formState.youtubeUrl) && (
                <img
                  src={
                    formState.thumbnail?.trim()
                      ? formState.thumbnail.trim()
                      : (getYoutubeThumbnailCandidates(formState.youtubeUrl || '')[0] || '')
                  }
                  alt="Preview"
                  className="h-20 w-32 object-cover border border-zinc-700"
                  onError={(e) => {
                    const img = e.currentTarget;
                    const cands = getYoutubeThumbnailCandidates(formState.youtubeUrl || '');
                    const hq = cands[1];
                    if (hq && img.src !== hq) img.src = hq;
                  }}
                />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-none file:border-0 file:text-sm file:font-semibold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase text-zinc-500 mb-2">Short Description (Card)</label>
            <input
              className="w-full bg-zinc-900 border border-zinc-700 p-3 text-white outline-none"
              value={formState.shortDescription || ''}
              onChange={(e) => setFormState({ ...formState, shortDescription: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs uppercase text-zinc-500 mb-2">Full Description</label>
            <textarea
              rows={5}
              className="w-full bg-zinc-900 border border-zinc-700 p-3 text-white outline-none"
              value={formState.description || ''}
              onChange={(e) => setFormState({ ...formState, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div>
              <label className="block text-xs uppercase text-zinc-500 mb-2">Year</label>
              <input
                className="w-full bg-zinc-900 border border-zinc-700 p-3 text-white outline-none"
                value={formState.year || ''}
                onChange={(e) => setFormState({ ...formState, year: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs uppercase text-zinc-500 mb-2">Series Name (Opt)</label>
              <input
                className="w-full bg-zinc-900 border border-zinc-700 p-3 text-white outline-none"
                value={formState.seriesName || ''}
                onChange={(e) => setFormState({ ...formState, seriesName: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs uppercase text-zinc-500 mb-2">Tags (comma sep)</label>
              <input
                className="w-full bg-zinc-900 border border-zinc-700 p-3 text-white outline-none"
                value={formState.tags?.join(', ') || ''}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    tags: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs uppercase text-zinc-500 mb-2">Client (Opt)</label>
              <input
                className="w-full bg-zinc-900 border border-zinc-700 p-3 text-white outline-none"
                value={formState.client || ''}
                onChange={(e) => setFormState({ ...formState, client: e.target.value })}
              />
            </div>

            <div className="flex items-center gap-3 pt-8">
              <input
                id="published"
                type="checkbox"
                checked={!!formState.published}
                onChange={(e) => setFormState({ ...formState, published: e.target.checked })}
              />
              <label htmlFor="published" className="text-zinc-300 text-sm">
                Published (public)
              </label>
            </div>
          </div>

          <div className="pt-6 border-t border-zinc-800 flex justify-end gap-4">
            <button
              type="submit"
              disabled={saving}
              className="text-black px-8 py-3 font-bold tracking-widest flex items-center gap-2 disabled:opacity-60"
              style={{ backgroundImage: `linear-gradient(90deg, ${BRAND.cyan}, ${BRAND.magenta}, ${BRAND.orange})` }}
            >
              <Save size={18} /> {saving ? 'SAVING...' : 'SAVE PROJECT'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="pt-32 pb-20 max-w-7xl mx-auto px-6">
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
          <p className="text-zinc-500 text-sm">Welcome back, {user.name}.</p>
        </div>

        {activeTab === 'projects' && (
          <button
            onClick={() => {
              setFormState({ type: 'machinima', tags: [], published: true });
              setEditingId('new');
              getAudio().playClick();
            }}
            className="text-black px-6 py-3 font-bold tracking-widest transition-colors flex items-center gap-2"
            style={{ backgroundImage: `linear-gradient(90deg, ${BRAND.cyan}, ${BRAND.magenta}, ${BRAND.orange})` }}
          >
            <Plus size={18} /> NEW PROJECT
          </button>
        )}
      </div>

      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-6 border-b border-zinc-800">
          <button
            onClick={() => {
              setActiveTab('projects');
              getAudio().playClick();
            }}
            className={`pb-4 text-sm font-bold tracking-widest uppercase transition-colors ${activeTab === 'projects' ? 'border-b-2' : 'text-zinc-500 hover:text-zinc-300'}`}
            style={{
              color: activeTab === 'projects' ? BRAND.cyan : undefined,
              borderColor: activeTab === 'projects' ? BRAND.cyan : 'transparent',
            }}
          >
            Projects
          </button>

          <button
            onClick={() => {
              setActiveTab('settings');
              getAudio().playClick();
            }}
            className={`pb-4 text-sm font-bold tracking-widest uppercase transition-colors ${activeTab === 'settings' ? 'border-b-2' : 'text-zinc-500 hover:text-zinc-300'}`}
            style={{
              color: activeTab === 'settings' ? BRAND.cyan : undefined,
              borderColor: activeTab === 'settings' ? BRAND.cyan : 'transparent',
            }}
          >
            Site Settings
          </button>
        </div>

        <button onClick={logout} className="text-zinc-400 hover:text-red-400 text-xs uppercase tracking-widest flex items-center gap-2" data-hover>
          <LogOut size={14} /> Sign out
        </button>
      </div>

      {activeTab === 'projects' ? (
        <div className="bg-zinc-900 border border-zinc-800 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-black/40 text-xs uppercase text-zinc-500 font-medium">
              <tr>
                <th className="p-4">Project</th>
                <th className="p-4">Type</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-300 text-sm">
              {projects.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-800/50 transition-colors">
                  <td className="p-4 font-medium text-white">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-6 bg-zinc-800 overflow-hidden">
                        <img
                          src={resolveProjectThumbnail(p)}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const img = e.currentTarget;
                            const cands = getYoutubeThumbnailCandidates(p.youtubeUrl);
                            const hq = cands[1];
                            if (hq && img.src !== hq) img.src = hq;
                          }}
                        />
                      </div>
                      {p.title}
                    </div>
                  </td>
                  <td className="p-4 uppercase text-xs tracking-wider">{p.type}</td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-1 text-[10px] uppercase border rounded-sm ${
                        p.published ? 'border-emerald-900 text-emerald-500 bg-emerald-900/10' : 'border-yellow-900 text-yellow-500 bg-yellow-900/10'
                      }`}
                    >
                      {p.published ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td className="p-4 text-right flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setFormState(p);
                        setEditingId(p.id);
                        getAudio().playClick();
                      }}
                      className="text-zinc-500 hover:opacity-90"
                      style={{ color: BRAND.cyan }}
                      title="Edit"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => {
                        handleDelete(p.id);
                        getAudio().playClick();
                      }}
                      className="text-zinc-500 hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="max-w-xl">
          <div className="bg-zinc-900 border border-zinc-800 p-8">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Settings size={20} /> General Settings
            </h3>

            <div className="space-y-6">
              <div>
                <label className="block text-zinc-500 text-xs uppercase mb-2">Featured Hero Video URL</label>
                <p className="text-zinc-600 text-xs mb-3">
                  If set, the homepage Hero shows a 5 second countdown and then fades into the featured video.
                </p>

                <div className="relative">
                  <Youtube className="absolute left-3 top-3 text-zinc-600" size={18} />
                  <input
                    className="w-full bg-zinc-950 border border-zinc-700 p-3 pl-10 text-white outline-none font-mono text-sm"
                    placeholder="https://youtube.com/watch?v=..."
                    value={settings.featuredVideoUrl}
                    onChange={(e) => updateFeaturedVideoUrl(e.target.value)}
                  />
                  <div className="absolute right-3 top-3">
                    {videoIdCheck ? (
                      <div className="flex items-center gap-1 text-emerald-500 text-xs">
                        <CheckCircle2 size={14} /> ID: {videoIdCheck}
                      </div>
                    ) : settings.featuredVideoUrl.length > 5 ? (
                      <div className="flex items-center gap-1 text-yellow-500 text-xs">
                        <AlertCircle size={14} /> Invalid
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-zinc-800">
                <p className="text-emerald-500 text-xs flex items-center gap-2">
                  <Save size={14} /> Settings save automatically to Supabase.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- MAIN APP ---

export default function App() {
  const [view, setView] = useState('home');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [settings, setSettings] = useState<SiteSettings>({
    featuredVideoUrl: '',
    soundEnabled: true,
    soundVolume: 0.5,
  });

  const [, setSession] = useState<Session | null>(null);
  const [sbUser, setSbUser] = useState<SupabaseUser | null>(null);

  const user: User | null = useMemo(() => {
    if (!sbUser?.email) return null;
    const isAdminEmail = ADMIN_EMAIL ? sbUser.email.toLowerCase() === ADMIN_EMAIL : false;
    if (!isAdminEmail) return null;
    return { email: sbUser.email, name: 'Director', role: 'admin' };
  }, [sbUser]);

  const isAdmin = !!user;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Local SFX settings
  useEffect(() => {
    const savedSettings = localStorage.getItem('kmk_settings_local');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings) as Partial<SiteSettings>;
      setSettings((prev) => ({
        ...prev,
        soundEnabled: parsed.soundEnabled ?? prev.soundEnabled,
        soundVolume: parsed.soundVolume ?? prev.soundVolume,
      }));
      getAudio().toggle(parsed.soundEnabled ?? true);
      getAudio().updateVolume(parsed.soundVolume ?? 0.5);
    } else {
      getAudio().toggle(true);
      getAudio().updateVolume(0.5);
    }
  }, []);

  const updateLocalSfxSettings = (newSettings: SiteSettings) => {
    setSettings(newSettings);
    localStorage.setItem(
      'kmk_settings_local',
      JSON.stringify({ soundEnabled: newSettings.soundEnabled, soundVolume: newSettings.soundVolume }),
    );
  };

  // Auth bootstrap + listener
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      setSbUser(data.session?.user ?? null);
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setSbUser(newSession?.user ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const mapProjectRow = (row: any): Project => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    type: row.type,
    thumbnail: row.thumbnail ?? '',
    youtubeUrl: row.youtube_url,
    description: row.description,
    shortDescription: row.short_description,
    tags: row.tags ?? [],
    year: row.year,
    client: row.client ?? undefined,
    seriesName: row.series_name ?? undefined,
    episode: row.episode ?? undefined,
    published: !!row.published,
  });

  const refreshProjects = useCallback(async () => {
    const query = supabase.from('projects').select('*').order('created_at', { ascending: false });
    const { data, error } = isAdmin ? await query : await query.eq('published', true);

    if (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to load projects', error.message);
      setProjects([]);
      return;
    }
    setProjects((data ?? []).map(mapProjectRow));
  }, [isAdmin]);

  const refreshSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from('site_settings')
      .select('*')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to load settings', error.message);
      return;
    }
    const featured = data?.featured_video_url ?? '';
    setSettings((prev) => ({ ...prev, featuredVideoUrl: featured }));
  }, []);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const updateFeaturedVideoUrl = useCallback(async (url: string) => {
    setSettings((prev) => ({ ...prev, featuredVideoUrl: url }));
    const { error } = await supabase.from('site_settings').update({ featured_video_url: url }).eq('id', 1);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to update site settings', error.message);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setLoginError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const signedEmail = data.user?.email?.toLowerCase();
      if (!signedEmail || (ADMIN_EMAIL && signedEmail !== ADMIN_EMAIL)) {
        await supabase.auth.signOut();
        throw new Error('This account is not authorized for admin access.');
      }

      getAudio().playClick();
      setView('admin');
    } catch (err: any) {
      setLoginError(err?.message ?? 'Login failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    getAudio().playClick();
    setView('home');
  };

  // Sound & Scroll Effects
  useEffect(() => {
    getAudio().playSwoosh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [view]);

  const handleProjectClick = (project: Project) => {
    setSelectedProject(project);
    setView('detail');
  };

  // Views Render
  const renderContent = () => {
    if (view === 'home') {
      return (
        <>
          <Hero onExplore={(type) => setView(type)} featuredVideoUrl={settings.featuredVideoUrl} />

          {/* About blurb */}
          <section className="bg-zinc-950 px-6 pt-10 pb-8">
            <div className="max-w-7xl mx-auto">
              <div className="bg-zinc-900/50 border border-zinc-800 p-8">
                <div
                  className="h-[2px] w-full mb-6"
                  style={{ backgroundImage: `linear-gradient(90deg, ${BRAND.cyan}, ${BRAND.magenta}, ${BRAND.orange})` }}
                />
                <h3 className="text-white font-bold tracking-widest uppercase text-sm mb-3">About</h3>
                <p className="text-zinc-400 leading-relaxed max-w-4xl">
                  KMK Media is a channel by <span className="text-white font-semibold">KallMeKyle</span>. I create stunning
                  in-game cinematic videos as well as video editing — based in the UK. I’ve been doing this for about a year,
                  primarily in GTA V, but I can work with any game. If you’ve got an idea, let’s chat and bring it to life.
                </p>

                <div className="mt-6">
                  <a
                    href="https://dsc.gg/kallmediscord"
                    target="_blank"
                    rel="noreferrer"
                    onMouseEnter={() => getAudio().playHover()}
                    onMouseDown={() => getAudio().playClick()}
                    className="inline-flex text-black font-bold tracking-widest px-6 py-3 transition-all"
                    style={{ backgroundImage: `linear-gradient(90deg, ${BRAND.cyan}, ${BRAND.magenta}, ${BRAND.orange})` }}
                    data-hover
                  >
                    JOIN DISCORD
                  </a>
                </div>
              </div>
            </div>
          </section>

          <section className="py-24 bg-zinc-950 px-6">
            <div className="max-w-7xl mx-auto">
              <h3 className="text-zinc-500 uppercase tracking-widest text-sm mb-8 font-bold">Latest Releases</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(isAdmin ? projects : projects.filter((p) => p.published))
                  .slice(0, 3)
                  .map((p) => (
                    <ProjectCard key={p.id} project={p} onClick={() => handleProjectClick(p)} />
                  ))}
              </div>
            </div>
          </section>
        </>
      );
    }

    if (view === 'machinimas' || view === 'edits') {
      const desiredType = view === 'machinimas' ? 'machinima' : 'edit';
      const filtered = (isAdmin ? projects : projects.filter((p) => p.published)).filter((p) => p.type === desiredType);

      return (
        <div className="pt-32 pb-24 px-6 min-h-screen">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-4xl md:text-6xl font-black text-white mb-4 uppercase tracking-tighter">{view}</h1>
            <p className="text-zinc-400 mb-12 max-w-xl">
              {view === 'machinimas'
                ? 'Immersive narratives crafted within virtual worlds. Cinematic storytelling meets game engine technology.'
                : 'High-impact video editing for gaming, music, and commercial clients. Precision cuts and visual effects.'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filtered.map((p) => (
                <ProjectCard key={p.id} project={p} onClick={() => handleProjectClick(p)} />
              ))}
            </div>

            {filtered.length === 0 && (
              <div className="text-zinc-600 py-20 text-center uppercase tracking-widest">No projects found in this category.</div>
            )}
          </div>
        </div>
      );
    }

    if (view === 'detail' && selectedProject) {
      return <ProjectDetail project={selectedProject} onBack={() => setView('home')} />;
    }

    if (view === 'admin') {
      if (!isAdmin) {
        setView('login');
        return null;
      }

      return (
        <AdminDashboard
          projects={projects}
          refreshProjects={refreshProjects}
          user={user!}
          settings={settings}
          updateFeaturedVideoUrl={updateFeaturedVideoUrl}
          logout={logout}
        />
      );
    }

    if (view === 'login') {
      return (
        <div className="h-screen flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 p-8">
            <h2 className="text-2xl font-bold text-white mb-6 tracking-tight flex items-center gap-2">
              <Shield size={24} style={{ color: BRAND.cyan }} /> RESTRICTED ACCESS
            </h2>

            <form onSubmit={handleLogin} className="space-y-4">
              {loginError && <div className="text-red-500 text-sm bg-red-900/10 p-3 border border-red-900/50">{loginError}</div>}

              <div>
                <label className="block text-zinc-500 text-xs uppercase mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 p-3 text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-500 text-xs uppercase mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 p-3 text-white outline-none"
                />
              </div>

              <button
                disabled={authLoading}
                className="w-full text-black font-bold tracking-widest py-4 mt-4 transition-all disabled:opacity-60"
                style={{ backgroundImage: `linear-gradient(90deg, ${BRAND.cyan}, ${BRAND.magenta}, ${BRAND.orange})` }}
                data-hover
              >
                {authLoading ? 'AUTHENTICATING…' : 'AUTHENTICATE'}
              </button>

              <div className="text-center mt-4">
                <button type="button" onClick={() => setView('home')} className="text-zinc-600 text-xs hover:text-zinc-400">
                  RETURN TO SITE
                </button>
              </div>
            </form>

            <div className="mt-8 text-[10px] text-zinc-700 font-mono text-center">ADMIN ONLY — Supabase Auth</div>
          </div>
        </div>
      );
    }

    if (view === 'about') {
      return (
        <div className="pt-32 pb-24 px-6 min-h-screen max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h1 className="text-5xl md:text-6xl font-black text-white mb-6 uppercase tracking-tighter">About</h1>
            <p className="text-zinc-400 max-w-3xl mx-auto leading-relaxed">
              KMK Media is a digital production house focused on cinematic machinima and high-impact editing. We blend game engines,
              film language, and tight post-production to create stories that feel premium — not “gameplay”.
            </p>
          </div>

          <div
            className="h-[2px] w-full mb-14"
            style={{ backgroundImage: `linear-gradient(90deg, ${BRAND.cyan}, ${BRAND.magenta}, ${BRAND.orange})` }}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2 bg-zinc-900/50 border border-zinc-800 p-8">
              <h2 className="text-2xl font-bold text-white mb-4">The Story</h2>
              <div className="prose prose-invert max-w-none text-zinc-300">
                <p>
                  Founded in 2022, KMK Media was built around one obsession: making virtual worlds feel like cinema. That means
                  intentional framing, controlled pacing, sound design that lands, and edits that respect the viewer.
                </p>
                <p>
                  Whether it’s a machinima episode or a montage for a client, the workflow is the same: plan it like film, shoot it with
                  purpose, then finish it with polish.
                </p>
              </div>

              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-zinc-800 bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Focus</div>
                  <div className="text-white font-bold">Machinima + Edits</div>
                  <div className="text-zinc-400 text-sm mt-1">Narrative + performance-driven cuts.</div>
                </div>
                <div className="border border-zinc-800 bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Style</div>
                  <div className="text-white font-bold">Cinematic</div>
                  <div className="text-zinc-400 text-sm mt-1">Lighting, pacing, sound, texture.</div>
                </div>
                <div className="border border-zinc-800 bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Deliverables</div>
                  <div className="text-white font-bold">Fast + Clean</div>
                  <div className="text-zinc-400 text-sm mt-1">Social-first formats included.</div>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 p-8 h-fit">
              <h2 className="text-lg font-bold text-white mb-5 uppercase tracking-widest">What You Get</h2>

              <ul className="space-y-4 text-zinc-300">
                <li className="flex items-start gap-3">
                  <span className="mt-2 w-2 h-2 rounded-full" style={{ backgroundColor: BRAND.cyan }} />
                  <div>
                    <div className="font-semibold text-white">Clear direction</div>
                    <div className="text-sm text-zinc-400">We align on tone, pacing, and references up front.</div>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 w-2 h-2 rounded-full" style={{ backgroundColor: BRAND.magenta }} />
                  <div>
                    <div className="font-semibold text-white">Professional finish</div>
                    <div className="text-sm text-zinc-400">Color, sound, motion polish, and clean exports.</div>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 w-2 h-2 rounded-full" style={{ backgroundColor: BRAND.orange }} />
                  <div>
                    <div className="font-semibold text-white">Multiple formats</div>
                    <div className="text-sm text-zinc-400">16:9, 9:16, 1:1 — whatever you need.</div>
                  </div>
                </li>
              </ul>

              <div className="mt-8 pt-6 border-t border-zinc-800">
                <a
                  href="https://dsc.gg/kallmediscord"
                  target="_blank"
                  rel="noreferrer"
                  onMouseEnter={() => getAudio().playHover()}
                  onMouseDown={() => getAudio().playClick()}
                  className="w-full inline-flex justify-center text-black font-bold tracking-widest py-4 transition-all"
                  style={{ backgroundImage: `linear-gradient(90deg, ${BRAND.cyan}, ${BRAND.magenta}, ${BRAND.orange})` }}
                  data-hover
                >
                  JOIN DISCORD TO START
                </a>

                <p className="text-[11px] text-zinc-600 mt-3 text-center">Join the server and message your idea + timeline to begin.</p>
              </div>
            </div>
          </div>

          <div className="mt-14">
            <h2 className="text-2xl font-bold text-white mb-6">Services</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-zinc-900/50 border border-zinc-800 p-6">
                <h3 className="font-bold text-white mb-2">Machinima Production</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Cinematic scenes captured in-engine with intentional camera language, blocking, and atmosphere.
                </p>
              </div>
              <div className="bg-zinc-900/50 border border-zinc-800 p-6">
                <h3 className="font-bold text-white mb-2">High-Impact Editing</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Rhythm-driven cuts, motion accents, sound design, and finishing that elevates the moment.
                </p>
              </div>
              <div className="bg-zinc-900/50 border border-zinc-800 p-6">
                <h3 className="font-bold text-white mb-2">Packaging</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">Platform-ready exports and versions for Shorts/Reels/TikTok.</p>
              </div>
            </div>
          </div>

          <div className="mt-14">
            <h2 className="text-2xl font-bold text-white mb-6">Process</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { step: '01', title: 'Discovery', text: 'Goals, references, scope, deliverables.' },
                { step: '02', title: 'Plan', text: 'Structure, pacing, shot list / edit map.' },
                { step: '03', title: 'Production', text: 'Capture/edit, sound, color, motion polish.' },
                { step: '04', title: 'Delivery', text: 'Final exports + versions for platforms.' },
              ].map((s) => (
                <div key={s.step} className="bg-zinc-900/50 border border-zinc-800 p-6">
                  <div className="text-xs font-mono text-zinc-500 mb-2">{s.step}</div>
                  <div className="text-white font-bold mb-2">{s.title}</div>
                  <div className="text-zinc-400 text-sm">{s.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Contact (Discord CTA)
    return (
      <div className="pt-32 pb-24 px-6 min-h-screen max-w-4xl mx-auto flex flex-col justify-center items-center text-center">
        <h1 className="text-5xl font-black text-white mb-6 uppercase tracking-tighter">Start a Project</h1>

        <p className="text-zinc-400 mb-10 max-w-2xl">Join my Discord to start a conversation about your project.</p>

        <a
          href="https://dsc.gg/kallmediscord"
          target="_blank"
          rel="noreferrer"
          onMouseEnter={() => getAudio().playHover()}
          onMouseDown={() => getAudio().playClick()}
          className="text-black font-bold tracking-widest px-10 py-4 transition-all"
          style={{ backgroundImage: `linear-gradient(90deg, ${BRAND.cyan}, ${BRAND.magenta}, ${BRAND.orange})` }}
          data-hover
        >
          JOIN DISCORD
        </a>
      </div>
    );
  };

  return (
    <div className="bg-zinc-950 min-h-screen text-zinc-100 font-sans selection:bg-blue-500 selection:text-white overflow-x-hidden cursor-none">
      <CustomCursor />
      <FilmGrain />

      <Navbar
        view={view}
        setView={setView}
        user={user}
        settings={settings}
        updateSettings={(s) => {
          updateLocalSfxSettings(s);
          getAudio().toggle(s.soundEnabled);
          getAudio().updateVolume(s.soundVolume);
        }}
        logout={logout}
      />

      <main className="relative z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="relative z-10 bg-zinc-900 border-t border-zinc-800 py-12 text-center cursor-default">
        <div className="text-zinc-500 text-sm mb-4">© 2024 KMK MEDIA. All Rights Reserved.</div>
      </footer>
    </div>
  );
}
