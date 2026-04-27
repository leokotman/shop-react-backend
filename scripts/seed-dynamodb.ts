/**
 * Fills DynamoDB `products` and `stock` tables with sample rows.
 *
 * Table names (from CDK / CloudFormation stack Outputs):
 *   - Put `PRODUCTS_TABLE_NAME` and `STOCK_TABLE_NAME` in `.env.local` (gitignored), or
 *   - Export them in the shell: `PRODUCTS_TABLE_NAME=... STOCK_TABLE_NAME=... npm run seed:dynamodb`
 *
 * Requires AWS credentials with dynamodb:TransactWriteItems on both tables.
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { PRODUCTS } from '../lib/product-service/lambda/data/products';

// Node does not load .env files by itself — same as Lambdas.
config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '.env.local'), override: true });

const productsTable = process.env.PRODUCTS_TABLE_NAME;
const stockTable = process.env.STOCK_TABLE_NAME;

if (!productsTable || !stockTable) {
  console.error(
    'Missing env: set PRODUCTS_TABLE_NAME and STOCK_TABLE_NAME (see CDK stack outputs).',
  );
  process.exit(1);
}

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

async function main(): Promise<void> {
  const transactItems = [];
  for (const p of PRODUCTS) {
    const { count, id, title, description, price } = p;
    transactItems.push(
      {
        Put: {
          TableName: productsTable,
          Item: { id, title, description, price },
        },
      },
      {
        Put: {
          TableName: stockTable,
          Item: { product_id: id, count },
        },
      },
    );
  }

  await doc.send(
    new TransactWriteCommand({
      TransactItems: transactItems,
    }),
  );

  console.log(
    `Seeded ${PRODUCTS.length} products (and stock rows) into ${productsTable} / ${stockTable}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
