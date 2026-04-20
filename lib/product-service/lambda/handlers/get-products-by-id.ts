import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { findProductById } from '../data/products';
import { jsonResponse } from '../lib/http';

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const productId = event.pathParameters?.productId;
  if (!productId) {
    return jsonResponse(400, { message: 'Missing productId' });
  }

  const product = findProductById(productId);
  if (!product) {
    return jsonResponse(404, { message: 'Product not found' });
  }

  return jsonResponse(200, product);
};
