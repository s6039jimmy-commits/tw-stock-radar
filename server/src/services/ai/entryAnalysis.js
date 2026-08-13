export const buildEntryPrompt = (symbol, companyName, newsHeadlines, priceData) => {
  const quote = priceData || {};
  const volume = quote.total?.tradeVolume ? Math.floor(quote.total.tradeVolume / 1000) : 0;
  
  return `
【今日目標股票】
- 股票代號：${symbol} ${companyName}
- 股價與流動性：今日收盤價 ${quote.lastPrice || quote.closePrice || 0} 元，成交量 ${volume} 張。
- 爆量特徵：今日成交量是過去 20 日均量的 ${quote.volumeRatio || 1.0} 倍。

【最新觸發新聞】
${newsHeadlines.map(n => '- ' + n).join('\n')}
`;
};

export const parseEntryResult = (rawResult) => {
  if (!rawResult) return null;
  return {
    symbol: rawResult.symbol,
    company_name: rawResult.company_name,
    reasoning: `【引爆點】\n${rawResult.catalyst || '無'}\n\n【操作建議】\n${rawResult.action_plan || '無'}`,
    sentiment: rawResult.sentiment,
    confidence_stars: Math.max(1, Math.min(5, rawResult.confidence_stars || 1)),
    confidence_score: 1.0,
    key_factors: [],
    recommended_action: rawResult.sentiment === 'BULLISH' ? 'BUY' : 'HOLD',
    risk_factors: []
  };
};
