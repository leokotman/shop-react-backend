/**
 * Fills DynamoDB `products` and `stock` tables with sample rows.
 *
 * Usage (after deploy — copy table names from `cdk deploy` outputs):
 *   PRODUCTS_TABLE_NAME=... STOCK_TABLE_NAME=... npm run seed:dynamodb
 *
 * Requires AWS credentials with dynamodb:PutItem (or TransactWriteItems) on both tables.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { PRODUCTS } from '../lib/product-service/lambda/data/products';

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
