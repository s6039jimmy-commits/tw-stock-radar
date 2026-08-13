import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Bot, Send, Trash2, Sparkles, TrendingUp, ShieldAlert, FileText, ArrowRight, User } from 'lucide-react';

export default function ChatPage() {
  const location = useLocation();
  const stockContext = location.state?.stockContext || null;

  const [messages, setMessages] = useState([
    {
      role: 'model',
      text: '你好！我是你的專屬 AI 台股顧問與量化戰友 🤖。\n你可以問我任何關於個股強弱、新聞解析、做空風險或停損策略的問題。請選取下方快捷指令或直接輸入你的疑問！',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 當有股票 context 時，加入歡迎提示
  useEffect(() => {
    if (stockContext) {
      const isAlreadyAdded = messages.some(m => m.stockSymbol === stockContext.symbol);
      if (!isAlreadyAdded) {
        setMessages(prev => [
          ...prev,
          {
            role: 'model',
            stockSymbol: stockContext.symbol,
            text: `🎯 已帶入股票焦點：**${stockContext.symbol} ${stockContext.name || ''}**\n你想了解這檔股票的哪方面資訊？例如「現在做空安全嗎？」或「請幫我詳細分析這則新聞」。`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    }
  }, [stockContext, messages]);

  const handleSend = async (customText = null) => {
    const textToSend = customText || input;
    if (!textToSend.trim() || loading) return;

    const userMsg = {
      role: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customText) setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: messages.slice(-6).map(m => ({ role: m.role, text: m.text })),
          stockContext: stockContext
        })
      });

      const data = await res.json();
      if (data.success && data.data) {
        setMessages(prev => [
          ...prev,
          {
            role: 'model',
            text: data.data.text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          {
            role: 'model',
            text: '❌ 抱歉，AI 暫時無法回應，請確認金鑰設定。',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    } catch (e) {
      setMessages(prev => [
        ...prev,
        {
          role: 'model',
          text: '❌ 發生連線錯誤: ' + e.message,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickPrompts = stockContext ? [
    { label: `🛡️ ${stockContext.symbol} 現在做空安全嗎？`, text: `請問 ${stockContext.symbol} ${stockContext.name || ''} 現在做空安全嗎？有哪些融券與技術面風險？` },
    { label: `📰 請詳細解析這檔的新聞與籌碼`, text: `請幫我詳細分析 ${stockContext.symbol} ${stockContext.name || ''} 最近的重大新聞與籌碼利多/利空影響。` },
    { label: `🚀 這檔適合追高或分批進場嗎？`, text: `請問 ${stockContext.symbol} 現在的價位適合追高或分批佈局嗎？` },
    { label: `🎯 建議的停損與停利點位`, text: `若我現在進場 ${stockContext.symbol}，建議的嚴格停損價格與目標停利價格是多少？` }
  ] : [
    { label: "🛡️ 某檔爆量飆股現在做空安全嗎？", text: "如果一檔中 শক্তিশালী股今天爆量大漲，現在做空安全嗎？有哪些融券回補或拉高洗盤風險？" },
    { label: "📰 收到 4 星利多推播後如何二次確認？", text: "收到系統的 4 星進場推播通知後，我在下單前應該做哪些技術線型與籌碼的二次確認？" },
    { label: "📊 分析今日台股大盤趨勢與操作避坑指南", text: "請分析當前台股大盤的整體趨勢，以及現階段操作台股最需要注意的坑與風險控管重點。" },
    { label: "📉 股票被套牢跌破5日線該如何處置？", text: "如果持有的股票跌破5日均線(MA5)且帳面虧損，建議如何制定停損紀律？" }
  ];

  return (
    <div className="w-full h-[calc(100dvh-60px)] md:h-screen flex flex-col bg-white md:bg-[var(--bg-primary)]">
      <div className="w-full h-full max-w-4xl mx-auto flex flex-col md:border-x border-[var(--card-border)] bg-white md:bg-[var(--card-bg)] shadow-sm relative z-10">
        
        {/* 對話框 Header */}
        <div className="p-3 md:p-4 border-b border-[var(--card-border)] bg-white/95 md:bg-[var(--card-bg)] flex items-center justify-between shrink-0 sticky top-0 z-20">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
              <Bot size={20} className="md:w-6 md:h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                <h3 className="font-bold text-sm md:text-base text-primary truncate">AI 策略顧問</h3>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] md:text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1 shrink-0"></span>
                  Gemini 在線
                </span>
              </div>
              <p className="text-[10px] md:text-xs text-muted truncate">即時解答個股疑慮與新聞深析</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button 
              onClick={() => setMessages([{
                role: 'model',
                text: '對話已重設。請問有什麼我可以協助你的嗎？',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }])}
              className="p-2 text-muted hover:text-rose-400 rounded-lg hover:bg-black/5 transition-colors"
              title="清除聊天紀錄"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* 焦點股票標籤提示 */}
        {stockContext && (
          <div className="px-4 py-2 bg-blue-500/10 border-b border-blue-500/20 flex items-center justify-between text-xs text-blue-300">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-blue-400 animate-pulse" />
              <span>當前焦點：<b>{stockContext.symbol} {stockContext.name}</b> (NT$ {stockContext.price || '即時報價'})</span>
            </div>
          </div>
        )}

        {/* 訊息對話區 */}
        <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`flex gap-3 max-w-[88%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-indigo-600/30 border border-indigo-500/30 text-indigo-300'
              }`}>
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>

              <div className="flex flex-col gap-1">
                <div className={`p-3.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-white/5 border border-white/10 text-primary rounded-tl-none'
                }`}>
                  {msg.text}
                </div>
                <span className={`text-[10px] text-muted px-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                  {msg.timestamp}
                </span>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 mr-auto max-w-[88%]">
              <div className="w-8 h-8 rounded-full bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 flex items-center justify-center shrink-0">
                <Bot size={16} />
              </div>
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 rounded-tl-none flex items-center gap-2 text-muted text-sm">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"></span>
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-delay:0.4s]"></span>
                <span className="ml-1 text-xs">AI 顧問正在研判大盤數據與籌碼...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 快捷指令 Quick Prompts */}
        <div className="p-3 bg-white/95 md:bg-black/20 flex flex-col gap-2 shadow-[0_-4px_10px_rgba(0,0,0,0.02)] z-20 border-t border-slate-100 md:border-[var(--card-border)]">
          <div className="text-[11px] text-slate-500 md:text-muted flex items-center gap-1 font-medium">
            <Sparkles size={12} className="text-amber-500 md:text-amber-400" />
            <span>快捷提問推薦（點擊直接詢問）：</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {quickPrompts.map((qp, i) => (
              <button
                key={i}
                onClick={() => handleSend(qp.text)}
                disabled={loading}
                className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 transition-all flex items-center gap-1 md:bg-white/5 md:border-white/10 md:text-secondary md:hover:text-blue-300 md:hover:border-blue-500/40"
              >
                <span>{qp.label}</span>
                <ArrowRight size={12} className="opacity-60" />
              </button>
            ))}
          </div>
        </div>

        {/* 輸入框 Input Bar */}
        <div 
          className="p-3 bg-white md:bg-[var(--card-bg)] flex items-center gap-2 z-20 shadow-[0_-4px_15px_rgba(0,0,0,0.04)]"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={stockContext ? `詢問關於 ${stockContext.symbol} 的任何問題...` : "輸入你的問題 (例如：這檔現在做空安全嗎？)"}
            rows="1"
            className="input flex-1 resize-none py-3 text-sm bg-slate-100 text-slate-900 placeholder-slate-400 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:bg-black/30 md:text-white md:placeholder-white/40 shadow-inner rounded-xl"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="btn btn-primary p-3 rounded-xl shrink-0 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30"
          >
            <Send size={18} />
          </button>
        </div>

      </div>
    </div>
  );
}
