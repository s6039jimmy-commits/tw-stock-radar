export default function StockBadge({ symbol, name, type }) {
  const isBlueChip = type === 'BLUE_CHIP';
  
  return (
    <div className="flex items-center gap-2">
      <div className={`flex flex-col justify-center px-2 py-1 rounded-md border ${
        isBlueChip 
          ? 'bg-blue-500/10 border-blue-500/30 text-[var(--accent-blue)]' 
          : 'bg-purple-500/10 border-purple-500/30 text-[var(--accent-purple)]'
      }`}>
        <span className="text-xs font-bold font-mono leading-none">{symbol}</span>
      </div>
      <span className="font-bold text-lg">{name}</span>
    </div>
  );
}
