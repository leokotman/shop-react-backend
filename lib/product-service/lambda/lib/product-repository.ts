import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export type ProductRow = {
  id: string;
  title: string;
  description: string;
  price: number;
};

export type StockRow = {
  product_id: string;
  count: number;
};

export type JoinedProduct = ProductRow & { count: number };

function productsTableName(): string {
  const name = process.env.PRODUCTS_TABLE_NAME;
  if (!name) {
    throw new Error('PRODUCTS_TABLE_NAME is not set');
  }
  return name;
}

function stockTableName(): string {
  const name = process.env.STOCK_TABLE_NAME;
  if (!name) {
    throw new Error('STOCK_TABLE_NAME is not set');
  }
  return name;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export async function listJoinedProducts(): Promise<JoinedProduct[]> {
  const productsScan = await client.send(
    new ScanCommand({
      TableName: productsTableName(),
    }),
  );

  const rows = (productsScan.Items ?? []) as ProductRow[];
  if (rows.length === 0) {
    return [];
  }

  const stockByProductId = new Map<string, number>();
  for (const keys of chunk(rows.map((p) => ({ product_id: p.id })), 100)) {
    const batch = await client.send(
      new BatchGetCommand({
        RequestItems: {
          [stockTableName()]: {
            Keys: keys,
          },
        },
      }),
    );
    const stockItems = (batch.Responses?.[stockTableName()] ?? []) as StockRow[];
    for (const s of stockItems) {
      stockByProductId.set(s.product_id, s.count);
    }
  }

  return rows
    .map((p) => ({
      ...p,
      count: stockByProductId.get(p.id) ?? 0,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function getJoinedProductById(
  productId: string,
): Promise<JoinedProduct | null> {
  const [productRes, stockRes] = await Promise.all([
    client.send(
      new GetCommand({
        TableName: productsTableName(),
        Key: { id: productId },
      }),
    ),
    client.send(
      new GetCommand({
        TableName: stockTableName(),
        Key: { product_id: productId },
      }),
    ),
  ]);

  const product = productRes.Item as ProductRow | undefined;
  if (!product) {
    return null;
  }

  const stock = stockRes.Item as StockRow | undefined;
  return {
    ...product,
    count: stock?.count ?? 0,
  };
}

export type CreateProductInput = {
  title: string;
  description: string;
  price: number;
  count: number;
};

export async function createProductWithStock(
  input: CreateProductInput,
): Promise<JoinedProduct> {
  const id = crypto.randomUUID();

  await client.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: productsTableName(),
            Item: {
              id,
              title: input.title,
              description: input.description,
              price: input.price,
            },
          },
        },
        {
          Put: {
            TableName: stockTableName(),
            Item: {
              product_id: id,
              count: input.count,
            },
          },
        },
      ],
    }),
  );

  return {
    id,
    title: input.title,
    description: input.description,
    price: input.price,
    count: input.count,
  };
}
