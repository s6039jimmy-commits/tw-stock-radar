import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_API_KEY } from '../../config/index.js';
import { getQuote } from '../fugle/marketData.js';
import { fetchNewsByTicker } from '../news/cnyesNews.js';
import { logger } from '../../utils/logger.js';

let genAI = null;
if (GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
}

const SYSTEM_INSTRUCTION = `你是一位擁有 25 年台股實戰經驗的「頂尖量化策略顧問與台股 AI 導師」。
你專精台股籌碼面（外資/投信/自營商）、技術面（K線、均線MA、指標RSI/MACD/KD）、消息面（重大訊息、法說會、財報）以及風險控管。

回答原則：
1. **客觀專業**：結合技術面與基本面，給出明確、具體的分析，不含糊其詞。
2. **風險優先**：分析追高或做空風險時，強調停損點與交易紀律（如：跌破5日線停損、做空需注意融券餘額與強制回補風險）。
3. **格式清晰**：善用標點、條列式重點與 Emoji 呈現（例如：🟢 利多、🔴 利空、⚠️ 風險提示）。
4. **免責聲明**：文末簡短提醒「分析僅供參考，投資人應獨立判斷盈虧自負」。`;

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

    // 若對話包含個股上下文，嘗試自動補充即時行情與新聞數據
    let contextPrompt = '';
    if (stockContext && stockContext.symbol) {
      try {
        const quote = await getQuote(stockContext.symbol);
        const news = await fetchNewsByTicker(stockContext.symbol, 3);
        
        contextPrompt = `\n【系統提供個股即時數據資料】：
股票代號：${stockContext.symbol} (${stockContext.name || '台股'})
即時價格：NT$ ${quote?.lastPrice || quote?.closePrice || 'N/A'} (成交量: ${quote?.totalVolume || 'N/A'})
開盤/最高/最低：${quote?.openPrice || 'N/A'} / ${quote?.highPrice || 'N/A'} / ${quote?.lowPrice || 'N/A'}
近期頭條新聞：
${news.map((n, i) => `${i + 1}. ${n.title}`).join('\n')}
--------------------------------------------------\n`;
      } catch (e) {
        logger.warn('AI Chat', `取得 ${stockContext.symbol} 即時補充資料失敗`, e);
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
