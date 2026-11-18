import { logger } from '../../utils/logger.js';

const PING_INTERVAL_MS = 8 * 60 * 1000; // 每 8 分鐘自發心跳 (Render 免費版 15 分鐘無連線自動休眠)

export const initKeepAlive = () => {
  // 本機開發環境不需對外發送心跳
  if (process.env.DISABLE_SCHEDULER === 'true') {
    return;
  }

  const renderUrl = process.env.RENDER_EXTERNAL_URL || 'https://tw-stock-radar-mhlm.onrender.com';
  const targetUrl = `${renderUrl.replace(/\/$/, '')}/health`;

  logger.info('KeepAlive', `🛡️ 防休眠心跳機制已啟動，目標: ${targetUrl} (每 8 分鐘發送一次)`);

  const ping = async () => {
    try {
      const res = await fetch(targetUrl);
      if (res.ok) {
        logger.debug('KeepAlive', '💓 防休眠心跳成功');
      } else {
        logger.warn('KeepAlive', `心跳回傳非 200 狀態: ${res.status}`);
      }
    } catch (err) {
      logger.warn('KeepAlive', '防休眠心跳異常: ' + err.message);
    }
  };

  // 啟動 60 秒後發送第一次，隨後每 8 分鐘循環一次
  setTimeout(() => {
    ping();
    setInterval(ping, PING_INTERVAL_MS);
  }, 60 * 1000);
};
