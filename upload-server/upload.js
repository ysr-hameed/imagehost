const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const {
  B2_KEY_ID,
  B2_APP_KEY,
  B2_BUCKET_ID,
  B2_BUCKET_NAME,
  B2_AUTH_URL,
  B2_PRIVATE
} = process.env;

let authData = null;

async function authorize() {
  if (authData) return authData;

  const credentials = Buffer.from(`${B2_KEY_ID}:${B2_APP_KEY}`).toString('base64');
  const res = await axios.get(B2_AUTH_URL || 'https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { Authorization: `Basic ${credentials}` }
  });

  authData = res.data;
  return authData;
}

async function getUploadUrl() {
  const auth = await authorize();
  const res = await axios.post(
    `${auth.apiUrl}/b2api/v2/b2_get_upload_url`,
    { bucketId: B2_BUCKET_ID },
    { headers: { Authorization: auth.authorizationToken } }
  );
  return res.data;
}

function generateShortFilename(originalName) {
  const ext = path.extname(originalName);
  const short = crypto.randomBytes(4).toString('hex');
  return `${short}${ext}`;
}

async function generateSignedUrl(filePath) {
  const auth = await authorize();

  const res = await axios.post(
    `${auth.apiUrl}/b2api/v2/b2_get_download_authorization`,
    {
      bucketId: B2_BUCKET_ID,
      fileNamePrefix: filePath,
      validDurationInSeconds: 3600
    },
    { headers: { Authorization: auth.authorizationToken } }
  );

  const token = res.data.authorizationToken;
  return `${auth.downloadUrl}/file/${B2_BUCKET_NAME}/${filePath}?Authorization=${token}`;
}

async function uploadFile(fileBuffer, originalName, userId) {
  const { uploadUrl, authorizationToken } = await getUploadUrl();

  const fileName = generateShortFilename(originalName);
  const filePath = `${userId}/${fileName}`;

  await axios.post(uploadUrl, fileBuffer, {
    headers: {
      Authorization: authorizationToken,
      'X-Bz-File-Name': encodeURIComponent(filePath),
      'Content-Type': 'b2/x-auto',
      'X-Bz-Content-Sha1': 'do_not_verify'
    },
    maxBodyLength: Infinity
  });

  const isPrivate = B2_PRIVATE === 'true';

  const publicUrl = `${authData.downloadUrl}/file/${B2_BUCKET_NAME}/${filePath}`;
  const finalUrl = isPrivate ? await generateSignedUrl(filePath) : publicUrl;

  // Simulate a unique file ID (e.g., from fileName prefix)
  const fileId = path.basename(fileName, path.extname(fileName));

  return {
    fileId,
    fileName,
    filePath: publicUrl,
    downloadUrl: finalUrl
  };
}

module.exports = { uploadFile };