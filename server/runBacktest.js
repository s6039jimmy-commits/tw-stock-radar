import { runBacktestEngine } from './src/services/backtest/engine.js';

const symbol = process.argv[2] || '2330';
const years = parseInt(process.argv[3], 10) || 3;

const run = async () => {
  console.log(`\n🚀 開始執行 ${symbol} 過去 ${years} 年量化回測...`);
  const report = await runBacktestEngine(symbol, years);
  
  if (!report) {
    console.log('回測失敗。');
    process.exit(1);
  }

  console.log('\n=========================================');
  console.log(`📊 回測報表：${symbol} (${years}年)`);
  console.log('=========================================');
  console.log(`總交易次數：${report.totalTrades} 筆`);
  console.log(`勝率 (Win Rate)：${report.winRate}%`);
  console.log(`總報酬率 (Total Return)：${report.totalReturnPct}%`);
  console.log(`年化報酬率 (Annualized)：${report.annualizedReturn}%`);
  console.log(`最大回檔 (MDD)：${report.maxDrawdown}%`);
  console.log(`獲利因子 (Profit Factor)：${report.profitFactor}`);
  console.log('=========================================\n');
  
  if (report.trades.length > 0) {
    console.log('最近 5 筆交易紀錄：');
    report.trades.slice(-5).forEach((t, i) => {
      const pnl = t.profitPct > 0 ? `+${t.profitPct.toFixed(2)}%` : `${t.profitPct.toFixed(2)}%`;
      console.log(`${i+1}. 進場: ${t.entryDate} ($${t.entryPrice.toFixed(1)}) | 出場: ${t.exitDate} ($${t.exitPrice.toFixed(1)}) | 損益: ${pnl} (${t.reason})`);
    });
  }
};

run();
