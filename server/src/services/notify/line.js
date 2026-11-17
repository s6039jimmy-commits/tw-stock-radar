import axios from 'axios';
import { logger } from '../../utils/logger.js';

/**
 * LINE Messaging API 推播模組
 * 支援將 HTML / 純文字轉換後推送到 LINE 群組或個人
 * 內建 Token 自動發行與過期自動刷新機制 (使用 Channel ID + Secret)
 */

let cachedAccessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  // 1. 若環境變數已直接提供長期 Token，優先使用
  if (process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    return process.env.LINE_CHANNEL_ACCESS_TOKEN;
  }

  // 2. 若有快取且尚未過期 (保留 1 小時緩衝)
  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt - 3600000) {
    return cachedAccessToken;
  }

  // 3. 使用 Channel ID 與 Channel Secret 動態取得官方 Token
  const channelId = process.env.LINE_CHANNEL_ID || '2012651187';
  const channelSecret = process.env.LINE_CHANNEL_SECRET || 'a6841f1c4a39a3d52fb48b55a364ac16';

  if (!channelId || !channelSecret) {
    return null;
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', channelId);
    params.append('client_secret', channelSecret);

    const res = await axios.post('https://api.line.me/v2/oauth/accessToken', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000
    });

    if (res.data?.access_token) {
      cachedAccessToken = res.data.access_token;
      tokenExpiresAt = now + (res.data.expires_in || 2592000) * 1000;
      logger.info('LINE', 'LINE 官方存取權杖 (Token) 自動簽發/更新成功');
      return cachedAccessToken;
    }
  } catch (error) {
    const errDetail = error.response?.data?.error_description || error.message;
    logger.error('LINE', '取得 LINE Access Token 失敗: ' + errDetail);
  }

  return null;
}

function htmlToLineText(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<b>(.*?)<\/b>/gi, '$1')
    .replace(/<code>(.*?)<\/code>/gi, '$1')
    .replace(/<pre>(.*?)<\/pre>/gis, '$1')
    .replace(/<a\s+href="([^"]+)">(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export const sendLineMessage = async (message, overrideTo = null) => {
  const token = await getAccessToken();
  const rawTo = overrideTo || process.env.LINE_GROUP_ID || process.env.LINE_USER_ID || 'Ccd0cb00fc7b0c603fc42e3609d65e556';

  if (!token || !rawTo) {
    // 若未設定 LINE 相關設定，則靜默略過
    return false;
  }

  const text = htmlToLineText(message);
  if (!text) return false;

  const toList = String(rawTo).split(',').map(s => s.trim()).filter(Boolean);
  let anySuccess = false;

  for (const targetId of toList) {
    try {
      const res = await axios.post(
        'https://api.line.me/v2/bot/message/push',
        {
          to: targetId,
          messages: [
            {
              type: 'text',
              text: text
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          timeout: 10000
        }
      );

      if (res.status === 200) {
        anySuccess = true;
      }
    } catch (error) {
      const errDetail = error.response?.data?.message || error.message;
      logger.error('LINE', `發送訊息至 LINE (${targetId}) 失敗: ${errDetail}`);
    }
  }

  if (anySuccess) {
    logger.info('LINE', `LINE 訊息推播成功 (${toList.length} 個目標)`);
  }

  return anySuccess;
};
