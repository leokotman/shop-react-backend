import type { SQSEvent } from 'aws-lambda';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import {
  createProductWithStock,
  type CreateProductInput,
  type JoinedProduct,
} from '../lib/product-repository';

const sns = new SNSClient({ region: process.env.AWS_REGION });

function timeoutPromise(milliseconds: number): Promise<never> {
  return new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('catalogBatchProcess timed out'));
    }, milliseconds);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });
}

function parseInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

function parseCreateProductInput(
  payload: unknown,
): CreateProductInput | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  if (!title) {
    return null;
  }

  const description =
    typeof record.description === 'string' ? record.description : '';
  const price = parseInteger(record.price);
  const count = parseInteger(record.count);

  if (price === null || price < 0 || count === null || count < 0) {
    return null;
  }

  return {
    title,
    description,
    price,
    count,
  };
}

export const handler = async (event: SQSEvent): Promise<void> => {
  const topicArn = process.env.CREATE_PRODUCT_TOPIC_ARN;
  if (!topicArn) {
    throw new Error('CREATE_PRODUCT_TOPIC_ARN env var is not set');
  }

  try {
    const processRecords = async (): Promise<JoinedProduct[]> => {
      const createdProducts: JoinedProduct[] = [];

      for (const record of event.Records) {
        let payload: unknown;
        try {
          payload = JSON.parse(record.body);
        } catch {
          console.warn('Skipping invalid JSON message', record.body);
          continue;
        }

        const input = parseCreateProductInput(payload);
        if (!input) {
          console.warn('Skipping invalid product record', record.body);
          continue;
        }

        const created = await createProductWithStock(input);
        createdProducts.push(created);
      }

      return createdProducts;
    };

    const createdProducts = await Promise.race([
      processRecords(),
      timeoutPromise(25000),
    ]);

    if (createdProducts.length === 0) {
      return;
    }

    const maxPrice = Math.max(...createdProducts.map((p) => p.price));

    await sns.send(
      new PublishCommand({
        TopicArn: topicArn,
        Subject: 'New Products Created',
        Message: JSON.stringify({
          createdCount: createdProducts.length,
          products: createdProducts,
        }),
        MessageAttributes: {
          eventType: {
            DataType: 'String',
            StringValue: 'productCreated',
          },
          price: {
            DataType: 'Number',
            StringValue: String(maxPrice),
          },
        },
      }),
    );
  } catch (err) {
    console.error('catalogBatchProcess error', err);
    throw err;
  }
};
