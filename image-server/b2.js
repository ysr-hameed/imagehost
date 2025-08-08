const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

let authData = null;

async function authorizeB2() {
  if (authData && Date.now() < authData.expiresAt) return authData;

  const res = await axios.get('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    auth: {
      username: process.env.B2_KEY_ID,
      password: process.env.B2_APPLICATION_KEY,
    },
  });

  authData = {
    ...res.data,
    expiresAt: Date.now() + 1000 * 60 * 50, // 50 minutes cache
  };

  return authData;
}

async function deleteFile(fileId, fileName) {
  const { apiUrl, authorizationToken } = await authorizeB2();

  return axios.post(
    `${apiUrl}/b2api/v2/b2_delete_file_version`,
    { fileId, fileName },
    { headers: { Authorization: authorizationToken } }
  );
}

async function getSignedUrl(filePath) {
  const { apiUrl, authorizationToken } = await authorizeB2();
  const res = await axios.post(
    `${apiUrl}/b2api/v2/b2_get_download_authorization`,
    {
      bucketId: process.env.B2_BUCKET_ID,
      fileNamePrefix: filePath,
      validDurationInSeconds: 3600,
    },
    {
      headers: { Authorization: authorizationToken },
    }
  );

  const downloadBase = authData.downloadUrl;
  return `${downloadBase}/file/${process.env.B2_BUCKET_NAME}/${filePath}?Authorization=${res.data.authorizationToken}`;
}

module.exports = {
  deleteFile,
  getSignedUrl,
};