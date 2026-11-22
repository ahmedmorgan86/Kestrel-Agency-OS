import React, { useState } from 'react';
import { Lock, Moon, Sun } from 'lucide-react';
import { apiRequest, setStoredToken } from '../lib/api';
import { ErrorBanner, FormField, INPUT_CLASS, PRIMARY_BTN } from '../components/ui';
import { BrandLockup } from '../components/BrandMark';
import { useThemeAndBrand } from '../context/ThemeAndBrandContext';

export interface AuthUser {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
  status: string;
  roles: string[];
  permissions: string[];
}

export function AuthScreen({
  initialized,
  onAuthenticated,
}: {
  initialized: boolean;
  onAuthenticated: (user: AuthUser) => void;
}) {
  const { theme, toggleTheme, brand } = useThemeAndBrand();
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrganizationName] = useState(brand.name || 'MORGAN GROUP');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (!initialized) {
        const res = await apiRequest<{ user: AuthUser; token: string }>('/auth/bootstrap', {
          method: 'POST',
          body: { fullName, email, password, organizationName },
        });
        setStoredToken(res.token);
        onAuthenticated(res.user);
      } else {
        const res = await apiRequest<{ user: AuthUser; token: string }>('/auth/login', {
          method: 'POST',
          body: { email, password },
        });
        setStoredToken(res.token);
        onAuthenticated(res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative">
      <div className="absolute top-4 right-4">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle light and dark theme"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <BrandLockup
            name={brand.name}
            tagline={brand.tagline}
            symbol={brand.symbol}
            primaryColor={brand.primaryColor}
            variant="lockup"
          />
        </div>
        <h1 className="mt-6 text-center text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {initialized ? 'Sign in to Agency Operations' : 'Initialize Agency Administrator'}
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-400">
          {initialized
            ? 'Internal AI-first social media agency operating platform & virtual headquarters.'
            : 'No administrator account exists yet. Create the initial Super Administrator account to unlock internal operations.'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />

            {!initialized && (
              <>
                <FormField label="Operating Company Name" htmlFor="org-name" required>
                  <input
                    id="org-name"
                    type="text"
                    required
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="MORGAN GROUP"
                  />
                </FormField>

                <FormField label="Administrator Full Name" htmlFor="full-name" required>
                  <input
                    id="full-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="e.g., Nadia Haddad"
                  />
                </FormField>
              </>
            )}

            <FormField label="Work Email" htmlFor="auth-email" required>
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT_CLASS}
                placeholder="name@agency.com"
              />
            </FormField>

            <FormField
              label="Password"
              htmlFor="auth-password"
              required
              hint={!initialized ? 'Minimum 8 characters. Hashed server-side using scrypt.' : undefined}
            >
              <input
                id="auth-password"
                type="password"
                required
                minLength={initialized ? 1 : 8}
                autoComplete={initialized ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT_CLASS}
                placeholder="Enter password"
              />
            </FormField>

            <div className="pt-2">
              <button type="submit" disabled={submitting} className={`${PRIMARY_BTN} w-full`}>
                <Lock className="w-4 h-4" aria-hidden="true" />
                {submitting
                  ? initialized
                    ? 'Signing in...'
                    : 'Initializing workspace...'
                  : initialized
                  ? 'Sign In'
                  : 'Create Administrator & Continue'}
              </button>
            </div>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <p>Internal deployment only · Server-enforced RBAC · Immutable audit trail</p>
            <p>All operational metrics, avatars, and meetings reflect real persisted state.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
