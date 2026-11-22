import React, { useEffect, useState, useRef } from 'react';
import { Bot, Briefcase, Building2, CheckSquare, FileText, FolderKanban, Search, Users, Video, X } from 'lucide-react';
import { apiRequest } from '../lib/api';

interface SearchResultItem {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  route: string;
  entityId?: string;
}

export function GlobalSearchModal({
  open,
  onClose,
  onSelectResult,
}: {
  open: boolean;
  onClose: () => void;
  onSelectResult: (result: SearchResultItem) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 20);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiRequest<{ results: SearchResultItem[] }>(
          `/search?q=${encodeURIComponent(query.trim())}`
        );
        setResults(res.results);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query, open]);

  if (!open) return null;

  const iconForType = (type: string) => {
    switch (type) {
      case 'employee':
        return Users;
      case 'agent':
        return Bot;
      case 'department':
        return Building2;
      case 'client':
        return Briefcase;
      case 'project':
        return FolderKanban;
      case 'task':
        return CheckSquare;
      case 'meeting':
        return Video;
      default:
        return FileText;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Global workspace search"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients, employees, AI agents, departments, tasks, meetings..."
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close global search"
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {query.trim().length < 2 ? (
            <div className="p-6 text-xs text-slate-500 dark:text-slate-400 text-center">
              Type at least 2 characters to search across real persisted agency records.
            </div>
          ) : loading ? (
            <div className="p-6 text-xs text-slate-500 dark:text-slate-400 text-center">Searching workspace...</div>
          ) : results.length === 0 ? (
            <div className="p-6 text-xs text-slate-500 dark:text-slate-400 text-center">
              No matching records found for "{query}".
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {results.map((r) => {
                const Icon = iconForType(r.type);
                return (
                  <button
                    key={`${r.type}_${r.id}`}
                    type="button"
                    onClick={() => {
                      onSelectResult(r);
                      onClose();
                    }}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{r.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{r.subtitle}</div>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 uppercase shrink-0">{r.type}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
