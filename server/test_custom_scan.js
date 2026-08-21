/**
 * 用真實昨日數據，模擬跑一次 customScanner Layer 1
 * 看看到底能過幾檔、是哪些股票
 */
import fetch from 'node-fetch';
import { getHistoricalCandles } from './src/services/fugle/marketData.js';

// Step 1: 抓全市場籌碼
const fetchAllChips = async () => {
  const chipsMap = new Map();
  const [twseRes, tpexRes] = await Promise.all([
    fetch('https://openapi.twse.com.tw/v1/fund/T86').then(r => r.ok ? r.json() : []).catch(() => []),
    fetch('https://www.tpex.org.tw/openapi/v1/tpex_38').then(r => r.ok ? r.json() : []).catch(() => [])
  ]);

  for (const item of [...twseRes, ...tpexRes]) {
    const symbol = (item['證券代號'] || item['代號'])?.trim();
    if (!symbol || !/^\d{4}$/.test(symbol)) continue;
    const foreignRaw = item['外陸資買賣超股數(不含外資自營商)']
      || item['外資及陸資買賣超股數(不含外資自營商)']
      || '0';
    const trustRaw = item['投信買賣超股數'] || '0';
    const name = item['證券名稱'] || item['名稱'] || symbol;
    chipsMap.set(symbol, {
      name: name.trim(),
      foreignBuyLot: parseInt(foreignRaw.replace(/,/g, ''), 10) / 1000,
      trustBuyLot: parseInt(trustRaw.replace(/,/g, ''), 10) / 1000
    });
  }
  return chipsMap;
};

// Step 2: 取近 20 日 K 線
const getPast20DaysData = async (symbol) => {
  try {
    const toDate = new Date();
    toDate.setDate(toDate.getDate() - 1);
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 40);
    const from = fromDate.toISOString().split('T')[0];
    const to = toDate.toISOString().split('T')[0];
    const candles = await getHistoricalCandles(symbol, from, to);
    if (!candles || candles.length < 10) return null;
    const recent = candles.slice(-20);
    return {
      closes: recent.map(c => c.close),
      volumes: recent.map(c => c.volume || 0)
    };
  } catch (e) {
    return null;
  }
};

// 大型權值股清單（排除用）
const BLUE_CHIPS = new Set([
  '2330','2317','2454','2382','2412','3711','2308','2881','2882','2891',
  '2303','1301','1303','2886','2884','3034','2357','2002','1326','2885',
  '5880','2880','2892','2883','3037','2912','1101','2887','5871','2395',
  '3008','2615','4904','6669','2327','4938','2603','1216','2301','8046'
]);

const run = async () => {
  console.log('=== 專屬選股雷達 Layer 1 實測 ===\n');

  // 抓籌碼
  const chipsMap = await fetchAllChips();
  console.log(`全市場股票數: ${chipsMap.size} 檔\n`);

  // 條件 3 先過（便宜）
  let afterChips = [];
  for (const [symbol, chips] of chipsMap) {
    const fBuy = chips.foreignBuyLot;
    const tBuy = chips.trustBuyLot;
    if (!(fBuy > 0 || tBuy > 0)) continue;
    if (fBuy < -500 || tBuy < -500) continue;
    afterChips.push({ symbol, ...chips });
  }
  console.log(`條件3 (法人至少一方買超，另一方不大賣): ${afterChips.length} 檔通過\n`);

  // 條件 1,2,4 需要 K 線（分批跑避免 API 爆）
  const BATCH = 20;
  const layer1Passed = [];
  const layer1PassedBluechip = [];
  const layer1PassedNonBluechip = [];

  for (let i = 0; i < afterChips.length; i += BATCH) {
    const batch = afterChips.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async (stock) => {
      const data = await getPast20DaysData(stock.symbol);
      if (!data) return null;

      const { closes, volumes } = data;
      const yesterdayClose = closes[closes.length - 1];
      const yesterdayVolumeLot = volumes[volumes.length - 1] / 1000;

      // 條件 1
      if (yesterdayClose < 50) return null;
      // 條件 2
      if (yesterdayVolumeLot < 500) return null;
      // 條件 4
      const max20 = Math.max(...closes);
      if (yesterdayClose < max20 * 0.97) return null;

      return {
        symbol: stock.symbol,
        name: stock.name,
        close: yesterdayClose,
        volume: Math.round(yesterdayVolumeLot),
        foreign: stock.foreignBuyLot.toFixed(0),
        trust: stock.trustBuyLot.toFixed(0),
        max20,
        distToHigh: ((yesterdayClose / max20) * 100).toFixed(1) + '%',
        isBluechip: BLUE_CHIPS.has(stock.symbol)
      };
    }));

    for (const r of results) {
      if (!r) continue;
      layer1Passed.push(r);
      if (r.isBluechip) layer1PassedBluechip.push(r);
      else layer1PassedNonBluechip.push(r);
    }

    // 進度
    if ((i / BATCH) % 5 === 0) {
      console.log(`  掃描進度: ${Math.min(i + BATCH, afterChips.length)}/${afterChips.length}... (已通過: ${layer1Passed.length})`);
    }
  }

  console.log(`\n========== Layer 1 結果 ==========`);
  console.log(`總通過: ${layer1Passed.length} 檔`);
  console.log(`  大盤權值股: ${layer1PassedBluechip.length} 檔`);
  console.log(`  中小型/非權值: ${layer1PassedNonBluechip.length} 檔\n`);

  console.log('--- 非權值股清單（您關心的飆股候選）---');
  for (const r of layer1PassedNonBluechip) {
    console.log(`  ${r.symbol} ${r.name.padEnd(6)} | 昨收 NT$${r.close} | 量 ${r.volume}張 | 外資 ${r.foreign}張 投信 ${r.trust}張 | 距高點 ${r.distToHigh}`);
  }

  if (layer1PassedBluechip.length > 0) {
    console.log('\n--- 大盤權值股（會被 AI 過濾掉的）---');
    for (const r of layer1PassedBluechip) {
      console.log(`  ${r.symbol} ${r.name.padEnd(6)} | 昨收 NT$${r.close} | 量 ${r.volume}張 | 外資 ${r.foreign}張 投信 ${r.trust}張 | 距高點 ${r.distToHigh}`);
    }
  }

  console.log(`\n=== 結論 ===`);
  console.log(`每天 Layer 1 約通過 ${layer1Passed.length} 檔（其中非權值 ${layer1PassedNonBluechip.length} 檔）`);
  console.log(`經過 AI 5星嚴篩後，預估每天 0~1 檔 → 一週約 1~3 檔`);
};

run().catch(console.error);
