export const buildEntryPrompt = (symbol, companyName, newsHeadlines, priceData) => {
  return `你是一位專業的台股分析師。現在要評估股票：${symbol} ${companyName} 是否適合進場。

【近期新聞標題】：
${newsHeadlines.map(n => '- ' + n).join('\n')}

【價格與技術面資料】：
${JSON.stringify(priceData)}

【分析指令】：
1. 請過濾掉與該公司基本面無關的「大盤盤後局勢」、「三大法人買賣超總結」等大盤罐頭新聞。
2. 專注於分析新聞中提到的「公司展望」、「營收預估」、「擴廠計畫」、「供應鏈異動」等基本面或題材面因素。
3. 結合價格/量比資料，給出具體的作多或作空理由。如果新聞全是無用的大盤資訊，請適當降低星星評分。`;
};

export const parseEntryResult = (rawResult) => {
  if (!rawResult) return null;
  return {
    symbol: rawResult.symbol,
    company_name: rawResult.company_name,
    reasoning: rawResult.reasoning,
    sentiment: rawResult.sentiment,
    confidence_stars: Math.max(1, Math.min(5, rawResult.confidence_stars || 1)),
    confidence_score: rawResult.confidence_score,
    key_factors: rawResult.key_factors || [],
    recommended_action: rawResult.recommended_action,
    risk_factors: rawResult.risk_factors || []
  };
};
