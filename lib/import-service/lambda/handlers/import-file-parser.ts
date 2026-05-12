import type { S3Event } from 'aws-lambda';
import {
  S3Client,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Readable } from 'stream';
import csvParser = require('csv-parser');

const s3 = new S3Client({ region: process.env.AWS_REGION });
const sqs = new SQSClient({ region: process.env.AWS_REGION });

export const handler = async (event: S3Event): Promise<void> => {
  try {
    const bucketName = process.env.IMPORT_BUCKET_NAME;
    if (!bucketName) {
      console.error('IMPORT_BUCKET_NAME env var is not set');
      throw new Error('IMPORT_BUCKET_NAME env var is not set');
    }

    const queueUrl = process.env.CATALOG_ITEMS_QUEUE_URL;
    if (!queueUrl) {
      console.error('CATALOG_ITEMS_QUEUE_URL env var is not set');
      throw new Error('CATALOG_ITEMS_QUEUE_URL env var is not set');
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
        const pending: Array<Promise<unknown>> = [];

        stream
          .pipe(csvParser())
          .on('data', (data: Record<string, unknown>) => {
            pending.push(
              sqs.send(
                new SendMessageCommand({
                  QueueUrl: queueUrl,
                  MessageBody: JSON.stringify(data),
                }),
              ),
            );
          })
          .on('end', async () => {
            try {
              await Promise.all(pending);
              resolve();
            } catch (err) {
              reject(err);
            }
          })
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
  } catch (err) {
    console.error('importFileParser error', err);
    throw err;
  }
};
