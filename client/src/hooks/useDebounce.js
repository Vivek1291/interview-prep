import { useEffect, useState } from 'react';

// Classic debounce hook — also a common interview question!
export default function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t); // cleanup cancels the previous timer
  }, [value, delay]);
  return debounced;
}
