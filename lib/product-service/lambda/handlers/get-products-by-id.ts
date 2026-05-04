import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getJoinedProductById } from '../lib/product-repository';
import { jsonResponse } from '../lib/http';
import { logIncomingRequest } from '../lib/handler-utils';

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  logIncomingRequest(event);
  try {
    const productId = event.pathParameters?.productId;
    if (!productId) {
      return jsonResponse(400, { message: 'Missing productId' });
    }

    const product = await getJoinedProductById(productId);
    if (!product) {
      return jsonResponse(404, { message: 'Product not found' });
    }

    return jsonResponse(200, product);
  } catch (err) {
    console.error('getProductsById error', err);
    return jsonResponse(500, { message: 'Internal server error' });
  }
};
