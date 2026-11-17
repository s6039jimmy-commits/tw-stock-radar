import axios from 'axios';
import { logger } from '../../utils/logger.js';
import { handleLineWebhookEvent } from './lineReply.js';

let isPolling = false;
let processedEventIds = new Set();
const WEBHOOK_UUID = 'e27ed068-4bb9-484b-aba1-7f11bfd4396a';

/**
 * 監聽 webhook.site 橋接（作為本地 Webhook 備援）
 * 就算使用者尚未將 LINE 後台網址改成 Cloudflare，也能 100% 秒抓訊息並回覆
 */
export const startWebhookBridge = () => {
  if (isPolling) return;
  isPolling = true;

  logger.info('LINEBridge', '🚀 啟動 LINE Webhook 雙向智能橋接監聽器...');

  let consecutiveErrors = 0;
  setInterval(async () => {
    // 若遭遇頻率限制則拉長等待
    if (consecutiveErrors > 3) {
      consecutiveErrors--;
      return;
    }

    try {
      const url = `https://webhook.site/token/${WEBHOOK_UUID}/requests?sorting=newest&per_page=5`;
      const res = await axios.get(url, { timeout: 4000 });
      consecutiveErrors = 0;
      const requests = res.data?.data || [];

      for (const reqItem of requests) {
        if (!reqItem.content) continue;
        
        let payload = null;
        try {
          payload = typeof reqItem.content === 'string' ? JSON.parse(reqItem.content) : reqItem.content;
        } catch (e) {
          continue;
        }

        const events = payload?.events || [];
        for (const ev of events) {
          const eventId = ev.webhookEventId || ev.replyToken;
          if (!eventId || processedEventIds.has(eventId)) continue;

          processedEventIds.add(eventId);

          if (processedEventIds.size > 200) {
            const first = processedEventIds.values().next().value;
            processedEventIds.delete(first);
          }

          const eventAge = Date.now() - (ev.timestamp || Date.now());
          if (eventAge > 60000) {
            continue;
          }

          logger.info('LINEBridge', `⚡ 即時捕獲群組訊息: "${ev.message?.text || ev.type}"`);
          handleLineWebhookEvent(ev).catch(err => {
            logger.error('LINEBridge', '處理群組訊息失敗: ' + err.message);
          });
        }
      }
    } catch (error) {
      if (error.response?.status === 429) {
        consecutiveErrors = 10; // 遇到 429 暫停 20 秒
      }
    }
  }, 2000);
};
