import { useState, useEffect } from 'react';
import { formatPrice, formatPercent } from '../../utils/formatters';
import { TrendingUp, TrendingDown, Activity, RefreshCw } from 'lucide-react';

export default function MarketOverview() {
  const [data, setData] = useState([
    { label: '台股加權指數 (IX0001)', value: 0, change: 0, changePct: 0, type: 'index' },
    { label: '櫃買指數 (OTC)', value: 0, change: 0, changePct: 0, type: 'index' },
    { label: '大盤預估成交量', value: '0', unit: '億', type: 'volume' }
  ]);

  useEffect(() => {
    const fetchMarketData = () => {
      Promise.all([
        fetch('/api/market/quote/IX0001').then(res => res.json()).catch(() => ({})),
        fetch('/api/market/quote/IX0043').then(res => res.json()).catch(() => ({}))
      ]).then(([tseRes, otcRes]) => {
        setData(prev => {
          const newData = [...prev];
          let totalVolume = 0;
          
          if (tseRes?.success && tseRes?.data) {
            const q = tseRes.data;
            newData[0] = {
              ...newData[0],
              value: q.closePrice || q.lastPrice || 0,
              change: q.change || 0,
              changePct: q.changePercent || 0
            };
            if (q.total && q.total.tradeValue) {
              totalVolume += q.total.tradeValue;
            }
          }
          
          if (otcRes?.success && otcRes?.data) {
            const q = otcRes.data;
            newData[1] = {
              ...newData[1],
              value: q.closePrice || q.lastPrice || 0,
              change: q.change || 0,
              changePct: q.changePercent || 0
            };
            if (q.total && q.total.tradeValue) {
              totalVolume += q.total.tradeValue;
            }
          }
          
          if (totalVolume > 0) {
            const volumeInYi = (totalVolume / 100000000).toLocaleString('en-US', { maximumFractionDigits: 0 });
            newData[2] = { ...newData[2], value: volumeInYi };
          }
          
          return newData;
        });
      });
    };

    fetchMarketData(); // initial load
    const intervalId = setInterval(fetchMarketData, 15000); // auto update every 15s
    
    return () => clearInterval(intervalId);
  }, []);

  const handleManualRefresh = () => {
    // Re-trigger the same logic
    Promise.all([
      fetch('/api/market/quote/IX0001').then(res => res.json()).catch(() => ({})),
      fetch('/api/market/quote/IX0043').then(res => res.json()).catch(() => ({}))
    ]).then(([tseRes, otcRes]) => {
      setData(prev => {
        const newData = [...prev];
        let totalVolume = 0;
        
        if (tseRes?.success && tseRes?.data) {
          const q = tseRes.data;
          newData[0] = {
            ...newData[0],
            value: q.closePrice || q.lastPrice || 0,
            change: q.change || 0,
            changePct: q.changePercent || 0
          };
          if (q.total && q.total.tradeValue) totalVolume += q.total.tradeValue;
        }
        
        if (otcRes?.success && otcRes?.data) {
          const q = otcRes.data;
          newData[1] = {
            ...newData[1],
            value: q.closePrice || q.lastPrice || 0,
            change: q.change || 0,
            changePct: q.changePercent || 0
          };
          if (q.total && q.total.tradeValue) totalVolume += q.total.tradeValue;
        }
        
        if (totalVolume > 0) {
          const volumeInYi = (totalVolume / 100000000).toLocaleString('en-US', { maximumFractionDigits: 0 });
          newData[2] = { ...newData[2], value: volumeInYi };
        }
        
        return newData;
      });
    });
  };

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
