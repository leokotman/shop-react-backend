import type { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../lib/product-service/lambda/handlers/get-products-by-id';
import * as repo from '../../lib/product-service/lambda/lib/product-repository';

jest.mock('../../lib/product-service/lambda/lib/product-repository');

const mockGet = repo.getJoinedProductById as jest.MockedFunction<
  typeof repo.getJoinedProductById
>;

function eventWithProductId(productId: string | undefined): APIGatewayProxyEvent {
  return {
    pathParameters: productId !== undefined ? { productId } : undefined,
  } as unknown as APIGatewayProxyEvent;
}

describe('getProductsById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 and a single product when id exists', async () => {
    const product = {
      id: 'id-1',
      title: 'T',
      description: 'd',
      price: 10,
      count: 3,
    };
    mockGet.mockResolvedValueOnce(product);

    const result = await handler(eventWithProductId('id-1'));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body ?? '{}')).toEqual(product);
    expect(mockGet).toHaveBeenCalledWith('id-1');
  });

  it('returns 404 when product is not found', async () => {
    mockGet.mockResolvedValueOnce(null);

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

  it('returns 500 when the database layer fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('ddb'));

    const result = await handler(eventWithProductId('any'));

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body ?? '{}')).toEqual({
      message: 'Internal server error',
    });
  });
});
