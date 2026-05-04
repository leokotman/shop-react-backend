import type { APIGatewayProxyEvent } from 'aws-lambda';
import * as presigner from '@aws-sdk/s3-request-presigner';

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: jest.fn() })),
  PutObjectCommand: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

const mockGetSignedUrl = presigner.getSignedUrl as jest.MockedFunction<
  typeof presigner.getSignedUrl
>;

// Import handler after mocks are in place
import { handler } from '../../lib/import-service/lambda/handlers/import-products-file';

describe('importProductsFile', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, IMPORT_BUCKET_NAME: 'test-bucket' };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('returns 400 when name query parameter is missing', async () => {
    const event = {
      queryStringParameters: null,
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Missing required query parameter: name',
    });
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('returns 400 when name query parameter is an empty object', async () => {
    const event = {
      queryStringParameters: {},
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
  });

  it('returns 200 with a signed URL when name is provided', async () => {
    const fakeUrl =
      'https://test-bucket.s3.amazonaws.com/uploaded/products.csv?X-Amz-Signature=abc';
    mockGetSignedUrl.mockResolvedValueOnce(fakeUrl);

    const event = {
      queryStringParameters: { name: 'products.csv' },
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ url: fakeUrl });
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('uses the uploaded/ key prefix in the signed URL command', async () => {
    const { PutObjectCommand } = jest.requireMock('@aws-sdk/client-s3');
    mockGetSignedUrl.mockResolvedValueOnce('https://signed.url/');

    const event = {
      queryStringParameters: { name: 'my-products.csv' },
    } as unknown as APIGatewayProxyEvent;

    await handler(event);

    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Key: 'uploaded/my-products.csv',
        ContentType: 'text/csv',
      }),
    );
  });

  it('returns 500 when IMPORT_BUCKET_NAME env var is missing', async () => {
    delete process.env.IMPORT_BUCKET_NAME;

    const event = {
      queryStringParameters: { name: 'products.csv' },
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ message: 'Internal server error' });
  });
});
