import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

export const ScrollControls: React.FC = () => {
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const getScrollableElement = (): HTMLElement | null => {
    // Check main view containers first, then fallback to document
    const candidates = [
      document.querySelector('.podcast-main'),
      document.querySelector('.admin-page'),
      document.querySelector('.admin-grid'),
      document.querySelector('.admin-table-wrap'),
      document.querySelector('.daw-container'),
      document.querySelector('.auth-card'),
      document.documentElement,
      document.body,
    ];

    for (const el of candidates) {
      if (el && el.scrollHeight > el.clientHeight + 10) {
        return el as HTMLElement;
      }
    }
    return document.documentElement;
  };

  const updateScrollState = () => {
    const el = getScrollableElement();
    if (!el) return;

    const scrollTop = el === document.documentElement ? window.scrollY : el.scrollTop;
    const scrollHeight = el.scrollHeight;
    const clientHeight = el.clientHeight;

    setCanScrollUp(scrollTop > 20);
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - 20);
  };

  useEffect(() => {
    const interval = setInterval(updateScrollState, 500);
    window.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState, { passive: true });

    document.querySelectorAll('.podcast-main, .admin-page, .admin-grid, .admin-table-wrap, .daw-container').forEach((el) => {
      el.addEventListener('scroll', updateScrollState, { passive: true });
    });

    return () => {
      clearInterval(interval);
      window.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, []);

  const scrollToTop = () => {
    const el = getScrollableElement();
    if (el && el !== document.documentElement) {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    const el = getScrollableElement();
    if (el && el !== document.documentElement) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
    window.scrollTo({ top: document.body.scrollHeight || document.documentElement.scrollHeight, behavior: 'smooth' });
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        zIndex: 9990,
        pointerEvents: 'auto',
      }}
    >
      <button
        type="button"
        onClick={scrollToTop}
        title="Scroll to Top"
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '50%',
          background: 'rgba(15, 23, 42, 0.88)',
          border: '1px solid rgba(0, 240, 255, 0.45)',
          color: 'var(--accent-cyan)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 18px rgba(0, 0, 0, 0.6), 0 0 12px rgba(0, 240, 255, 0.25)',
          backdropFilter: 'blur(10px)',
          transition: 'all 0.2s ease',
          opacity: canScrollUp ? 1 : 0.6,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px) scale(1.08)';
          e.currentTarget.style.boxShadow = '0 6px 22px rgba(0, 240, 255, 0.45)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0) scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 18px rgba(0, 0, 0, 0.6), 0 0 12px rgba(0, 240, 255, 0.25)';
        }}
      >
        <ChevronUp size={20} />
      </button>

      <button
        type="button"
        onClick={scrollToBottom}
        title="Scroll to Bottom"
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '50%',
          background: 'rgba(15, 23, 42, 0.88)',
          border: '1px solid rgba(255, 183, 0, 0.45)',
          color: 'var(--accent-amber)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 18px rgba(0, 0, 0, 0.6), 0 0 12px rgba(255, 183, 0, 0.25)',
          backdropFilter: 'blur(10px)',
          transition: 'all 0.2s ease',
          opacity: canScrollDown ? 1 : 0.6,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(2px) scale(1.08)';
          e.currentTarget.style.boxShadow = '0 6px 22px rgba(255, 183, 0, 0.45)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0) scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 18px rgba(0, 0, 0, 0.6), 0 0 12px rgba(255, 183, 0, 0.25)';
        }}
      >
        <ChevronDown size={20} />
      </button>
    </div>
  );
};
