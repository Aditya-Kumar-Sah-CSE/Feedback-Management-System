'use client';

import React, { useEffect, useState } from 'react';
import { Download, X, Share, PlusSquare, School, Check, ArrowRight } from 'lucide-react';
import type { TenantContext } from '@/types/tenant';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CollegePwaInstallPromptProps {
  tenant: TenantContext;
}

export function CollegePwaInstallPrompt({ tenant }: CollegePwaInstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [isInstalledJustNow, setIsInstalledJustNow] = useState(false);

  const dismissKey = `fms_pwa_dismissed_${tenant.slug}`;

  useEffect(() => {
    // 1. Check if already running standalone PWA
    const checkStandalone =
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://'));

    if (checkStandalone) {
      setIsStandalone(true);
      return;
    }

    // 2. Detect iOS Safari
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/crios|fxios|edgios|chrome/.test(ua);
    const isAppleIos = isIosDevice && isSafari;
    setIsIos(isAppleIos);

    // 3. Check if user arrived via ?install=true (e.g. from the College Card download button)
    const urlParams = new URLSearchParams(window.location.search);
    const isDirectInstallRequest = urlParams.get('install') === 'true' || urlParams.get('install') === '1';

    if (isDirectInstallRequest) {
      setShowPrompt(true);
      if (isAppleIos) {
        setShowIosInstructions(true);
      }
      // Clean query parameter from URL without page reload
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('install');
        window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
      } catch {
        // Safe fallback
      }
    } else {
      // Check dismissal cooldown for normal visits
      const dismissedAt = localStorage.getItem(dismissKey);
      if (dismissedAt) {
        const diff = Date.now() - parseInt(dismissedAt, 10);
        if (diff < DISMISS_COOLDOWN_MS) {
          // Still within cooldown
          return;
        }
      }

      // If normal visit, gently delay before showing
      if (isAppleIos) {
        const timer = setTimeout(() => setShowPrompt(true), 3500);
        return () => clearTimeout(timer);
      }
    }

    // 4. Capture native beforeinstallprompt event
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (isDirectInstallRequest) {
        setShowPrompt(true);
      } else {
        setTimeout(() => setShowPrompt(true), 2500);
      }
    };

    // 5. Custom event listener to trigger prompt on button click (e.g. header "Install App")
    const handleOpenTrigger = () => {
      setShowPrompt(true);
      if (isAppleIos) {
        setShowIosInstructions(true);
      }
    };

    // 6. Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalledJustNow(true);
      setTimeout(() => setShowPrompt(false), 2500);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('fms:open-college-pwa-install', handleOpenTrigger);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('fms:open-college-pwa-install', handleOpenTrigger);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [dismissKey]);

  const handleInstallClick = async () => {
    if (isIos) {
      setShowIosInstructions(true);
      return;
    }

    if (!deferredPrompt) {
      // If browser doesn't expose deferredPrompt (e.g. Desktop Chrome where address bar icon is preferred)
      alert(
        `To install ${tenant.shortName || tenant.name}:\n\n` +
        '• On Chrome/Edge Desktop: Click the Install icon in the address bar (top right)\n' +
        '• On Android Chrome: Tap menu (⋮) → "Install app" or "Add to Home Screen"'
      );
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalledJustNow(true);
        setTimeout(() => setShowPrompt(false), 2000);
      }
    } catch (err) {
      console.warn('[College PWA] Installation prompt notice:', err);
    } finally {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIosInstructions(false);
    localStorage.setItem(dismissKey, Date.now().toString());
  };

  if (isStandalone || !showPrompt) {
    return null;
  }

  const shortName = tenant.shortName || tenant.code || 'College';

  return (
    <aside
      role="region"
      aria-label={`Install ${tenant.name} Application`}
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-fade-in"
    >
      <div className="bg-slate-900/95 backdrop-blur-md text-white p-4 sm:p-5 rounded-2xl border border-slate-700/80 shadow-2xl shadow-slate-950/70 flex flex-col gap-3">
        {/* Header row with College Branding */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-white p-1.5 flex items-center justify-center font-bold shadow-md shrink-0 border border-slate-200 overflow-hidden">
              {tenant.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tenant.logo}
                  alt={`${tenant.name} Logo`}
                  className="w-full h-full object-contain"
                />
              ) : (
                <School className="w-6 h-6 text-slate-700" />
              )}
            </div>
            <div className="min-w-0">
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full mb-0.5">
                Official PWA
              </span>
              <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate">
                Install {tenant.name}
              </h3>
              <p className="text-[11px] text-slate-300 truncate">
                Direct home screen access for {shortName} evaluations
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            aria-label="Dismiss installation banner"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success Feedback state */}
        {isInstalledJustNow ? (
          <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-xs text-emerald-200 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{shortName} App installed successfully!</span>
          </div>
        ) : showIosInstructions ? (
          /* iOS Step-by-Step Instructions Drawer */
          <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 text-xs space-y-2 text-slate-200">
            <p className="font-semibold text-amber-300 flex items-center gap-1.5 text-[11px]">
              <Share className="w-3.5 h-3.5" /> Install {shortName} on iPhone / iPad:
            </p>
            <ol className="list-decimal list-inside text-[11px] space-y-1.5 text-slate-300 leading-relaxed">
              <li>
                Tap the <strong className="text-white">Share</strong> button in Safari&apos;s bottom toolbar (<Share className="w-3 h-3 inline text-amber-400" />).
              </li>
              <li>
                Scroll down and tap <strong className="text-white">Add to Home Screen</strong> (<PlusSquare className="w-3 h-3 inline text-amber-400" />).
              </li>
              <li>
                Tap <strong className="text-white">Add</strong> in the top-right corner.
              </li>
            </ol>
            <button
              onClick={() => setShowIosInstructions(false)}
              className="w-full mt-2 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-[11px] font-bold text-slate-200 transition-colors"
            >
              Done / Close Instructions
            </button>
          </div>
        ) : (
          /* Action Buttons */
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleInstallClick}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-400 text-slate-950 text-xs sm:text-sm font-bold transition-all shadow-md active:scale-98 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isIos ? `How to Install (${shortName})` : `Install ${shortName} App`}</span>
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 py-2.5 rounded-xl text-slate-400 hover:text-slate-200 text-xs font-medium hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Not now
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
