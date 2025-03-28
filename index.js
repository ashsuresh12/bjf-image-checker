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

  const range = `${SHEET_NAME}!AP${START_ROW}:AP${START_ROW + MAX_ROWS - 1}`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });

  const rows = response.data.values || [];
  const prefixToUrl = {};

  const updates = rows.map(async (row, i) => {
    const fullSku = row[0];
    const rowNum = START_ROW + i;
    if (!fullSku || fullSku.length < 5) {
      console.log(`[Row ${rowNum}] ❌ No valid SKU`);
      return [ '', '' ];
    }

    const prefix = fullSku.slice(0, 5);

    if (prefixToUrl[prefix]) {
      console.log(`[Row ${rowNum}] Reusing cached URL for prefix ${prefix} → ${prefixToUrl[prefix].status}`);
      return [ prefixToUrl[prefix].url, prefixToUrl[prefix].status ];
    }

    let foundUrl = '';
    let status = '❌';

    try {
      const res = await axios.get(`${CDN_BASE_URL}.json`);
      const files = res.data.files || [];

      const match = files.find(f => f.filename.startsWith(prefix));
      if (match) {
        foundUrl = `${CDN_BASE_URL}${match.filename}`;
        // Verify it actually loads
        const headCheck = await axios.head(foundUrl);
        if (headCheck.status === 200) {
          status = '✅';
          console.log(`[Row ${rowNum}] ✅ Matched file: ${match.filename}`);
        }
      } else {
        console.log(`[Row ${rowNum}] ❌ No file match for prefix ${prefix}`);
      }
    } catch (err) {
      console.log(`[Row ${rowNum}] ❌ Error checking files for prefix ${prefix}`);
    }

    prefixToUrl[prefix] = { url: foundUrl, status };
    return [ foundUrl, status ];
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
