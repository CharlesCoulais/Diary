import { useEffect, useRef, useState } from 'react';

function parseTimeInput(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  let h: number, m: number;
  if (digits.length === 0) return null;
  if (digits.length <= 2) {
    h = parseInt(digits, 10);
    m = 0;
  } else if (digits.length === 3) {
    h = parseInt(digits[0]!, 10);
    m = parseInt(digits.slice(1), 10);
  } else {
    h = parseInt(digits.slice(0, 2), 10);
    m = parseInt(digits.slice(2, 4), 10);
  }
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface TimeInputProps {
  value: string;
  onChange: (hhmm: string) => void;
  className?: string;
  placeholder?: string;
}

export function TimeInput({ value, onChange, className = '', placeholder = 'HH:MM' }: TimeInputProps) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const focused = useRef(false);

  // Sync with external value changes (e.g. when server data loads) but only when not focused
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const commit = () => {
    const parsed = parseTimeInput(draft);
    if (parsed) {
      setDraft(parsed);
      onChange(parsed);
    } else {
      setDraft(value);
    }
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; commit(); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); ref.current?.blur(); } }}
      className={`text-sm text-text-primary bg-bg-primary border border-text-muted/20 rounded-lg px-2 py-1 focus:border-accent/40 outline-none w-[80px] text-center ${className}`}
    />
  );
}
