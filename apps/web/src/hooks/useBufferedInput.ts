import { useEffect, useRef, useState } from 'react';

/**
 * Buffers an input value locally so the parent's onChange is only called on blur,
 * preventing re-renders from resetting cursor position on every keystroke.
 */
export function useBufferedInput(
  externalValue: string | number | null | undefined,
  onCommit: (value: string) => void,
) {
  const [local, setLocal] = useState(externalValue != null ? String(externalValue) : '');
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setLocal(externalValue != null ? String(externalValue) : '');
    }
  }, [externalValue]);

  return {
    value: local,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setLocal(e.target.value),
    onFocus: () => { focused.current = true; },
    onBlur: () => { focused.current = false; onCommit(local); },
  };
}
