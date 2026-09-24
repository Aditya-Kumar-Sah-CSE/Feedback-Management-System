'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Download, X, Share, PlusSquare, School } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'fms_global_pwa_install_dismissed_at';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const RESERVED_PREFIXES = [
  'admin',
  'api',
  'auth',
  'offline',
  'favicon.ico',
  'privacy-policy',
  'terms-of-service',
  'google63a0b427ff26a6fc.html',
];

export function PwaInstallPrompt() {
  const pathname = usePathname();
  const segments = (pathname || '').split('/').filter(Boolean);
  const firstSegment = segments[0]?.toLowerCase();
  const isTenantRoute = Boolean(firstSegment && !RESERVED_PREFIXES.includes(firstSegment));
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  useEffect(() => {
    // Check if already running standalone PWA
    const checkStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      document.referrer.includes('android-app://');

    if (checkStandalone) {
      setIsStandalone(true);
      return;
    }

    // Check dismissal cooldown
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const diff = Date.now() - parseInt(dismissedAt, 10);
      if (diff < DISMISS_COOLDOWN_MS) {
        return;
      }
    }

    // Detect iOS Safari
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/crios|fxios|edgios|chrome/.test(ua);

    if (isIosDevice && isSafari) {
      setIsIos(true);
      // Show iOS banner after slight delay for smooth page load
      const timer = setTimeout(() => setShowPrompt(true), 3500);
      return () => clearTimeout(timer);
    }

    // Standard Android / Chrome / Edge beforeinstallprompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Wait 3 seconds to not interrupt user reading
      setTimeout(() => setShowPrompt(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIos) {
      setShowIosInstructions(true);
      return;
    }

    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setShowPrompt(false);
      }
    } catch (err) {
      console.warn('[PWA] Installation prompt error:', err);
    } finally {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIosInstructions(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  };

  if (isTenantRoute || isStandalone || !showPrompt) {
    return null;
  }

  return (
    <aside
      role="region"
      aria-label="App installation notification"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-fade-in"
    >
      <div className="bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-2xl border border-bce-cobalt/60 shadow-2xl shadow-slate-950/60 flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-bce-cobalt to-amber-500 text-amber-300 flex items-center justify-center font-bold shadow-md shrink-0 border border-amber-400/30">
              <School className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white tracking-tight">
                Install Feedback App
              </h3>
              <p className="text-[11px] text-slate-300 leading-tight">
                Access evaluations anytime right from your home screen.
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            aria-label="Dismiss installation banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* iOS Step-by-Step Instructions Drawer */}
        {showIosInstructions ? (
          <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 text-xs space-y-2 text-slate-200">
            <p className="font-semibold text-amber-300 flex items-center gap-1.5 text-[11px]">
              <Share className="w-3.5 h-3.5" /> Install on Apple iPhone/iPad:
            </p>
            <ol className="list-decimal list-inside text-[11px] space-y-1 text-slate-300 leading-relaxed">
              <li>Tap the <strong className="text-white">Share</strong> button in Safari&apos;s bottom toolbar.</li>
              <li>Scroll down and select <strong className="text-white">Add to Home Screen</strong> (<PlusSquare className="w-3 h-3 inline text-amber-400" />).</li>
              <li>Tap <strong className="text-white">Add</strong> in the top-right corner.</li>
            </ol>
            <button
              onClick={() => setShowIosInstructions(false)}
              className="w-full mt-2 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-[10px] font-bold text-slate-200 transition-colors"
            >
              Close Instructions
            </button>
          </div>
        ) : (
          /* Action Buttons */
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleInstallClick}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-98 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isIos ? 'How to Install (iOS)' : 'Install App'}</span>
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 py-2 rounded-xl text-slate-400 hover:text-slate-200 text-xs font-medium hover:bg-slate-800 transition-colors"
            >
              Not now
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
