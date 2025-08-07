const axios = require('axios');
require('dotenv').config();

let b2Data = null;

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

async function getUploadUrl() {
  const res = await axios.post(
    `${b2Data.apiUrl}/b2api/v2/b2_get_upload_url`,
    { bucketId: process.env.B2_BUCKET_ID },
    { headers: { Authorization: b2Data.authToken } }
  );
  return res.data;
}

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

async function uploadStream(fileStream, fileName, fileSize) {
  if (!b2Data) await authorize();

  const { uploadUrl, authorizationToken } = await getUploadUrl();

  const res = await axios.post(uploadUrl, fileStream, {
    headers: {
      Authorization: authorizationToken,
      'X-Bz-File-Name': encodeURIComponent(fileName),
      'Content-Type': 'b2/x-auto',
      'Content-Length': fileSize,
      'X-Bz-Content-Sha1': 'do_not_verify'
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  const finalFileName = res.data.fileName;

  const isPrivate = process.env.B2_PRIVATE === 'true';

  const url = isPrivate
    ? await getSignedUrl(finalFileName)
    : `${b2Data.downloadUrl}/file/${process.env.B2_BUCKET_NAME}/${encodeURIComponent(finalFileName)}`;

  return {
    fileId: res.data.fileId,
    fileName: finalFileName,
    downloadUrl: url
  };
}

module.exports = { uploadStream };