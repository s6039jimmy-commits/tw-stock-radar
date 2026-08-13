import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../../utils/logger.js';

// 知名隔日沖或波段大戶分點名單 (部分列舉)
const DAY_TRADER_BRANCHES = new Set([
  '凱基-台北', '富邦-建國', '元大-土城永寧', '康和-永和', '群益金鼎-大安', 
  '統一-城中', '國票-安和', '元大-松江', '美林', '摩根大通'
]);

/**
 * 抓取個股當日主力分點買賣超 (Top 5)
 * 這裡使用爬蟲技術抓取公開財經網站的券商進出資料
 * @param {string} symbol - 股票代號
 */
export const getBrokerTracking = async (symbol) => {
  try {
    // 這裡我們嘗試爬取公開財經網站的分點資料
    const url = `https://histock.tw/stock/branch.aspx?no=${symbol}`;
    
    // 為了避免被 Ban，加入 User-Agent
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 5000
    });

    const $ = cheerio.load(response.data);
    
    // 尋找買超前幾名 (根據該網站的表格結構)
    const topBuyers = [];
    
    // histock 分點進出的 class 通常是 .tb-stock 
    $('.tb-stock tbody tr').slice(0, 5).each((i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 3) {
        const branchName = $(tds[0]).text().trim();
        const buyVolume = parseInt($(tds[1]).text().replace(/,/g, ''), 10) || 0;
        
        if (branchName && buyVolume > 0 && branchName !== '券商名稱') {
          topBuyers.push({
            branch: branchName,
            volume: buyVolume,
            isDayTrader: DAY_TRADER_BRANCHES.has(branchName)
          });
        }
      }
    });

    if (topBuyers.length > 0) {
      return { success: true, source: 'HiStock', topBuyers };
    }

    // Fallback 如果爬不到，返回空
    return { success: false, reason: 'No data parsed', topBuyers: [] };

  } catch (error) {
    logger.warn('Broker Tracking', `無法抓取 ${symbol} 的分點資料: ${error.message}`);
    return { success: false, reason: error.message, topBuyers: [] };
  }
};
