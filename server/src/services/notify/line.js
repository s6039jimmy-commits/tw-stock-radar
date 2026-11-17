import axios from 'axios';
import { logger } from '../../utils/logger.js';

/**
 * LINE Messaging API 推播模組
 * 支援將 HTML / 純文字轉換後推送到 LINE 群組或個人
 */

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
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = overrideTo || process.env.LINE_GROUP_ID || process.env.LINE_USER_ID;

  if (!token || !to) {
    // 若未設定 LINE Token，則靜默略過
    return false;
  }

  const text = htmlToLineText(message);
  if (!text) return false;

  const toList = String(to).split(',').map(s => s.trim()).filter(Boolean);
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
    logger.info('LINE', `LINE 訊息發送成功 (${toList.length} 個目標)`);
  }

  return anySuccess;
};
