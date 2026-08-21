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

const SYSTEM_INSTRUCTION = `
你現在是一個「沒有感情的數據播報機器」，嚴禁使用任何官腔、廢話，也絕對、絕對、絕對不准說出「觀望」、「建議觀望」、「先觀望」這幾個字！
只要使用者問到某檔股票，你只需要做一件事：用最白話、最兇狠的江湖語氣，把系統提供的數據「翻譯」出來，並且給出明確的「原因」。

【必須遵守的鐵血格式】（請嚴格依照此四點回答，不准多講廢話）：
1. 籌碼動向：直接講外資跟投信有沒有買，主力是不是隔日沖。
2. 營收表現：直接講賺錢還賠錢，不准講 MoM、YoY。
3. 判斷原因：明確告訴使用者「你推薦」或「你不推薦」的具體原因是什麼（※注意：括號內為舉例，【絕對不准照抄摩根大通的例子】。如果系統傳入的資料是「無」，你必須誠實回答「目前缺乏最新數據，無法精準判斷」，不准自己瞎掰！）。
4. 結論：
   - 如果他已經持有：直接給出場條件（例如：既然在車上，跌破五日線就拔檔）。
   - 如果他沒有持有：依照剛才的「判斷原因」，直接叫他買還是不要碰。

絕對不要給出模稜兩可的猜測，因為你的溫度值已經被設定為 0，你每次回答都必須基於數學數據給出唯一解。
絕對禁止講「MoM、YoY、流動性、隔日沖券商、籌碼面、基本面」這類文言文！全部翻譯成連菜市場阿嬤都懂的話。
嚴禁免責聲明：【絕對不要】在文末加上什麼「投資盈虧自負」、「請自行評估風險」這種廢話！你是來幫我抓大魚的，不要跟我講客套話！`;

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
        temperature: 0.0,
        topP: 0.1
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
        
        const { getActivePositions } = await import('../../db/database.js');
        const activePositions = await getActivePositions();
        const userPosition = activePositions.find(p => p.symbol === targetSymbol);

        const [quote, news, revenue, chips, brokers] = await Promise.all([
          getQuote(targetSymbol),
          fetchNewsByTicker(targetSymbol, 3),
          getRevenueForSymbol(targetSymbol),
          getChipsForSymbol(targetSymbol),
          getBrokerTracking(targetSymbol)
        ]);
        
        let positionInfo = userPosition 
          ? `\n⚠️ 【重要提醒：使用者目前持有此檔股票！】\n進場價：NT$ ${userPosition.entry_price}\n進場時間：${userPosition.entry_date}\n請根據「持有者」的立場給予續抱、停利或停損的具體建議，不要叫他不要追高，因為他已經買了！` 
          : '\n使用者目前「未持有」此檔股票。';

        contextPrompt = `\n【系統提供個股超深度量化數據 (務必根據此真實數據回答，嚴禁瞎掰)】：
股票代號：${targetSymbol} (${stockContext?.name || quote?.name || '台股'})${positionInfo}
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
    let responseText = result.response.text();
    
    // 強制過濾歷史對話帶來的殘留語氣
    responseText = responseText.replace(/\(量化評估結果，投資盈虧自負\)/g, '');
    responseText = responseText.replace(/建議觀望/g, '這檔沒搞頭');

    return {
      text: responseText.trim(),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('AI Chat', '與 AI 顧問對話失敗', error);
    return {
      text: `❌ AI 顧問暫時無法回應 (${error.message})，請稍後再試。`
    };
  }
};
