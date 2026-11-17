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

  setInterval(async () => {
    try {
      const url = `https://webhook.site/token/${WEBHOOK_UUID}/requests?sorting=newest&per_page=5`;
      const res = await axios.get(url, { timeout: 4000 });
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

          // 保持 Set 在合理大小
          if (processedEventIds.size > 200) {
            const first = processedEventIds.values().next().value;
            processedEventIds.delete(first);
          }

          // 判斷事件時間：只處理 60 秒內的即時事件，避免重複處理太舊的過期訊息
          const eventAge = Date.now() - (ev.timestamp || Date.now());
          if (eventAge > 60000) {
            continue; // 超過 1 分鐘 replyToken 已失效，略過
          }

          logger.info('LINEBridge', `⚡ 即時捕獲群組訊息: "${ev.message?.text || ev.type}"`);
          handleLineWebhookEvent(ev).catch(err => {
            logger.error('LINEBridge', '處理群組訊息失敗: ' + err.message);
          });
        }
      }
    } catch (error) {
      // 網路暫時中斷時靜默重試
    }
  }, 2000); // 每 2 秒巡檢一次
};
