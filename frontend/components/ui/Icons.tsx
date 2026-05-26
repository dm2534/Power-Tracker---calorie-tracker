import React from 'react';

export const KenpachiLogo: React.FC<{ className?: string }> = ({ className = "w-12 h-12" }) => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M50 10 L60 30 L80 25 L70 45 L90 55 L65 65 L75 90 L50 75 L25 90 L35 65 L10 55 L30 45 L20 25 L40 30 Z" fill="white" />
    <path d="M35 45 L65 45 L50 60 Z" fill="black" />
    {/* Eyepatch */}
    <path d="M55 40 L75 35 L70 50 Z" fill="black" />
    <line x1="45" y1="30" x2="85" y2="60" stroke="black" strokeWidth="2" />
  </svg>
);

export const BellIcon: React.FC<{ type?: 'solid' | 'half' | 'outline', className?: string }> = ({ type = 'solid', className = "w-4 h-4" }) => {
  return (
    <svg viewBox="0 0 24 24" fill={type === 'solid' ? 'white' : 'none'} stroke="white" strokeWidth="2" className={className}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      {type === 'half' && (
        <path d="M12 3v18" stroke="black" strokeWidth="2" />
      )}
    </svg>
  );
};

export const SwordIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
    <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
    <path d="M13 19l6-6" />
    <path d="M16 16l4 4" />
    <path d="M19 21l2-2" />
  </svg>
);
