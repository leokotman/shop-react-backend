import type { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../lib/product-service/lambda/handlers/create-product';
import * as repo from '../../lib/product-service/lambda/lib/product-repository';

jest.mock('../../lib/product-service/lambda/lib/product-repository');

const mockCreate = repo.createProductWithStock as jest.MockedFunction<
  typeof repo.createProductWithStock
>;

function eventWithBody(body: string | null): APIGatewayProxyEvent {
  return { body } as unknown as APIGatewayProxyEvent;
}

describe('createProduct', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 201 and created product on valid body', async () => {
    const created = {
      id: 'new-id',
      title: 'N',
      description: 'D',
      price: 5,
      count: 1,
    };
    mockCreate.mockResolvedValueOnce(created);

    const result = await handler(
      eventWithBody(
        JSON.stringify({
          title: '  N  ',
          description: 'D',
          price: 5,
          count: 1,
        }),
      ),
    );

    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body ?? '{}')).toEqual(created);
    expect(mockCreate).toHaveBeenCalledWith({
      title: 'N',
      description: 'D',
      price: 5,
      count: 1,
    });
  });

  it('returns 400 when JSON is invalid', async () => {
    const result = await handler(eventWithBody('{'));

    expect(result.statusCode).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 400 when title is missing', async () => {
    const result = await handler(
      eventWithBody(JSON.stringify({ description: '', price: 1, count: 0 })),
    );

    expect(result.statusCode).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 400 when price is not an integer', async () => {
    const result = await handler(
      eventWithBody(
        JSON.stringify({ title: 'a', description: '', price: 1.5, count: 0 }),
      ),
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 500 when persistence fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('ddb'));

    const result = await handler(
      eventWithBody(
        JSON.stringify({ title: 'a', description: '', price: 1, count: 0 }),
      ),
    );

    expect(result.statusCode).toBe(500);
  });
});
