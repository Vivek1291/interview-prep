import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

// Floating "↑ Top" button for the main scroll area (.content). Appears after scrolling down a bit.
export default function ScrollTopButton({ targetRef }) {
  const [visible, setVisible] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return undefined;
    const onScroll = () => setVisible(el.scrollTop > 400);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [targetRef]);

  // a new page starts at the top
  useEffect(() => { targetRef.current?.scrollTo({ top: 0 }); }, [pathname, targetRef]);

  if (!visible) return null;
  return (
    <button type="button" className="scroll-top" onClick={() => targetRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Go to top" title="Go to top">
      ↑ <span>Top</span>
    </button>
  );
}
