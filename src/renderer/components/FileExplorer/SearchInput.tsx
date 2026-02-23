import React from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  onClear,
  placeholder = 'Search',
  disabled = false,
}) => {
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  const handleClearClick = () => {
    onClear();
  };

  const showClearButton = value.length > 0;

  return (
    <div className="relative">
      <SearchIcon />
      <input
        type="text"
        value={value}
        onChange={handleInputChange}
        placeholder={placeholder}
        disabled={disabled}
        className="border-input bg-background focus:border-accent focus:ring-accent w-full rounded-none border py-1 pr-8 pl-9 text-sm outline-hidden focus:ring-1 disabled:opacity-50"
        aria-label="Search input"
      />
      {showClearButton && <ClearButton onClick={handleClearClick} disabled={disabled} />}
    </div>
  );
};

const SearchIcon: React.FC = () => (
  <Search
    className="text-muted-foreground absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2"
    aria-hidden="true"
  />
);

const ClearButton: React.FC<{ onClick: () => void; disabled?: boolean }> = ({
  onClick,
  disabled = false,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="hover:bg-accent absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 disabled:opacity-50"
    aria-label="Clear search"
    type="button"
  >
    <X className="h-3 w-3" />
  </button>
);

export default SearchInput;
