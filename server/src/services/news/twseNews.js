import { logger } from '../../utils/logger.js';

// 取得上市重大訊息
export const fetchTwseAnnouncements = async () => {
  try {
    const res = await fetch('https://openapi.twse.com.tw/v1/opendata/t187ap04_L');
    if (!res.ok) return [];
    return await res.json();
  } catch (error) {
    logger.error('TWSE News', '取得上市重大訊息失敗', error);
    return [];
  }
};

// 取得上櫃重大訊息
export const fetchTpexAnnouncements = async () => {
  try {
    const res = await fetch('https://www.tpex.org.tw/openapi/v1/mops_t187ap04_O');
    if (!res.ok) return [];
    return await res.json();
  } catch (error) {
    logger.error('TWSE News', '取得上櫃重大訊息失敗', error);
    return [];
  }
};

export const getAllMajorAnnouncements = async () => {
  const [twse, tpex] = await Promise.all([
    fetchTwseAnnouncements(),
    fetchTpexAnnouncements()
  ]);
  return [...twse, ...tpex];
};

export const getAnnouncementsForSymbol = async (symbol) => {
  const all = await getAllMajorAnnouncements();
  return all.filter(item => item.公司代號 === symbol);
};
