import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../styles/ThemeContext';

export const ThemeToggle: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  return (
    <button
      type="button"
      className={`btn-transport ${className}`}
      onClick={toggleTheme}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 10px',
        fontSize: '0.74rem',
        fontWeight: 600,
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        ...style,
      }}
      title={`Switch to ${isLight ? 'Dark' : 'Clean White'} Theme`}
    >
      {isLight ? (
        <>
          <Moon size={14} color="var(--accent-amber)" />
          <span>Dark</span>
        </>
      ) : (
        <>
          <Sun size={14} color="var(--accent-cyan)" />
          <span>Light</span>
        </>
      )}
    </button>
  );
};
