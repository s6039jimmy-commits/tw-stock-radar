import axios from 'axios';
import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 常見熱門股代碼對應
const STOCK_NAME_MAP = {
  '台積電': '2330',
  '鴻海': '2317',
  '聯發科': '2454',
  '廣達': '2382',
  '大盤': 'IX0001',
  '加權指數': 'IX0001',
  '0050': '0050',
  '0056': '0056',
  '006208': '006208',
  '00919': '00919',
  '00929': '00929'
};

/**
 * 回覆 LINE 訊息 (使用 replyToken，不消耗每月的 200 則 Push 額度，完全免費)
 */
export const replyLineMessage = async (replyToken, text) => {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || await import('./line.js').then(m => m.sendLineMessage ? null : null);
  // 直接透過 line.js 取得最新動態 token
  const { sendLineMessage } = await import('./line.js');
  // 從 line.js 獲取動態 token 支援
  const channelId = process.env.LINE_CHANNEL_ID;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  let accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken && channelId && channelSecret) {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', channelId);
    params.append('client_secret', channelSecret);
    const res = await axios.post('https://api.line.me/v2/oauth/accessToken', params);
    accessToken = res.data.access_token;
  }

  if (!accessToken || !replyToken) return false;

  try {
    const res = await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken,
        messages: [{ type: 'text', text }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        timeout: 10000
      }
    );
    return res.status === 200;
  } catch (error) {
    logger.error('LINEReply', '回覆失敗: ' + (error.response?.data?.message || error.message));
    return false;
  }
};

/**
 * 分析群組使用者對機器人的提問，並產出高情商、大白話的解答
 */
export const processUserQuestion = async (userText) => {
  // 1. 去除 @提及 標籤，取得乾淨的使用者提問
  const cleanQuery = userText.replace(/@\S+/g, '').trim();
  if (!cleanQuery) {
    return '老闆您好！有什麼股市問題想問我嗎？例如：\n• @我 2330 怎麼看？\n• @我 大盤今天還能追嗎？\n• @我 006208 能加碼嗎？';
  }

  // 2. 檢查是否有提及個股代碼或股票名稱
  let detectedSymbol = null;
  const symbolMatch = cleanQuery.match(/\b\d{4,6}\b/);
  if (symbolMatch) {
    detectedSymbol = symbolMatch[0];
  } else {
    for (const [name, sym] of Object.entries(STOCK_NAME_MAP)) {
      if (cleanQuery.includes(name)) {
        detectedSymbol = sym;
        break;
      }
    }
  }

  let quoteInfo = '';
  if (detectedSymbol) {
    try {
      const q = await getQuote(detectedSymbol);
      if (q) {
        const price = q.closePrice || q.lastPrice || 0;
        const change = parseFloat(q.change || 0);
        const changePct = parseFloat(q.changePercent || 0);
        const sign = change >= 0 ? '+' : '';
        const name = q.name || detectedSymbol;
        quoteInfo = `\n【${detectedSymbol} ${name} 即時行情】：成交價 NT$ ${price} (${sign}${change} / ${sign}${changePct}%)`;
      }
    } catch (e) {
      logger.warn('LINEReply', `查詢報價 ${detectedSymbol} 失敗: ` + e.message);
    }
  }

  // 3. AI 分析生成回答 (幽默、主觀、逗趣、不官方)
  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.7 }
      });

      const prompt = `你是一個在 LINE 群組裡的股市靈魂人物「財神熊」🐻。你的個性極度有主見、講話超逗趣、接地氣、幽默好笑又敢愛敢恨，就像群組裡最會嘴砲又看盤神準的資深損友！
群組朋友 @你 提問：「${cleanQuery}」
${quoteInfo ? quoteInfo : ''}

【你的回覆風格規則】：
1. 嚴禁任何官方、客套、客服或機器人腔調！不要講廢話。
2. 語氣要非常「主觀、幽默、逗趣、嘴砲接地氣」，多用有趣的鄉民股市梗（如：接飛刀、當韭菜、主力數鈔票、喝下午茶、衝天砲、吃雞排）。
3. 結論一定要超級主觀明確，直接給：【加倉】、【賣一點】或【觀望】（三擇一），並用一句逗趣生動的理由說明。
4. 字數控制在 80~140 字左右，好笑、好懂、一眼秒笑秒懂。
5. 嚴禁出現「老手」、「投資盈虧自負」、「請謹慎評估」等任何官方免責廢話。`;

      const res = await model.generateContent(prompt);
      const text = res.response.text().trim();
      if (text) return text;
    } catch (err) {
      logger.warn('LINEReply', 'Gemini API 異常，啟用逗趣主觀智慧備援規則: ' + err.message);
    }
  }

  // 4. 幽默逗趣主觀備援規則 (若 Gemini 402 或無 API Key)
  if (detectedSymbol && quoteInfo) {
    // 根據漲跌動態產出極具個性與幽默感的吐槽
    let funnyVerdict = '';
    let action = '【觀望】';
    let funnyReason = '';

    // 解析漲跌
    const isBigDrop = quoteInfo.includes('(-') && (quoteInfo.includes('-1.') || quoteInfo.includes('-2.') || quoteInfo.includes('-3.') || quoteInfo.includes('-4.'));
    const isBigUp = quoteInfo.includes('(+' ) && (quoteInfo.includes('+1.') || quoteInfo.includes('+2.') || quoteInfo.includes('+3.') || quoteInfo.includes('+4.'));

    if (isBigDrop) {
      funnyVerdict = '哎唷喂呀！今天這根殺得鼻青臉腫，主力直接把散戶當韭菜在割！現在衝進去不是抄底，根本是用臉去擋砂石車。';
      action = '【觀望】';
      funnyReason = '手綁起來先去喝杯珍奶冷靜一下，別急著當烈士接飛刀，看主力下午要怎麼收場！';
    } else if (isBigUp) {
      funnyVerdict = '哇靠這檔今天吃大力丸逆！多頭整個殺紅了眼狂噴，主力開著火箭在衝鋒，爽度破表！';
      action = '【加倉】';
      funnyReason = '想跟著主力喝點肉湯可以，但別閉著眼睛硬追天花板，等盤中壓回支撐再分批上車！';
    } else {
      funnyVerdict = '盤成這樣本熊都要睡著了，多空雙方都在打瞌睡，主力在旁邊剔牙剔得很開心，沒啥搞頭。';
      action = '【觀望】';
      funnyReason = '無聊盤整不用瞎忙送手續費，持股抱好不要亂動，把時間拿去吃頓好的卡實在！';
    }

    return `🐻 財神熊掐指一算：\n${quoteInfo}\n\n${funnyVerdict}\n\n• 本熊主觀建議：${action} — 原因：${funnyReason}`;
  }

  return `🐻 財神熊有話直說：\n問「${cleanQuery}」是吧？本熊主觀認為現在大盤跟坐雲霄飛車一樣刺激，主力都在搞心態！\n\n• 本熊操作建議：【觀望】— 原因：看不懂就不要硬送錢給主力花，抱緊現金就是王道，先翹腳在旁邊看主力耍猴戲！`;
};

/**
 * 處理 Webhook 收到的訊息事件
 */
export const handleLineWebhookEvent = async (event) => {
  if (event.type !== 'message' || event.message?.type !== 'text') {
    return false;
  }

  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  // 判斷是否為群組訊息
  const isGroup = event.source?.type === 'group' || event.source?.type === 'room';

  if (isGroup) {
    // 在群組內：只有當 @機器人 或 提到「財神熊」或 開頭包含「@」或「?」才觸發回覆
    const isMentioned = event.message.mention?.mentees?.some(m => m.isSelf === true) 
      || text.includes('@') 
      || text.includes('財神熊') 
      || text.startsWith('!')
      || text.startsWith('/');

    if (!isMentioned) {
      return false; // 在群組裡平常聊天不打擾
    }
  }

  logger.info('LINEReply', `收到提問: "${text}" (replyToken: ${replyToken})`);
  const replyContent = await processUserQuestion(text);
  const ok = await replyLineMessage(replyToken, replyContent);
  logger.info('LINEReply', `回覆結果: ${ok ? '成功' : '失敗'}`);
  return ok;
};
