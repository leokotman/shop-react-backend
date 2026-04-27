import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  createProductWithStock,
  type CreateProductInput,
} from '../lib/product-repository';
import { jsonResponse } from '../lib/http';
import { logIncomingRequest } from '../lib/handler-utils';

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isIntegerNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);
}

function parseCreateBody(
  raw: string | null,
): { ok: false; message: string } | { ok: true; value: CreateProductInput } {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: false, message: 'Request body is required' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'Invalid JSON body' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: 'Body must be a JSON object' };
  }
  const o = parsed as Record<string, unknown>;

  if (!isNonEmptyString(o.title)) {
    return { ok: false, message: 'title is required and must be a non-empty string' };
  }
  const description =
    o.description === undefined || o.description === null
      ? ''
      : typeof o.description === 'string'
        ? o.description
        : null;
  if (description === null) {
    return { ok: false, message: 'description must be a string when provided' };
  }

  if (!isIntegerNumber(o.price) || o.price < 0) {
    return {
      ok: false,
      message: 'price is required and must be a non-negative integer',
    };
  }
  if (!isIntegerNumber(o.count) || o.count < 0) {
    return {
      ok: false,
      message: 'count is required and must be a non-negative integer',
    };
  }

  return {
    ok: true,
    value: {
      title: o.title.trim(),
      description,
      price: o.price,
      count: o.count,
    },
  };
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  logIncomingRequest(event);
  try {
    const parsed = parseCreateBody(event.body ?? null);
    if (!parsed.ok) {
      return jsonResponse(400, { message: parsed.message });
    }

    const created = await createProductWithStock(parsed.value);
    return jsonResponse(201, created);
  } catch (err) {
    console.error('createProduct error', err);
    return jsonResponse(500, { message: 'Internal server error' });
  }
};
