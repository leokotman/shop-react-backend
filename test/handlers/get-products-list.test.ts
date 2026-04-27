import type { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../lib/product-service/lambda/handlers/get-products-list';
import * as repo from '../../lib/product-service/lambda/lib/product-repository';

jest.mock('../../lib/product-service/lambda/lib/product-repository');

const mockList = repo.listJoinedProducts as jest.MockedFunction<
  typeof repo.listJoinedProducts
>;

describe('getProductsList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 and full product list', async () => {
    const joined = [
      {
        id: 'a',
        title: 'T',
        description: 'd',
        price: 1,
        count: 2,
      },
    ];
    mockList.mockResolvedValueOnce(joined);

    const result = await handler({} as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body ?? '[]')).toEqual(joined);
  });

  it('returns 500 when the database layer fails', async () => {
    mockList.mockRejectedValueOnce(new Error('ddb'));

    const result = await handler({} as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body ?? '{}')).toEqual({
      message: 'Internal server error',
    });
  });
});
