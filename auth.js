// auth.js
// 🔐 Purpose: Authenticates to Google Sheets using a service account
const { google } = require('googleapis');

async function authenticate() {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT, 'base64').toString('utf-8')
  );

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return await auth.getClient();
}

module.exports = { authenticate };