import { useState, useEffect } from 'react';
import { formatPrice, formatPercent } from '../../utils/formatters';
import { TrendingUp, TrendingDown, Activity, RefreshCw } from 'lucide-react';

export default function MarketOverview() {
  const [data, setData] = useState([
    { label: '台股加權指數 (IX0001)', value: 0, change: 0, changePct: 0, type: 'index' },
    { label: '富邦台50 (006208)', value: 0, change: 0, changePct: 0, type: 'index' },
    { label: '元大高股息 (0056)', value: 0, change: 0, changePct: 0, type: 'index' },
    { label: '納指100 (QQQM)', value: 0, change: 0, changePct: 0, type: 'index' }
  ]);

  const fetchQQQM = async () => {
    try {
      const res = await fetch(
        'https://query1.finance.yahoo.com/v8/finance/chart/QQQM?interval=1d&range=1d',
        { headers: { 'Accept': 'application/json' } }
      );
      const json = await res.json();
      const meta = json?.chart?.result?.[0]?.meta;
      if (meta) {
        return {
          price: meta.regularMarketPrice || 0,
          change: (meta.regularMarketPrice || 0) - (meta.previousClose || 0),
          changePct: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100
        };
      }
    } catch (e) {
      console.error('QQQM fetch failed', e);
    }
    return null;
  };

  const fetchDataLogic = async () => {
    const [tseRes, etf50Res, etf56Res, qqqmData] = await Promise.all([
      fetch('/api/market/quote/IX0001').then(res => res.json()).catch(() => ({})),
      fetch('/api/market/quote/006208').then(res => res.json()).catch(() => ({})),
      fetch('/api/market/quote/0056').then(res => res.json()).catch(() => ({})),
      fetchQQQM()
    ]);

    setData(prev => {
      const newData = [...prev];
      
      if (tseRes?.success && tseRes?.data) {
        const q = tseRes.data;
        newData[0] = { ...newData[0], value: q.closePrice || q.lastPrice || 0, change: q.change || 0, changePct: q.changePercent || 0 };
      }

      if (etf50Res?.success && etf50Res?.data) {
        const q = etf50Res.data;
        newData[1] = { ...newData[1], value: q.closePrice || q.lastPrice || 0, change: q.change || 0, changePct: q.changePercent || 0 };
      }

      if (etf56Res?.success && etf56Res?.data) {
        const q = etf56Res.data;
        newData[2] = { ...newData[2], value: q.closePrice || q.lastPrice || 0, change: q.change || 0, changePct: q.changePercent || 0 };
      }

      if (qqqmData) {
        newData[3] = { ...newData[3], value: qqqmData.price, change: qqqmData.change, changePct: qqqmData.changePct };
      }

      return newData;
    });
  };

  useEffect(() => {
    fetchDataLogic();
    const intervalId = setInterval(fetchDataLogic, 15000);
    return () => clearInterval(intervalId);
  }, []);

  const handleManualRefresh = () => fetchDataLogic();

  return (
    <div className="flex flex-col gap-4 mb-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Activity className="text-blue-400" /> 大盤即時總覽
        </h2>
        <button 
          onClick={handleManualRefresh}
          className="btn btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3"
          title="重新取得最新報價"
        >
          <RefreshCw size={14} />
          <span>重新整理</span>
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
      {data.map((item, idx) => {
        const isUp = item.change >= 0;
        const colorClass = isUp ? 'text-up' : 'text-down';
        const Icon = item.type === 'volume' ? Activity : isUp ? TrendingUp : TrendingDown;
        
        return (
          <div key={idx} className="card-glass flex flex-col gap-1 relative overflow-hidden min-w-0">
            <span className="text-secondary text-xs font-medium truncate">{item.label}</span>
            <div className="flex items-baseline gap-1 min-w-0">
              <span className="text-xl md:text-2xl font-bold font-mono truncate">
                {item.type === 'volume' ? item.value : (typeof item.value === 'number' ? item.value.toLocaleString('en-US', { minimumFractionDigits: 2 }) : item.value)}
              </span>
              {item.unit && <span className="text-secondary text-xs font-sans flex-shrink-0">{item.unit}</span>}
            </div>
            
            {item.change !== undefined && (
              <div className={`flex items-center gap-1 text-xs font-medium ${colorClass}`}>
                <Icon size={12} />
                <span className="truncate">
                  {isUp ? '+' : ''}{typeof item.change === 'number' ? item.change.toFixed(2) : item.change} ({formatPercent(item.changePct)})
                </span>
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
