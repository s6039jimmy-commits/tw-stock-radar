export const buildEntryPrompt = (symbol, companyName, newsHeadlines, priceData) => {
  return `你是一位專業的台股分析師。現在要評估股票：${symbol} ${companyName} 是否適合進場。

【近期新聞標題】：
${newsHeadlines.map(n => '- ' + n).join('\n')}

【價格與技術面資料】：
${JSON.stringify(priceData)}

【分析指令】：
1. 請過濾掉與該公司基本面無關的「大盤盤後局勢」、「三大法人買賣超總結」等大盤罐頭新聞。
2. 專注於分析新聞中提到的「公司展望」、「營收預估」、「擴廠計畫」、「供應鏈異動」等基本面或題材面因素。
3. 結合價格/量比資料，給出具體的作多或作空理由。如果新聞全是無用的大盤資訊，請適當降低星星評分。
4. 【極度嚴格的評分標準】：
   - 4-5 顆星（強烈買進）：必須是「明確且重大的利多」，例如營收創歷史新高、取得爆發性大單、財測大幅上修。如果只是「法人看好」、「傳言預估」，最高只能給 3 顆星。
   - 請扮演最保守的機構法人，寧可錯殺也不要輕易給出 4 顆星。每天全市場只該有極少數股票配得上 4 星。
   - 如果缺乏強力基本面支撐，無論技術面多好，最高只能給 3 星。`;
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
