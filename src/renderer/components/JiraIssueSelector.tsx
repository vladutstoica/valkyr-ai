import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Search } from 'lucide-react';
import jiraLogo from '../../assets/images/jira.png';
import { type JiraIssueSummary } from '../types/jira';
import { Separator } from './ui/separator';
import { Spinner } from './ui/spinner';
import { JiraIssuePreviewTooltip } from './JiraIssuePreviewTooltip';

interface Props {
  selectedIssue: JiraIssueSummary | null;
  onIssueChange: (issue: JiraIssueSummary | null) => void;
  isOpen?: boolean;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

const JiraIssueSelector: React.FC<Props> = ({
  selectedIssue,
  onIssueChange,
  isOpen = false,
  className = '',
  disabled = false,
  placeholder: customPlaceholder,
}) => {
  const [availableIssues, setAvailableIssues] = useState<JiraIssueSummary[]>([]);
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);
  const [issueListError, setIssueListError] = useState<string | null>(null);
  const [hasRequestedIssues, setHasRequestedIssues] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<JiraIssueSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const isMountedRef = useRef(true);
  const [visibleCount, setVisibleCount] = useState(10);

  const canList = typeof window !== 'undefined' && !!window.electronAPI?.jiraInitialFetch;
  const issuesLoaded = availableIssues.length > 0;
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  // Only disable when explicitly disabled, or when not connected and we can't load
  const isDisabled =
    disabled ||
    (isConnected === false ? isLoadingIssues || !!issueListError || !issuesLoaded : false);

  useEffect(() => () => void (isMountedRef.current = false), []);

  useEffect(() => {
    if (!isOpen) {
      setAvailableIssues([]);
      setHasRequestedIssues(false);
      setIssueListError(null);
      setIsLoadingIssues(false);
      setSearchTerm('');
      setSearchResults([]);
      setIsSearching(false);
      onIssueChange(null);
      setVisibleCount(10);
    }
  }, [isOpen, onIssueChange]);

  // Check connection so we can show better guidance when listing fails
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const api: any = (window as any).electronAPI;
        const res = await api?.jiraCheckConnection?.();
        if (!cancel) setIsConnected(!!res?.connected);
      } catch {
        if (!cancel) setIsConnected(null);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const loadIssues = useCallback(async () => {
    if (!canList) return;
    const api = window.electronAPI;
    if (!api?.jiraInitialFetch) {
      setAvailableIssues([]);
      setIssueListError('Jira issue list unavailable in this build.');
      setHasRequestedIssues(true);
      return;
    }
    setIsLoadingIssues(true);
    try {
      const result = await api.jiraInitialFetch(50);
      if (!isMountedRef.current) return;
      if (!result?.success) throw new Error(result?.error || 'Failed to load Jira issues.');
      setAvailableIssues(result.issues ?? []);
      setIssueListError(null);
    } catch (error) {
      if (!isMountedRef.current) return;
      setAvailableIssues([]);
      setIssueListError(error instanceof Error ? error.message : 'Failed to load Jira issues.');
    } finally {
      if (!isMountedRef.current) return;
      setIsLoadingIssues(false);
      setHasRequestedIssues(true);
    }
  }, [canList]);

  useEffect(() => {
    if (!isOpen || !canList || isLoadingIssues || hasRequestedIssues) return;
    loadIssues();
  }, [isOpen, canList, isLoadingIssues, hasRequestedIssues, loadIssues]);

  const searchIssues = useCallback(async (term: string) => {
    if (!term.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    const api = window.electronAPI;
    if (!api?.jiraSearchIssues) return;
    setIsSearching(true);
    try {
      const result = await api.jiraSearchIssues(term.trim(), 20);
      if (!isMountedRef.current) return;
      setSearchResults(result?.success ? (result.issues ?? []) : []);
      if (result?.success) {
        // Track search
        void (async () => {
          const { captureTelemetry } = await import('../lib/telemetryClient');
          captureTelemetry('jira_issues_searched');
        })();
      }
    } catch {
      if (isMountedRef.current) setSearchResults([]);
    } finally {
      if (isMountedRef.current) setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void searchIssues(searchTerm), 250);
    return () => clearTimeout(t);
  }, [searchTerm, searchIssues]);

  const showIssues = useMemo(() => {
    const source = searchTerm.trim() ? searchResults : availableIssues;
    return source.slice(0, visibleCount);
  }, [availableIssues, searchResults, searchTerm, visibleCount]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 16) {
      setVisibleCount((c) =>
        Math.min(c + 10, (searchTerm.trim() ? searchResults : availableIssues).length)
      );
    }
  };

  const handleIssueSelect = (key: string) => {
    if (key === '__clear__') {
      onIssueChange(null);
      return;
    }
    const all = searchTerm.trim() ? searchResults : availableIssues;
    const issue = all.find((i) => i.key === key) || null;
    if (issue) {
      void (async () => {
        const { captureTelemetry } = await import('../lib/telemetryClient');
        captureTelemetry('jira_issue_selected');
      })();
    }
    onIssueChange(issue);
  };

  if (!canList) {
    return (
      <div className={className}>
        <Input value="" placeholder="Jira integration unavailable" disabled />
        <p className="text-muted-foreground mt-2 text-xs">
          Connect Jira in Settings to browse issues.
        </p>
      </div>
    );
  }

  const issuePlaceholder =
    customPlaceholder ??
    (isLoadingIssues ? 'Loading…' : issueListError ? 'Connect your Jira' : 'Select a Jira issue');

  return (
    <div className={`max-w-full min-w-0 overflow-hidden ${className}`} style={{ maxWidth: '100%' }}>
      <Select
        value={selectedIssue?.key || undefined}
        onValueChange={handleIssueSelect}
        disabled={isDisabled}
      >
        <SelectTrigger
          className="bg-muted h-9 w-full overflow-hidden border-none"
          style={{ maxWidth: '100%' }}
        >
          <div className="text-foreground flex w-full items-center gap-2 overflow-hidden text-left">
            {selectedIssue ? (
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                <JiraIssuePreviewTooltip issue={selectedIssue}>
                  <span
                    className="border-border bg-muted dark:border-border dark:bg-card inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <img src={jiraLogo} alt="Jira" className="h-3.5 w-3.5" />
                    <span className="text-foreground text-[11px] font-medium">
                      {selectedIssue.key}
                    </span>
                  </span>
                </JiraIssuePreviewTooltip>
                {selectedIssue.summary ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                    <span className="text-foreground">-</span>
                    <span className="text-muted-foreground truncate">{selectedIssue.summary}</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <img src={jiraLogo} alt="Jira" className="h-3.5 w-3.5" />
                <span className="text-muted-foreground truncate">{issuePlaceholder}</span>
              </>
            )}
          </div>
        </SelectTrigger>
        <SelectContent side="top" className="z-[120] w-full max-w-[480px]">
          <div className="relative px-3 py-2">
            <Search className="text-muted-foreground absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search by key"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={disabled}
              className="h-7 w-full border-none bg-transparent pr-3 pl-9 focus:ring-0 focus:ring-offset-0 focus:outline-hidden focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <Separator />
          <div className="max-h-80 overflow-x-hidden overflow-y-auto py-1" onScroll={handleScroll}>
            <SelectItem value="__clear__">
              <span className="text-muted-foreground text-sm">None</span>
            </SelectItem>
            <Separator className="my-1" />
            {showIssues.length > 0 ? (
              showIssues.map((issue) => (
                <JiraIssuePreviewTooltip key={issue.id || issue.key} issue={issue} side="left">
                  <SelectItem value={issue.key}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="border-border bg-muted dark:border-border dark:bg-card inline-flex shrink-0 items-center gap-1.5 rounded border px-1.5 py-0.5">
                        <img src={jiraLogo} alt="Jira" className="h-3.5 w-3.5" />
                        <span className="text-foreground text-[11px] font-medium">{issue.key}</span>
                      </span>
                      {issue.summary ? (
                        <span className="text-foreground truncate">{issue.summary}</span>
                      ) : null}
                    </span>
                  </SelectItem>
                </JiraIssuePreviewTooltip>
              ))
            ) : searchTerm.trim() ? (
              <div className="text-muted-foreground px-3 py-2 text-sm">
                {isSearching ? (
                  <div className="flex items-center gap-2">
                    <Spinner size="sm" />
                    <span>Searching…</span>
                  </div>
                ) : (
                  `No issues found for "${searchTerm}"`
                )}
              </div>
            ) : (
              <div className="text-muted-foreground px-3 py-2 text-sm">No issues available</div>
            )}
          </div>
        </SelectContent>
      </Select>
    </div>
  );
};

export default JiraIssueSelector;
