'use client';

import React, { createContext, useContext } from 'react';
import type { TenantContext } from '@/types/tenant';

const TenantReactContext = createContext<TenantContext | null>(null);

export function TenantProvider({
  tenant,
  children,
}: {
  tenant: TenantContext;
  children: React.ReactNode;
}) {
  return (
    <TenantReactContext.Provider value={tenant}>
      {children}
    </TenantReactContext.Provider>
  );
}

export function useTenant(): TenantContext | null {
  return useContext(TenantReactContext);
}
