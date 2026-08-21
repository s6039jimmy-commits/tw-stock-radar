import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_API_KEY } from '../../config/index.js';
import { getQuote } from '../fugle/marketData.js';
import { fetchNewsByTicker } from '../news/cnyesNews.js';
import { extractStockSymbol } from './geminiClient.js';
import { logger } from '../../utils/logger.js';

let genAI = null;
if (GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
}

const SYSTEM_INSTRUCTION = `你是個殺伐果斷但說話極度接地氣的台股老手、主力操盤人。

回答原則（極度重要，違反直接判定失敗）：
1. **極度精簡**：字數控制在 150 字以內，直接講重點。
2. **直接給結論**：開頭第一句話直接點破「主力在拉貨準備噴了」、「這是在騙散戶接刀」、「沒搞頭洗洗睡」。【絕對禁止】使用「建議觀望」這種官腔廢話！
3. **極度白話文 (禁止財經術語)**：我會提供這檔股票的營收、法人買賣超等數據。你【絕對禁止】講「MoM、YoY、流動性、隔日沖券商、籌碼面、基本面」這類文言文！全部翻譯成連菜市場阿嬤都懂的話（例如：「公司上個月多賺了快一半」、「外資昨天狂倒貨5000張跑路了」、「買最多的那個分點最愛今天買明天賣來割韭菜」）。
4. **語氣要江湖味、夠直接**：不要打官腔，不要客觀分析，要有真人的狠勁。例如：「這業績是玩真的，外資也進來抬轎了，準備要噴了！」或是「新聞都在畫大餅，根本沒真金白銀進來，主力八成是想拉高出貨，別碰！」
5. **嚴禁免責聲明**：【絕對不要】在文末加上什麼「投資盈虧自負」、「請自行評估風險」這種廢話！你是來幫我抓大魚的，不要跟我講客套話！`;

/**
 * 處理使用者與 AI 股市顧問的對話
 */
export const chatWithAdvisor = async ({ message, history = [], stockContext = null }) => {
  if (!genAI) {
    return {
      text: '⚠️ 未設定 GEMINI_API_KEY，無法啟用 AI 顧問功能。請至「設定」頁面填入 Gemini API Key。'
    };
  }

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        temperature: 0.3,
        topP: 0.8
      }
    });

    // 嘗試解析使用者訊息中的股票代號
    let targetSymbol = stockContext?.symbol;
    if (!targetSymbol) {
      targetSymbol = await extractStockSymbol(message);
    }

    // 若有對應股票，自動補充極致深度的量化數據
    let contextPrompt = '';
    if (targetSymbol) {
      try {
        const { getRevenueForSymbol } = await import('../fundamentals/revenue.js');
        const { getChipsForSymbol } = await import('../fundamentals/chips.js');
        const { getBrokerTracking } = await import('../fundamentals/brokerTracking.js');
        
        const [quote, news, revenue, chips, brokers] = await Promise.all([
          getQuote(targetSymbol),
          fetchNewsByTicker(targetSymbol, 3),
          getRevenueForSymbol(targetSymbol),
          getChipsForSymbol(targetSymbol),
          getBrokerTracking(targetSymbol)
        ]);
        
        contextPrompt = `\n【系統提供個股超深度量化數據 (務必根據此真實數據回答，嚴禁瞎掰)】：
股票代號：${targetSymbol} (${stockContext?.name || quote?.name || '台股'})
即時價格：NT$ ${quote?.lastPrice || quote?.closePrice || 'N/A'} (成交量: ${quote?.totalVolume || 'N/A'})
基本面(月營收)：${revenue ? JSON.stringify(revenue) : '無'}
籌碼面(三大法人)：${chips ? JSON.stringify(chips) : '無'}
主力分點(前五大買超券商與隔日沖判定)：${brokers && brokers.success ? JSON.stringify(brokers.topBuyers) : '無'}
近期頭條新聞：
${news.map((n, i) => `${i + 1}. ${n.title}`).join('\n')}
--------------------------------------------------\n`;
      } catch (e) {
        logger.warn('AI Chat', `取得 ${targetSymbol} 深度補充資料失敗`, e);
      }
    }

    // 格式化並過濾歷史對話，確保以 user 開頭且交替
    let validHistory = [];
    for (const item of history) {
      const role = item.role === 'user' ? 'user' : 'model';
      const text = item.text || item.content || '';
      
      if (validHistory.length === 0 && role === 'model') continue; // 捨棄開頭的 model 訊息
      
      if (validHistory.length > 0 && validHistory[validHistory.length - 1].role === role) {
        // 同角色合併
        validHistory[validHistory.length - 1].parts[0].text += '\n' + text;
      } else {
        validHistory.push({ role, parts: [{ text }] });
      }
    }

    // 若最後一筆是 user，也必須丟棄或處理，但因為這裡是傳給 history，目前的 request message 才是最新的 user 訊息
    // 所以 history 應該是以 model 結尾。如果是以 user 結尾會報錯
    if (validHistory.length > 0 && validHistory[validHistory.length - 1].role === 'user') {
      validHistory.pop();
    }

    // 開啟 Chat Session
    const chat = model.startChat({
      history: validHistory
    });

    const fullPrompt = `${contextPrompt}${message}`;
    const result = await chat.sendMessage(fullPrompt);
    const responseText = result.response.text();

    return {
      text: responseText,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('AI Chat', '與 AI 顧問對話失敗', error);
    return {
      text: `❌ AI 顧問暫時無法回應 (${error.message})，請稍後再試。`
    };
  }
};
