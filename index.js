// index.js
const { google } = require('googleapis');
const axios = require('axios');
const { authenticate } = require('./auth');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'Backup';
const START_ROW = 4;
const MAX_ROWS = 100;
const CDN_BASE_URL = 'https://cdn.shopify.com/s/files/1/0474/3446/5442/files/';

function formatHandle(handle) {
  return handle
    .trim()
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .join('_');
}

async function main() {
  const auth = await authenticate();
  const sheets = google.sheets({ version: 'v4', auth });

  const range = `${SHEET_NAME}!A${START_ROW}:AP${START_ROW + MAX_ROWS - 1}`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });

  const rows = response.data.values || [];
  const prefixToUrl = {};

  const updates = rows.map(async (row, i) => {
    const rowNum = START_ROW + i;
    const paddedRow = [...row];
    while (paddedRow.length <= 40) paddedRow.push('');

    const handle = paddedRow[0];
    const fullSku = paddedRow[40];

    if (!fullSku || fullSku.length < 5 || !handle) {
      console.log(`[Row ${rowNum}] ❌ Missing SKU or handle`);
      return [ '', '' ];
    }

    const prefix = fullSku.slice(0, 5);
    const formattedHandle = formatHandle(handle);
    const filename = `${prefix}-${formattedHandle}.jpg`;
    const imageUrl = `${CDN_BASE_URL}${filename}`;

    if (prefixToUrl[prefix]) {
      console.log(`[Row ${rowNum}] Reusing cached URL for prefix ${prefix} → ${prefixToUrl[prefix].status}`);
      return [ prefixToUrl[prefix].url, prefixToUrl[prefix].status ];
    }

    try {
      const res = await axios.head(imageUrl);
      if (res.status === 200) {
        prefixToUrl[prefix] = { url: imageUrl, status: '✅' };
        console.log(`[Row ${rowNum}] ✅ Found: ${filename}`);
        return [ imageUrl, '✅' ];
      }
    } catch {
      console.log(`[Row ${rowNum}] ❌ Not found: ${filename}`);
    }

    prefixToUrl[prefix] = { url: '', status: '❌' };
    return [ '', '❌' ];
  });

  const results = await Promise.all(updates);

  const updateRangeAR = `${SHEET_NAME}!AR${START_ROW}:AR${START_ROW + results.length - 1}`;
  const updateRangeAH = `${SHEET_NAME}!AH${START_ROW}:AH${START_ROW + results.length - 1}`;

  const urls = results.map(r => [r[0]]);
  const statuses = results.map(r => [r[1]]);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: updateRangeAR,
    valueInputOption: 'RAW',
    requestBody: { values: urls },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: updateRangeAH,
    valueInputOption: 'RAW',
    requestBody: { values: statuses },
  });

  console.log('✅ Done updating image URLs and status');
}

main().catch(err => console.error('❌ Script failed:', err));