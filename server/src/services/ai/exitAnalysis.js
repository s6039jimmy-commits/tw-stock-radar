export const buildExitPrompt = (symbol, companyName, position, newsHeadlines) => {
  return `持股：${symbol} ${companyName}
進場價：${position.entry_price}
新聞標題：
${newsHeadlines.map(n => '- ' + n).join('\n')}
請評估是否出現出場訊號。`;
};

export const parseExitResult = (rawResult) => {
  if (!rawResult) return null;
  return {
    symbol: rawResult.symbol,
    is_exit_signal: Boolean(rawResult.is_exit_signal),
    urgency: rawResult.urgency,
    reasoning: rawResult.reasoning,
    danger_level: Math.max(1, Math.min(5, rawResult.danger_level || 1)),
    recommended_action: rawResult.recommended_action
  };
};
