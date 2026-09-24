'use client';

import React, { useEffect, useState } from 'react';
import { Download, Check } from 'lucide-react';
import type { TenantContext } from '@/types/tenant';

interface CollegeInstallButtonProps {
  tenant: TenantContext;
  className?: string;
}

export function CollegeInstallButton({ tenant, className }: CollegeInstallButtonProps) {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const checkStandalone =
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://'));

    setIsStandalone(checkStandalone);
  }, []);

  const handleInstallClick = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fms:open-college-pwa-install'));
    }
  };

  if (isStandalone) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/80 ${className || ''}`}
        title={`${tenant.shortName || tenant.name} App is currently installed`}
      >
        <Check className="w-3.5 h-3.5 text-emerald-600" />
        <span className="hidden sm:inline">Installed</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleInstallClick}
      className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 hover:text-amber-950 border border-amber-200/80 rounded-lg transition-all shadow-2xs active:scale-98 cursor-pointer ${className || ''}`}
      aria-label={`Install ${tenant.name} App`}
      title={`Install ${tenant.shortName || tenant.name} App on your device`}
    >
      <Download className="w-3.5 h-3.5 text-amber-600 shrink-0" />
      <span className="hidden sm:inline">Install App</span>
      <span className="sm:hidden font-medium">Install</span>
    </button>
  );
}
