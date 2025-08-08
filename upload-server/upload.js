const axios = require('axios');
require('dotenv').config();

let b2Data = null;

// 🔐 Authorize Backblaze B2
async function authorize() {
  const credentials = Buffer.from(`${process.env.B2_KEY_ID}:${process.env.B2_APP_KEY}`).toString('base64');
  const res = await axios.get(process.env.B2_AUTH_URL, {
    headers: { Authorization: `Basic ${credentials}` }
  });

  b2Data = {
    authToken: res.data.authorizationToken,
    apiUrl: res.data.apiUrl,
    downloadUrl: res.data.downloadUrl
  };
}

// 📤 Get B2 upload URL
async function getUploadUrl() {
  const res = await axios.post(
    `${b2Data.apiUrl}/b2api/v2/b2_get_upload_url`,
    { bucketId: process.env.B2_BUCKET_ID },
    { headers: { Authorization: b2Data.authToken } }
  );
  return res.data;
}

// 🔗 Generate signed URL (for private buckets)
async function getSignedUrl(fileName, validSeconds = 3600) {
  const res = await axios.post(
    `${b2Data.apiUrl}/b2api/v2/b2_get_download_authorization`,
    {
      bucketId: process.env.B2_BUCKET_ID,
      fileNamePrefix: fileName,
      validDurationInSeconds: validSeconds
    },
    { headers: { Authorization: b2Data.authToken } }
  );

  const authToken = res.data.authorizationToken;
  const encodedName = encodeURIComponent(fileName);

  return `${b2Data.downloadUrl}/file/${process.env.B2_BUCKET_NAME}/${encodedName}?Authorization=${authToken}`;
}

// 🚀 Upload file using buffer (no temp file)
async function uploadFile(buffer, fileName, userId) {
  if (!b2Data) await authorize();

  const { uploadUrl, authorizationToken } = await getUploadUrl();

  const backblazePath = `${userId}/${fileName}`; // Folder = userId

  const res = await axios.post(uploadUrl, buffer, {
    headers: {
      Authorization: authorizationToken,
      'X-Bz-File-Name': encodeURIComponent(backblazePath),
      'Content-Type': 'b2/x-auto',
      'Content-Length': buffer.length,
      'X-Bz-Content-Sha1': 'do_not_verify'
    }
  });

  const isPrivate = process.env.B2_PRIVATE === 'true';

  const url = isPrivate
    ? await getSignedUrl(backblazePath)
    : `${b2Data.downloadUrl}/file/${process.env.B2_BUCKET_NAME}/${encodeURIComponent(backblazePath)}`;

  return {
    fileId: res.data.fileId,
    fileName: backblazePath,
    downloadUrl: url
  };
}

module.exports = { uploadFile };