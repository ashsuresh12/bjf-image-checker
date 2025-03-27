// index.js
const { google } = require('googleapis');
const axios = require('axios');
const { authenticate } = require('./auth');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'Backup';
const START_ROW = 4;
const MAX_ROWS = 100;
const CDN_BASE_URL = 'https://cdn.shopify.com/s/files/1/0474/3446/5442/files/';

async function main() {
  const auth = await authenticate();
  const sheets = google.sheets({ version: 'v4', auth });

  // Read SKUs from AP column
  const range = `${SHEET_NAME}!AP${START_ROW}:AP${START_ROW + MAX_ROWS - 1}`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });

  const rows = response.data.values || [];
  const prefixToUrl = {};

  const updates = rows.map(async (row) => {
    const fullSku = row[0];
    if (!fullSku || fullSku.length < 5) return [ '', '' ];

    const prefix = fullSku.slice(0, 5);

    if (prefixToUrl[prefix]) {
      return [ prefixToUrl[prefix].url, prefixToUrl[prefix].status ];
    }

    // Try to locate any image that starts with the prefix
    const testFilenames = [
      `${prefix}-Olive_Oil.jpg`, // fallback if known
      `${prefix}.jpg`,
      `${prefix}-1.jpg`,
      `${prefix}-product.jpg`,
    ];

    let validUrl = '', status = '❌';

    for (let filename of testFilenames) {
      const url = `${CDN_BASE_URL}${filename}`;
      try {
        const res = await axios.head(url);
        if (res.status === 200) {
          validUrl = url;
          status = '✅';
          break;
        }
      } catch {}
    }

    prefixToUrl[prefix] = { url: validUrl, status };
    return [ validUrl, status ];
  });

  const results = await Promise.all(updates);

  // Write results to columns AR (image URL) and AH (status emoji)
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