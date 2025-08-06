const B2 = require('backblaze-b2');
require('dotenv').config();

const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APP_KEY
});

async function uploadToB2(buffer, filename, mimeType) {
  await b2.authorize();

  const { data } = await b2.getUploadUrl({ bucketId: process.env.B2_BUCKET_ID });

  await b2.uploadFile({
    uploadUrl: data.uploadUrl,
    uploadAuthToken: data.authorizationToken,
    fileName: filename,
    data: buffer,
    contentType: mimeType
  });

  return `${process.env.B2_BASE_URL}/${process.env.B2_BUCKET}/${filename}`;
}

module.exports = {
  uploadToB2
};