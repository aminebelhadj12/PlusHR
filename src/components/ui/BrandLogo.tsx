import React from 'react';

interface BrandLogoProps {
  compact?: boolean;
  inverted?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ compact = false, inverted = false }) => {
  return (
    <div className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="32" height="32" rx="8" fill="#2563EB" />
        <path
          d="M11.5 9V23M4.5 16H18.5"
          stroke="#FFFFFF"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M22.5 10V22M22.5 16H27M27 10V22"
          stroke="#93C5FD"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
      {!compact && (
        <span
          className={`font-display text-lg font-bold tracking-tight ${
            inverted ? 'text-white' : 'text-[#0F172A] dark:text-white'
          }`}
        >
          +HR
        </span>
      )}
    </div>
  );
};
