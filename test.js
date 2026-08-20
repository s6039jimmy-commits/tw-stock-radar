
async function test() {
  const yahooUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/QQQM?interval=1d&range=1d';
  const res = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(yahooUrl));
  const text = await res.text();
  console.log('Status:', res.status);
  console.log(text.substring(0, 100));
}
test();
