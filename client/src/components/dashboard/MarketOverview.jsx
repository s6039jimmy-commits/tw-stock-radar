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

  const fetchDataLogic = () => {
    Promise.all([
      fetch('/api/market/quote/IX0001').then(res => res.json()).catch(() => ({})),
      fetch('/api/market/quote/006208').then(res => res.json()).catch(() => ({})),
      fetch('/api/market/quote/0056').then(res => res.json()).catch(() => ({})),
      fetch('/api/market/quote/QQQM').then(res => res.json()).catch(() => ({}))
    ]).then(([tseRes, etf50Res, etf56Res, qqqmRes]) => {
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

        if (qqqmRes?.success && qqqmRes?.data) {
          const q = qqqmRes.data;
          newData[3] = { ...newData[3], value: q.closePrice || q.lastPrice || 0, change: q.change || 0, changePct: q.changePercent || 0 };
        }
        
        return newData;
      });
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
          <div key={idx} className="card-glass flex flex-col gap-2 relative overflow-hidden">
            <span className="text-secondary text-sm font-medium">{item.label}</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono">
                {item.type === 'volume' ? item.value : item.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
              {item.unit && <span className="text-secondary text-sm font-sans">{item.unit}</span>}
            </div>
            
            {item.change !== undefined && (
              <div className={`flex items-center gap-1 text-sm font-medium ${colorClass}`}>
                <Icon size={16} />
                <span>
                  {isUp ? '+' : ''}{item.change} ({formatPercent(item.changePct)})
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
