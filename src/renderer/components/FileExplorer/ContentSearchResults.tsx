import React from 'react';
import { FileIcon } from './FileIcons';
import type { SearchResult } from '@/hooks/useContentSearch';

// Constants for display limits
const MAX_VISIBLE_MATCHES_PER_FILE = 3;

interface ContentSearchResultsProps {
  results: SearchResult[];
  isSearching: boolean;
  error: string | null;
  onResultClick: (filePath: string) => void;
}

export const ContentSearchResults: React.FC<ContentSearchResultsProps> = ({
  results,
  isSearching,
  error,
  onResultClick,
}) => {
  if (isSearching) {
    return <SearchingIndicator />;
  }

  if (error) {
    return <ErrorMessage error={error} />;
  }

  if (results.length === 0) {
    return <NoResultsMessage />;
  }

  return (
    <div className="space-y-2">
      {results.map((result, index) => (
        <SearchResultItem
          key={`${result.file}-${index}`}
          result={result}
          onResultClick={onResultClick}
        />
      ))}
    </div>
  );
};

const SearchResultItem: React.FC<{
  result: SearchResult;
  onResultClick: (filePath: string) => void;
}> = ({ result, onResultClick }) => {
  const fileName = extractFileName(result.file);
  const visibleMatches = result.matches.slice(0, MAX_VISIBLE_MATCHES_PER_FILE);
  const remainingMatchCount = result.matches.length - MAX_VISIBLE_MATCHES_PER_FILE;

  return (
    <div className="border-border border-b pb-2">
      <button
        onClick={() => onResultClick(result.file)}
        className="hover:bg-accent/50 w-full rounded p-1 text-left"
        aria-label={`Open ${result.file}`}
      >
        <FileHeader fileName={fileName} filePath={result.file} />
        <MatchList matches={visibleMatches} />
        {remainingMatchCount > 0 && <RemainingMatchesIndicator count={remainingMatchCount} />}
      </button>
    </div>
  );
};

const FileHeader: React.FC<{ fileName: string; filePath: string }> = ({ fileName, filePath }) => (
  <div className="flex items-center gap-1">
    <FileIcon filename={fileName} isDirectory={false} />
    <span className="text-sm font-medium">{filePath}</span>
  </div>
);

const MatchList: React.FC<{ matches: any[] }> = ({ matches }) => (
  <div className="mt-1 ml-5 space-y-1">
    {matches.map((match, index) => (
      <MatchPreview key={index} match={match} />
    ))}
  </div>
);

const MatchPreview: React.FC<{ match: any }> = ({ match }) => (
  <div className="text-muted-foreground text-xs">
    <span className="font-mono">Line {match.line}:</span>{' '}
    <span className="text-foreground">{match.preview}</span>
  </div>
);

const RemainingMatchesIndicator: React.FC<{ count: number }> = ({ count }) => (
  <div className="text-muted-foreground mt-1 ml-5 text-xs">
    ... and {count} more {count === 1 ? 'match' : 'matches'}
  </div>
);

const SearchingIndicator: React.FC = () => (
  <div className="text-muted-foreground text-sm">Searching...</div>
);

const ErrorMessage: React.FC<{ error: string }> = ({ error }) => (
  <div className="text-destructive text-sm">Error: {error}</div>
);

const NoResultsMessage: React.FC = () => (
  <div className="text-muted-foreground text-sm">No results found</div>
);

function extractFileName(filePath: string): string {
  return filePath.split('/').pop() || '';
}

export default ContentSearchResults;
