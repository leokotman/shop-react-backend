import type { SQSEvent } from 'aws-lambda';
import * as repo from '../../lib/product-service/lambda/lib/product-repository';

const sendMock = jest.fn();

jest.mock('../../lib/product-service/lambda/lib/product-repository');
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
  PublishCommand: jest.fn((args) => args),
}));

import { handler } from '../../lib/product-service/lambda/handlers/catalog-batch-process';



const mockCreate = repo.createProductWithStock as jest.MockedFunction<
  typeof repo.createProductWithStock
>;

function sqsEventWithBodies(bodies: string[]): SQSEvent {
  return {
    Records: bodies.map((body, index) => ({
      messageId: String(index),
      receiptHandle: 'rh',
      body,
      attributes: {},
      messageAttributes: {},
      md5OfBody: '',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:us-east-1:123:catalogItemsQueue',
      awsRegion: 'us-east-1',
    })),
  } as unknown as SQSEvent;
}

describe('catalogBatchProcess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CREATE_PRODUCT_TOPIC_ARN = 'arn:aws:sns:us-east-1:123:createProductTopic';
  });

  it('creates products from messages and publishes one SNS event', async () => {
    mockCreate.mockResolvedValueOnce({
      id: '1',
      title: 'A',
      description: 'D',
      price: 10,
      count: 2,
    });
    mockCreate.mockResolvedValueOnce({
      id: '2',
      title: 'B',
      description: 'E',
      price: 20,
      count: 3,
    });

    const event = sqsEventWithBodies([
      JSON.stringify({ title: 'A', description: 'D', price: '10', count: '2' }),
      JSON.stringify({ title: 'B', description: 'E', price: '20', count: '3' }),
    ]);

    await handler(event);

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenNthCalledWith(1, {
      title: 'A',
      description: 'D',
      price: 10,
      count: 2,
    });
    expect(mockCreate).toHaveBeenNthCalledWith(2, {
      title: 'B',
      description: 'E',
      price: 20,
      count: 3,
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        TopicArn: process.env.CREATE_PRODUCT_TOPIC_ARN,
        Subject: 'New Products Created',
        Message: expect.any(String),
        MessageAttributes: expect.objectContaining({
          price: {
            DataType: 'Number',
            StringValue: '20',
          },
        }),
      }),
    );
  });

  it('skips invalid records and still publishes when at least one product is valid', async () => {
    mockCreate.mockResolvedValueOnce({
      id: '3',
      title: 'C',
      description: 'F',
      price: 30,
      count: 4,
    });

    const event = sqsEventWithBodies([
      '{ invalid json',
      JSON.stringify({ title: 'C', description: 'F', price: '30', count: '4' }),
    ]);

    await handler(event);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        MessageAttributes: expect.objectContaining({
          price: {
            DataType: 'Number',
            StringValue: '30',
          },
        }),
      }),
    );
  });
});
