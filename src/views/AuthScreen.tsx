import React, { useState } from 'react';
import { ShieldCheck, Lock } from 'lucide-react';
import { apiRequest, setStoredToken } from '../lib/api';
import { ErrorBanner, FormField, INPUT_CLASS, PRIMARY_BTN } from '../components/ui';

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
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrganizationName] = useState('Kestrel Social Agency');
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
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex items-center justify-center gap-2.5 text-slate-900">
          <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" aria-hidden="true" />
          </div>
          <span className="text-xl font-bold tracking-tight font-[var(--font-display)]">
            Kestrel Agency OS
          </span>
        </div>
        <h1 className="mt-5 text-center text-2xl font-semibold tracking-tight text-slate-900">
          {initialized ? 'Sign in to Agency Operations' : 'Initialize Agency Administrator'}
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          {initialized
            ? 'Internal AI-first social media agency operating platform. Authorized personnel only.'
            : 'No administrator account exists yet. Create the initial Super Administrator account to unlock internal operations.'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white border border-slate-200 rounded-lg p-6 sm:p-8">
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
                    placeholder="Kestrel Social Agency"
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

          <div className="mt-6 pt-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
            <p>Internal deployment only · Server-enforced RBAC · Immutable audit trail</p>
            <p>All operational metrics start at zero until real records are created.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
