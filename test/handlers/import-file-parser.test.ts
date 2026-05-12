import type { S3Event, S3EventRecord } from 'aws-lambda';
import { Readable } from 'stream';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  GetObjectCommand: jest.fn(),
  CopyObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
}));

jest.mock('csv-parser', () => {
  const { Transform } = require('stream');
  return jest.fn(() => new Transform({ objectMode: true, transform(_chunk: unknown, _enc: string, cb: () => void) { cb(); } }));
});

import { handler } from '../../lib/import-service/lambda/handlers/import-file-parser';

function makeEvent(key: string): S3Event {
  return {
    Records: [
      {
        s3: {
          bucket: { name: 'test-bucket' },
          object: { key },
        },
      } as unknown as S3EventRecord,
    ],
  };
}

function makeReadable(content = ''): Readable {
  const r = new Readable({ read() {} });
  r.push(content);
  r.push(null);
  return r;
}

describe('importFileParser', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, IMPORT_BUCKET_NAME: 'test-bucket' };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('throws when IMPORT_BUCKET_NAME env var is missing', async () => {
    delete process.env.IMPORT_BUCKET_NAME;
    await expect(handler(makeEvent('uploaded/products.csv'))).rejects.toThrow(
      'IMPORT_BUCKET_NAME env var is not set',
    );
  });

  it('throws when S3 body is not a readable stream', async () => {
    mockSend.mockResolvedValueOnce({ Body: undefined });
    await expect(handler(makeEvent('uploaded/products.csv'))).rejects.toThrow(
      'is not a readable stream',
    );
  });

  it('copies and deletes file after parsing (uploaded/ prefix)', async () => {
    mockSend
      .mockResolvedValueOnce({ Body: makeReadable('title,price\nBook,10\n') }) // GetObject
      .mockResolvedValueOnce({}) // CopyObject
      .mockResolvedValueOnce({}); // DeleteObject

    await handler(makeEvent('uploaded/products.csv'));

    const { CopyObjectCommand, DeleteObjectCommand } =
      jest.requireMock('@aws-sdk/client-s3');

    expect(CopyObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Key: 'parsed/products.csv' }),
    );
    expect(DeleteObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Key: 'uploaded/products.csv' }),
    );
  });

  it('skips the move when key has no uploaded/ prefix', async () => {
    mockSend.mockResolvedValueOnce({ Body: makeReadable('') }); // GetObject only

    await handler(makeEvent('other-folder/products.csv'));

    const { CopyObjectCommand, DeleteObjectCommand } =
      jest.requireMock('@aws-sdk/client-s3');

    expect(CopyObjectCommand).not.toHaveBeenCalled();
    expect(DeleteObjectCommand).not.toHaveBeenCalled();
  });
});
