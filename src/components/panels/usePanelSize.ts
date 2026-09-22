"use client";

import { useEffect, useRef, useState } from "react";

/** Width and height of a card's body, for charts that size to their container. One observer per caller, throttled to a frame. */
export function usePanelSize<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = { width: el.clientWidth, height: el.clientHeight };
        setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
      });
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  return [ref, size];
}
