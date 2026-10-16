import { useEffect, useState, useRef } from 'react';

export default function useCountUp(end, duration = 1200, prefix = '', suffix = '', compact = false) {
  const [count, setCount] = useState(0);
  const startTime = useRef(null);
  const rafRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) {
      setCount(end);
      return;
    }
    startTime.current = null;
    const animate = (timestamp) => {
      if (!startTime.current) startTime.current = timestamp;
      const progress = Math.min((timestamp - startTime.current) / duration, 1);
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      setCount(end * easeOutQuart);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        doneRef.current = true;
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [end, duration]);

  const format = (val) => {
    if (compact) {
      if (val >= 1_000_000_000_000) return `${prefix}${(val / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '')} T${suffix}`;
      if (val >= 1_000_000_000) return `${prefix}${(val / 1_000_000_000).toFixed(1).replace(/\.0$/, '')} M${suffix}`;
      if (val >= 1_000_000) return `${prefix}${(val / 1_000_000).toFixed(1).replace(/\.0$/, '')} jt${suffix}`;
    }
    return `${prefix}${new Intl.NumberFormat('id-ID').format(Math.round(val))}${suffix}`;
  };

  return format(count);
}
