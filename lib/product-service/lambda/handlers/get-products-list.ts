import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PRODUCTS } from '../data/products';
import { jsonResponse } from '../lib/http';

export const handler = async (
  _event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  return jsonResponse(200, PRODUCTS);
};
