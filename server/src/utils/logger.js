const formatMessage = (level, module, msg) => {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] [${module}] ${msg}`;
};

// 簡單的結構化日誌記錄器
export const logger = {
  info: (module, msg) => console.log(`[36m${formatMessage('INFO', module, msg)}[0m`),
  warn: (module, msg) => console.warn(`[33m${formatMessage('WARN', module, msg)}[0m`),
  error: (module, msg, err = '') => console.error(`[31m${formatMessage('ERROR', module, msg)}[0m`, err),
  debug: (module, msg) => console.debug(`[90m${formatMessage('DEBUG', module, msg)}[0m`)
};
