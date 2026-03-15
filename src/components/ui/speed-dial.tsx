import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SpeedDialAction {
  icon: React.ReactNode;
  name: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
}

interface SpeedDialProps {
  actions: SpeedDialAction[];
  direction?: 'up' | 'down';
  className?: string;
  mainIcon?: React.ReactNode;
  activeIcon?: React.ReactNode;
  buttonClassName?: string;
  actionClassName?: string;
}

export function SpeedDial({ 
  actions, 
  direction = 'up', 
  align = 'right',
  className, 
  mainIcon, 
  activeIcon,
  buttonClassName,
  actionClassName
}: SpeedDialProps & { align?: 'left' | 'right' | 'center' }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const alignClass = align === 'left' ? 'items-start' : align === 'center' ? 'items-center' : 'items-end';

  return (
    <div ref={containerRef} className={cn(`relative flex flex-col ${alignClass}`, className)}>
      <AnimatePresence>
        {isOpen && actions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              `absolute flex flex-col ${alignClass} gap-3 z-50`,
              direction === 'up' ? "bottom-full mb-4" : "top-full mt-4"
            )}
          >
            {actions.map((action, index) => (
              <motion.button
                key={action.name}
                initial={{ opacity: 0, y: direction === 'up' ? 20 : -20, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: direction === 'up' ? 20 : -20, scale: 0.8 }}
                transition={{ duration: 0.2, delay: direction === 'up' ? (actions.length - 1 - index) * 0.05 : index * 0.05 }}
                onClick={() => {
                  action.onClick();
                  setIsOpen(false);
                }}
                className={cn(
                  "flex items-center gap-3 px-5 py-3 rounded-full shadow-lg transition-colors whitespace-nowrap",
                  action.active 
                    ? "bg-brand-600 text-white" 
                    : "bg-brand-100 text-brand-900 hover:bg-brand-200 dark:bg-brand-900/40 dark:text-brand-100 dark:hover:bg-brand-800/60",
                  actionClassName,
                  action.className
                )}
              >
                <span className="w-5 h-5 flex items-center justify-center">{action.icon}</span>
                <span className="font-medium text-sm">{action.name}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileTap={{ scale: 0.9 }}
        className={cn(
          "w-14 h-14 rounded-full bg-brand-600 text-white shadow-xl flex items-center justify-center hover:bg-brand-700 transition-colors z-10",
          buttonClassName
        )}
      >
        <motion.div
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.2 }}
        >
          {isOpen && activeIcon ? activeIcon : (mainIcon || <Plus size={24} />)}
        </motion.div>
      </motion.button>
    </div>
  );
}
