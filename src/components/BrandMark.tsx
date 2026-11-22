import React from 'react';
import { Bot } from 'lucide-react';
import type { AvatarConfig } from '../domain/hq';

export type BrandSymbolType = 'kestrel' | 'prism' | 'compass' | 'aperture';

export function BrandSymbol({
  symbol = 'kestrel',
  primaryColor = '#1d4ed8',
  size = 32,
  className = '',
}: {
  symbol?: BrandSymbolType | string;
  primaryColor?: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="36" height="36" rx="9" fill={primaryColor} />
      {symbol === 'prism' ? (
        <>
          <path d="M18 7L29 26.5H7L18 7Z" stroke="white" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M18 7L22.5 26.5" stroke="white" strokeOpacity="0.65" strokeWidth="1.6" />
          <circle cx="18" cy="19.5" r="2.2" fill="white" />
        </>
      ) : symbol === 'compass' ? (
        <>
          <circle cx="18" cy="18" r="10.5" stroke="white" strokeWidth="2" />
          <path d="M22.5 13.5L19.8 19.8L13.5 22.5L16.2 16.2L22.5 13.5Z" fill="white" />
        </>
      ) : symbol === 'aperture' ? (
        <>
          <circle cx="18" cy="18" r="10" stroke="white" strokeWidth="2" />
          <path d="M18 8L21.5 16H28M18 28L14.5 20H8M12 10L17.5 16.5M24 26L18.5 19.5" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
        </>
      ) : (
        /* Kestrel geometric wing & precision fulcrum */
        <>
          <path
            d="M8.5 25.5L15.2 10.5H20.8L14.8 18.8H26.5L23.2 25.5H8.5Z"
            fill="white"
          />
          <path
            d="M21.5 10.5H27.5L24.5 15.8H19.6L21.5 10.5Z"
            fill="white"
            fillOpacity="0.72"
          />
        </>
      )}
    </svg>
  );
}

export function BrandLockup({
  name,
  tagline,
  symbol = 'kestrel',
  primaryColor = '#1d4ed8',
  variant = 'compact',
}: {
  name: string;
  tagline?: string;
  symbol?: BrandSymbolType | string;
  primaryColor?: string;
  variant?: 'symbol' | 'compact' | 'lockup';
}) {
  if (variant === 'symbol') {
    return <BrandSymbol symbol={symbol} primaryColor={primaryColor} size={32} />;
  }

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <BrandSymbol symbol={symbol} primaryColor={primaryColor} size={variant === 'lockup' ? 36 : 30} className="shrink-0" />
      <div className="min-w-0 leading-tight">
        <div className="font-bold tracking-tight text-slate-900 dark:text-slate-100 font-[var(--font-display)] truncate text-sm sm:text-[15px]">
          {name || 'Kestrel Social Agency'}
        </div>
        {variant === 'lockup' && tagline && (
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{tagline}</div>
        )}
      </div>
    </div>
  );
}

export function ActorAvatar({
  name,
  actorType,
  photoUrl,
  avatarConfig,
  size = 'md',
}: {
  name: string;
  actorType: 'human' | 'agent';
  photoUrl?: string | null;
  avatarConfig?: Partial<AvatarConfig> | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dims =
    size === 'sm' ? 'w-7 h-7 text-[11px]' : size === 'lg' ? 'w-14 h-14 text-lg' : 'w-9 h-9 text-xs';
  const accent = avatarConfig?.accentColor || (actorType === 'agent' ? '#2563eb' : '#334155');

  if (actorType === 'human' && photoUrl && /^https?:\/\//i.test(photoUrl)) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`${dims} rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0`}
      />
    );
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  if (actorType === 'agent') {
    return (
      <div
        className={`${dims} rounded-lg flex items-center justify-center text-white font-semibold shrink-0 border border-white/15`}
        style={{ backgroundColor: accent }}
        title={`${name} (AI Employee)`}
      >
        <Bot className={size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-7 h-7' : 'w-4 h-4'} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div
      className={`${dims} rounded-full flex items-center justify-center text-white font-semibold shrink-0`}
      style={{ backgroundColor: accent }}
      title={name}
    >
      {initials || 'HM'}
    </div>
  );
}
