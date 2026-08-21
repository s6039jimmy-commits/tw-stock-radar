import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bot, Send, Trash2, Sparkles, TrendingUp, ShieldAlert, FileText, ArrowRight, User, ArrowLeft } from 'lucide-react';
import './ChatPage.css';

export default function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
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

  // 鎖死 body 滾動，避免 iOS 鍵盤彈出時把整個網頁往上推
  useEffect(() => {
    document.body.classList.add('chat-active');
    
    // 監聽鍵盤彈出導致的視窗高度改變，重新滾動到底部
    const handleResize = () => {
      setTimeout(scrollToBottom, 100);
    };
    
    window.visualViewport?.addEventListener('resize', handleResize);
    window.addEventListener('resize', handleResize);

    return () => {
      document.body.classList.remove('chat-active');
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

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
    { label: "🛡️ 某檔爆量飆股現在做空安全嗎？", text: "如果一檔中小型股今天爆量大漲，現在做空安全嗎？有哪些融券回補或拉高洗盤風險？" },
    { label: "📰 收到 4 星利多推播後如何二次確認？", text: "收到系統的 4 星進場推播通知後，我在下單前應該做哪些技術線型與籌碼的二次確認？" },
    { label: "📊 分析今日台股大盤趨勢與操作避坑指南", text: "請分析當前台股大盤的整體趨勢，以及現階段操作台股最需要注意的坑與風險控管重點。" },
    { label: "📉 股票被套牢跌破5日線該如何處置？", text: "如果持有的股票跌破5日均線(MA5)且帳面虧損，建議如何制定停損紀律？" }
  ];

  return (
    <div className="chat-page-container animate-fade-in">
      <div className="chat-inner-container">
        
        {/* 對話框 Header */}
        <div className="chat-header">
          <div className="chat-header-left">
            <button 
              onClick={() => navigate(-1)} 
              className="btn btn-ghost p-1 mr-1"
              title="返回"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="chat-avatar">
              <Bot size={20} />
            </div>
            <div className="chat-header-text">
              <div className="chat-title-row">
                <h3 className="chat-title">AI 策略顧問</h3>
                <span className="chat-tag">
                  <span style={{width:'6px', height:'6px', borderRadius:'50%', backgroundColor:'#34d399', marginRight:'4px'}}></span>
                  Gemini 在線
                </span>
              </div>
              <p className="chat-subtitle">即時解答個股疑慮與新聞深析</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button 
              onClick={() => setMessages([{
                role: 'model',
                text: '對話已重設。請問有什麼我可以協助你的嗎？',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }])}
              className="btn btn-ghost p-2"
              title="清除聊天紀錄"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* 焦點股票標籤提示 */}
        {stockContext && (
          <div style={{padding:'8px 16px', backgroundColor:'rgba(59,130,246,0.1)', borderBottom:'1px solid rgba(59,130,246,0.2)', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:'12px', color:'#60a5fa'}}>
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-blue-400" />
              <span>當前焦點：<b>{stockContext.symbol} {stockContext.name}</b> (NT$ {stockContext.price || '即時報價'})</span>
            </div>
          </div>
        )}

        {/* 訊息對話區 */}
        <div className="chat-messages">
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`msg-wrapper ${msg.role === 'user' ? 'user' : 'model'}`}
            >
              <div className="chat-avatar" style={{width:'2rem', height:'2rem', borderRadius:'50%', background: msg.role==='user'?'#2563eb':'rgba(79,70,229,0.3)', border:msg.role==='user'?'none':'1px solid rgba(79,70,229,0.3)'}}>
                {msg.role === 'user' ? <User size={16} color="white" /> : <Bot size={16} color="#a5b4fc" />}
              </div>

              <div className="flex flex-col gap-1">
                <div className="msg-bubble">
                  {msg.text}
                </div>
                <span style={{fontSize:'10px', color:'var(--text-muted)', padding:'0 4px', textAlign: msg.role === 'user' ? 'right' : 'left'}}>
                  {msg.timestamp}
                </span>
              </div>
            </div>
          ))}

          {loading && (
            <div className="msg-wrapper model">
              <div className="chat-avatar" style={{width:'2rem', height:'2rem', borderRadius:'50%', background:'rgba(79,70,229,0.3)', border:'1px solid rgba(79,70,229,0.3)'}}>
                <Bot size={16} color="#a5b4fc" />
              </div>
              <div className="msg-bubble" style={{display:'flex', alignItems:'center'}}>
                <div className="typing-indicator">
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>


        {/* 輸入框 Input Bar */}
        <div className="chat-input-bar">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setTimeout(scrollToBottom, 150)}
            placeholder={stockContext ? `詢問關於 ${stockContext.symbol}...` : "輸入您的問題"}
            rows="1"
            className="chat-input"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="btn btn-primary chat-send-btn"
          >
            <Send size={18} />
          </button>
        </div>

      </div>
    </div>
  );
}
