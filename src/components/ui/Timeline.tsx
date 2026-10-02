import React, { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import InteractiveHoverCard from './InteractiveHoverCard';
import { formatLocalDate } from '../../lib/dateFormatter';

export type TimelineItem = {
  title: ReactNode;
  date: string;
  icon?: ReactNode;
};

type TimelineProps = {
  items: TimelineItem[];
  heading?: ReactNode;
  emptyMessage?: string;
  loading?: boolean;
};

const Timeline: React.FC<TimelineProps> = ({
  items,
  heading,
  emptyMessage = 'No hay eventos registrados.',
  loading = false,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [needsScroll, setNeedsScroll] = useState(false);
  const [isAtStart, setIsAtStart] = useState(true);
  const [isAtEnd, setIsAtEnd] = useState(false);

  const updateScrollState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const overflows = element.scrollWidth > element.clientWidth + 1;
    setNeedsScroll(overflows);
    setIsAtStart(element.scrollLeft <= 1);
    setIsAtEnd(overflows && element.scrollLeft + element.clientWidth >= element.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    updateScrollState();
    const handleResize = () => {
      updateScrollState();
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    observer?.observe(element);
    window.addEventListener('resize', handleResize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [items, updateScrollState]);

  const scroll = (left: number) => scrollRef.current?.scrollBy({ left, behavior: 'smooth' });
  return (
    <section className="overflow-visible border-t border-white/5 pt-6">
      {heading && <h3 className="mb-5 text-xs font-semibold uppercase tracking-widest text-white/50">{heading}</h3>}
      {loading ? (
        <p className="text-sm text-white/30">Cargando historial...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-white/30">{emptyMessage}</p>
      ) : (
        <div className="relative overflow-visible">
          {needsScroll && !isAtStart && (
            <button
              type="button"
              aria-label="Ver eventos anteriores"
              onClick={() => scroll(-250)}
              className="absolute left-0 top-1/2 z-[70] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-[#111] text-white/70 shadow-[0_0_24px_18px_#0a0a0a] transition hover:border-cyan-300/50 hover:text-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          <div
            ref={scrollRef}
            onScroll={updateScrollState}
            className="scroll-smooth overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <ol className="flex min-w-max items-center px-3 py-5">
              {items.map((item, index) => {
                const isEven = index % 2 === 0;
                return (
                  <React.Fragment key={`${item.date}-${index}`}>
                    <li className="group relative z-10 overflow-visible">
                      <InteractiveHoverCard
                        placement={isEven ? 'above' : 'below'}
                        trigger={<div className="relative z-20 flex h-9 w-9 cursor-default items-center justify-center rounded-full border border-white/15 bg-[#111] text-white/55 shadow-lg transition duration-200 hover:border-cyan-300/60 hover:bg-cyan-400/10 hover:text-cyan-100 hover:ring-4 hover:ring-cyan-400/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400/20" tabIndex={0}>{item.icon ?? <Clock3 className="h-4 w-4" />}</div>}
                      >
                        <time className="mb-2 block border-b border-white/10 pb-2 text-[10px] font-medium text-white/45">{formatLocalDate(item.date, 'datetime-medium')}</time>
                        <div>{item.title}</div>
                      </InteractiveHoverCard>
                      <time className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] text-white/35 ${isEven ? 'top-full mt-2' : 'bottom-full mb-2'}`}>
                        {formatLocalDate(item.date, 'date-numeric')}
                      </time>
                    </li>
                    {index < items.length - 1 && <li aria-hidden="true" className="mx-1 h-px w-8 bg-white/10" />}
                  </React.Fragment>
                );
              })}
            </ol>
          </div>

          {needsScroll && !isAtEnd && (
            <button
              type="button"
              aria-label="Ver eventos siguientes"
              onClick={() => scroll(250)}
              className="absolute right-0 top-1/2 z-[70] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-[#111] text-white/70 shadow-[0_0_24px_18px_#0a0a0a] transition hover:border-cyan-300/50 hover:text-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
      )}
    </section>
  );
};

export default Timeline;
