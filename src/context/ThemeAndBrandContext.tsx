import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { BrandSymbolType } from '../components/BrandMark';

export interface CompanyBrandIdentity {
  name: string;
  legalName: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
  symbol: BrandSymbolType;
  logoStyle: 'lockup' | 'compact' | 'symbol';
}

const DEFAULT_BRAND: CompanyBrandIdentity = {
  name: 'MORGAN GROUP',
  legalName: 'MORGAN GROUP',
  tagline: 'محتوى يصنع فرقاً',
  primaryColor: '#0e7490',
  secondaryColor: '#0b1726',
  symbol: 'prism',
  logoStyle: 'lockup',
};

interface ThemeAndBrandContextValue {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  setTheme: (next: 'light' | 'dark') => void;
  reducedMotion: boolean;
  setReducedMotion: (val: boolean) => void;
  brand: CompanyBrandIdentity;
  updateBrandFromOrg: (org: Record<string, unknown> | null | undefined) => void;
}

const ThemeAndBrandContext = createContext<ThemeAndBrandContextValue>({
  theme: 'light',
  toggleTheme: () => {},
  setTheme: () => {},
  reducedMotion: false,
  setReducedMotion: () => {},
  brand: DEFAULT_BRAND,
  updateBrandFromOrg: () => {},
});

export function ThemeAndBrandProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('kestrel_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // ignore storage errors
    }
    return 'light';
  });

  const [reducedMotion, setReducedMotionState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('kestrel_reduced_motion');
      if (saved === 'true') return true;
      if (saved === 'false') return false;
      return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    } catch {
      return false;
    }
  });

  const [brand, setBrand] = useState<CompanyBrandIdentity>(DEFAULT_BRAND);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('kestrel_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const setTheme = useCallback((next: 'light' | 'dark') => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const setReducedMotion = useCallback((val: boolean) => {
    setReducedMotionState(val);
    try {
      localStorage.setItem('kestrel_reduced_motion', String(val));
    } catch {
      // ignore
    }
  }, []);

  const updateBrandFromOrg = useCallback((org: Record<string, unknown> | null | undefined) => {
    if (!org) return;
    setBrand({
      name: String(org.name || DEFAULT_BRAND.name),
      legalName: String(org.legal_name || DEFAULT_BRAND.legalName),
      tagline: String(org.tagline || DEFAULT_BRAND.tagline),
      primaryColor:
        typeof org.brand_primary_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(org.brand_primary_color)
          ? org.brand_primary_color
          : DEFAULT_BRAND.primaryColor,
      secondaryColor:
        typeof org.brand_secondary_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(org.brand_secondary_color)
          ? org.brand_secondary_color
          : DEFAULT_BRAND.secondaryColor,
      symbol: (['kestrel', 'prism', 'compass', 'aperture'].includes(String(org.brand_symbol))
        ? String(org.brand_symbol)
        : 'kestrel') as BrandSymbolType,
      logoStyle: (['lockup', 'compact', 'symbol'].includes(String(org.logo_style))
        ? String(org.logo_style)
        : 'lockup') as 'lockup' | 'compact' | 'symbol',
    });
  }, []);

  return (
    <ThemeAndBrandContext.Provider
      value={{
        theme,
        toggleTheme,
        setTheme,
        reducedMotion,
        setReducedMotion,
        brand,
        updateBrandFromOrg,
      }}
    >
      {children}
    </ThemeAndBrandContext.Provider>
  );
}

export function useThemeAndBrand() {
  return useContext(ThemeAndBrandContext);
}
