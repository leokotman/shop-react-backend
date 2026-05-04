import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { listJoinedProducts } from '../lib/product-repository';
import { jsonResponse } from '../lib/http';
import { logIncomingRequest } from '../lib/handler-utils';

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  logIncomingRequest(event);
  try {
    const products = await listJoinedProducts();
    return jsonResponse(200, products);
  } catch (err) {
    console.error('getProductsList error', err);
    return jsonResponse(500, { message: 'Internal server error' });
  }
};
