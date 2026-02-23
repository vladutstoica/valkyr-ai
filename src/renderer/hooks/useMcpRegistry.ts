import { useState, useEffect, useCallback, useRef } from 'react';
import type { McpRegistryServer } from '../types/electron-api';

export function useMcpRegistry() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<McpRegistryServer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string, cursor?: string) => {
    setIsSearching(true);
    setError(null);
    try {
      const res = await window.electronAPI.mcpSearchRegistry({ query: q, limit: 20, cursor });
      if (res.success && res.data) {
        if (cursor) {
          setResults((prev) => [...prev, ...res.data!.servers]);
        } else {
          setResults(res.data.servers);
        }
        setNextCursor(res.data.metadata.nextCursor);
      } else {
        setError(res.error || 'Registry search failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setNextCursor(undefined);
      setError(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void search(query);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  const loadMore = useCallback(() => {
    if (nextCursor && query.trim()) {
      void search(query, nextCursor);
    }
  }, [query, nextCursor, search]);

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
    setNextCursor(undefined);
    setError(null);
  }, []);

  return { query, setQuery, results, isSearching, error, nextCursor, loadMore, clear };
}
