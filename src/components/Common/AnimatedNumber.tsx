import React, { useEffect, useState, useRef } from 'react';

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  durationMs?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  decimals = 0,
  durationMs = 450,
  prefix = '',
  suffix = '',
  className = '',
  style = {},
}) => {
  const [displayValue, setDisplayValue] = useState<number>(() => (isNaN(value) ? 0 : value));
  const prevValueRef = useRef<number>(value);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const startValue = prevValueRef.current;
    const endValue = isNaN(value) ? 0 : value;

    if (startValue === endValue) {
      setDisplayValue(endValue);
      return;
    }

    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / durationMs);

      // Easing cúbico suave (out cubic)
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (endValue - startValue) * easeProgress;

      setDisplayValue(current);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
        prevValueRef.current = endValue;
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      prevValueRef.current = endValue;
    };
  }, [value, durationMs]);

  const formatted = isNaN(displayValue)
    ? '--'
    : displayValue.toLocaleString('es-ES', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

  return (
    <span
      className={className}
      style={{
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: 'inherit',
        ...style,
      }}
    >
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
};
