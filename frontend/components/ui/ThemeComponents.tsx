import React from 'react';

export const SlashDivider: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`relative h-8 w-full overflow-hidden flex items-center justify-center ${className}`}>
    <div className="absolute w-[150%] h-1 bg-white transform -rotate-3"></div>
  </div>
);

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'danger' | 'ghost' }> = ({ 
  children, 
  variant = 'primary', 
  className = "", 
  ...props 
}) => {
  const baseStyle = "uppercase font-bold tracking-wider transition-all duration-200 flex items-center justify-center px-6 py-3 rounded-none";
  
  const variants = {
    primary: "border-2 border-white bg-black text-white hover:bg-white hover:text-black",
    danger: "border-2 border-red-600 bg-black text-red-600 hover:bg-red-600 hover:text-black",
    ghost: "border-2 border-transparent text-muted hover:text-white hover:border-border-strong"
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = "", ...props }) => (
  <input 
    className={`w-full bg-surface border-2 border-border-strong text-white px-4 py-3 font-mono focus:border-white focus:outline-none rounded-none transition-colors ${className}`}
    {...props}
  />
);

export const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({ children, className = "", ...props }) => (
  <label className={`block text-muted uppercase text-sm font-bold tracking-widest mb-2 ${className}`} {...props}>
    {children}
  </label>
);

export const Card: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className = "" }) => (
  <div className={`battle-border p-6 ${className}`}>
    {children}
  </div>
);

export const TallyBar: React.FC<{ current: number, max: number, label: string, color?: string }> = ({ current, max, label, color = "white" }) => {
  const percentage = Math.min(100, Math.max(0, (current / max) * 100));
  const tallyCount = Math.floor(percentage / 5); // 20 tallies max
  
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-end font-mono text-sm">
        <span className="text-muted uppercase">{label}</span>
        <span className="text-white">{Math.round(current)} / {max}g</span>
      </div>
      <div className="h-8 border-b-2 border-border-strong flex items-end gap-[2px] pb-1 overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <div 
            key={i} 
            className={`w-2 h-full transform -skew-x-12 transition-all duration-500 ${i < tallyCount ? 'bg-white' : 'bg-transparent border border-border-strong'}`}
            style={{ backgroundColor: i < tallyCount ? color : undefined }}
          />
        ))}
      </div>
    </div>
  );
};
