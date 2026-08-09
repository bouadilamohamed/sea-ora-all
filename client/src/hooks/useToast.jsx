import { useCallback, useEffect, useRef, useState } from 'react';

/* A word from the workshop — never an alert, never a red box.
   It says what happened and then gets out of the way. */
export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(0);

  const show = useCallback((message, bad = false) => {
    clearTimeout(timer.current);
    setToast({ message, bad, at: Date.now() });
    // a failure is worth reading twice; a confirmation is not
    timer.current = setTimeout(() => setToast(null), bad ? 4200 : 2600);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const element = toast
    ? <div className={`toast show${toast.bad ? ' bad' : ''}`} role="status">{toast.message}</div>
    : null;

  return { show, element };
}
