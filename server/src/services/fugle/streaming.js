import { WebSocketClient } from '@fugle/marketdata';
import { FUGLE_API_KEY } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { EventEmitter } from 'events';

export const streamEmitter = new EventEmitter();
let wsClient = null;
let connected = false;
let subscriptions = new Set();

export const connect = async () => {
  if (!FUGLE_API_KEY) {
    logger.warn('Fugle WS', '未設定 API Key，跳過連線');
    return;
  }
  try {
    wsClient = new WebSocketClient({ apiKey: FUGLE_API_KEY });
    const stock = wsClient.stock;
    
    stock.on('connect', () => {
      connected = true;
      logger.info('Fugle WS', 'WebSocket 連線成功');
      // 重新訂閱
      for (const symbol of subscriptions) {
        stock.intraday.quote({ symbol });
        stock.intraday.trades({ symbol });
      }
    });

    stock.on('disconnect', () => {
      connected = false;
      logger.warn('Fugle WS', 'WebSocket 連線中斷，嘗試重新連線');
    });

    stock.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        if (data.event === 'data' && data.data) {
          if (data.data.size !== undefined) {
            streamEmitter.emit('trade-update', data.data);
          } else {
            streamEmitter.emit('price-update', data.data);
          }
        }
      } catch (e) {
        // 解析錯誤忽略
      }
    });

    await wsClient.connect();
  } catch (error) {
    logger.error('Fugle WS', 'WebSocket 連線失敗', error);
  }
};

export const disconnect = () => {
  if (wsClient && connected) {
    wsClient.disconnect();
    connected = false;
  }
};

export const subscribe = (symbol) => {
  subscriptions.add(symbol);
  if (connected && wsClient) {
    wsClient.stock.intraday.quote({ symbol });
    wsClient.stock.intraday.trades({ symbol });
  }
};

export const unsubscribe = (symbol) => {
  subscriptions.delete(symbol);
  // Fugle API 不一定有明確 unsubscribe，這裡只需從清單移除
};
