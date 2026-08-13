export default function ConfidenceMeter({ score = 0 }) {
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const clampedScore = Math.max(0, Math.min(100, Number(score) || 0));
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;
  
  // Color based on score (Taiwan convention: Red = Bullish/High)
  const strokeColor = clampedScore >= 80 ? '#ef4444' : clampedScore >= 60 ? '#f59e0b' : '#22c55e';

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-14 h-14 flex items-center justify-center">
        <svg className="transform -rotate-90 w-full h-full">
          <circle
            cx="28"
            cy="28"
            r={radius}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="4"
            fill="transparent"
          />
          <circle
            cx="28"
            cy="28"
            r={radius}
            stroke={strokeColor}
            strokeWidth="4"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute text-center">
          <span className="text-sm font-bold font-mono text-primary">{clampedScore}%</span>
        </div>
      </div>
    </div>
  );
}
