import type { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../lib/product-service/lambda/handlers/get-products-list';
import { PRODUCTS } from '../../lib/product-service/lambda/data/products';

describe('getProductsList', () => {
  it('returns 200 and full product list', async () => {
    const result = await handler({} as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body ?? '[]')).toEqual(PRODUCTS);
  });
});
