const scannedToday = new Set();
let currentDay = new Date().getDate();

export const filterUnscanned = (symbols) => {
  const today = new Date().getDate();
  if (today !== currentDay) {
    scannedToday.clear();
    currentDay = today;
  }
  return symbols.filter(s => !scannedToday.has(s));
};

export const markAsScanned = (symbol) => {
  scannedToday.add(symbol);
};
