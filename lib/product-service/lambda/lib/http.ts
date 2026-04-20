import type { APIGatewayProxyResult } from 'aws-lambda';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

export function jsonResponse(
  statusCode: number,
  body: unknown,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
  };
}
