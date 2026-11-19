import { runMiddayScan } from './src/services/radar/middayScanner.js';
console.log('Testing runMiddayScan...');
runMiddayScan(true).then(res => {
  console.log('Result:', res);
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
