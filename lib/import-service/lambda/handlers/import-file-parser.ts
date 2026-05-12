import type { S3Event } from 'aws-lambda';
import {
  S3Client,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import csvParser = require('csv-parser');

const s3 = new S3Client({ region: process.env.AWS_REGION });

export const handler = async (event: S3Event): Promise<void> => {
  const bucketName = process.env.IMPORT_BUCKET_NAME;
  if (!bucketName) {
    console.error('IMPORT_BUCKET_NAME env var is not set');
    throw new Error('IMPORT_BUCKET_NAME env var is not set');
  }

  for (const record of event.Records) {
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    console.log(`Processing file: s3://${bucketName}/${key}`);

    const getCommand = new GetObjectCommand({ Bucket: bucketName, Key: key });
    const response = await s3.send(getCommand);

    const stream = response.Body;
    if (!(stream instanceof Readable)) {
      throw new Error(`S3 response body for ${key} is not a readable stream`);
    }

    await new Promise<void>((resolve, reject) => {
      stream
        .pipe(csvParser())
        .on('data', (data: Record<string, unknown>) => {
          console.log('Parsed record:', JSON.stringify(data));
        })
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`Finished parsing ${key}`);

    if (!key.startsWith('uploaded/')) {
      console.warn(`Key "${key}" is not in uploaded/ — skipping move`);
      continue;
    }

    // Move file from uploaded/ to parsed/
    const parsedKey = key.replace(/^uploaded\//, 'parsed/');
    try {
      await s3.send(
        new CopyObjectCommand({
          Bucket: bucketName,
          CopySource: `${bucketName}/${key}`,
          Key: parsedKey,
        }),
      );
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
      console.log(`Moved ${key} -> ${parsedKey}`);
    } catch (err) {
      console.error('Error moving file:', err);
      throw err;
    }
  }
};
