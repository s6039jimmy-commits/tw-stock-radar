import { Star } from 'lucide-react';

export default function StarRating({ rating = 0, maxStars = 5 }) {
  const starsCount = Math.max(1, Math.min(maxStars, Number(rating) || 1));
  return (
    <div className="flex items-center gap-1">
      {[...Array(maxStars)].map((_, i) => {
        const isFilled = i < starsCount;
        return (
          <Star
            key={i}
            size={18}
            className={`transition-colors duration-300 ${
              isFilled 
                ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.6)]' 
                : 'fill-white/10 text-white/20'
            }`}
          />
        );
      })}
    </div>
  );
}
