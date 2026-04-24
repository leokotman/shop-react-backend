import type { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../lib/product-service/lambda/handlers/get-products-by-id';
import { PRODUCTS } from '../../lib/product-service/lambda/data/products';

function eventWithProductId(productId: string | undefined): APIGatewayProxyEvent {
  return {
    pathParameters: productId !== undefined ? { productId } : undefined,
  } as unknown as APIGatewayProxyEvent;
}

describe('getProductsById', () => {
  it('returns 200 and a single product when id exists', async () => {
    const id = PRODUCTS[0]!.id;
    const result = await handler(eventWithProductId(id));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body ?? '{}')).toEqual(PRODUCTS[0]);
  });

  it('returns 404 when product is not found', async () => {
    const result = await handler(eventWithProductId('non-existent-id'));

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body ?? '{}')).toEqual({
      message: 'Product not found',
    });
  });

  it('returns 400 when productId is missing', async () => {
    const result = await handler(eventWithProductId(undefined));

    expect(result.statusCode).toBe(400);
  });
});
