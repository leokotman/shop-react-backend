import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION });

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    console.log(
      JSON.stringify({
        httpMethod: event.httpMethod,
        path: event.path,
        queryStringParameters: event.queryStringParameters ?? null,
      }),
    );

    const fileName = event.queryStringParameters?.name;

    if (!fileName) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Missing required query parameter: name' }),
      };
    }

    const bucketName = process.env.IMPORT_BUCKET_NAME;
    if (!bucketName) {
      console.error('IMPORT_BUCKET_NAME env var is not set');
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Internal server error' }),
      };
    }

    const key = `uploaded/${fileName}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: 'text/csv',
    });

    // Expiry is intentionally short — the signed URL is used immediately by the
    // browser to PUT the file. Override via SIGNED_URL_EXPIRES_IN (seconds) if needed.
    const expiresIn = Number(process.env.SIGNED_URL_EXPIRES_IN) || 60;
    const signedUrl = await getSignedUrl(s3, command, { expiresIn });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ url: signedUrl }),
    };
  } catch (err) {
    console.error('importProductsFile error', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
