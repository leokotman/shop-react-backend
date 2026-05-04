import type { APIGatewayProxyEvent } from 'aws-lambda';

export function logIncomingRequest(event: APIGatewayProxyEvent): void {
  console.log(
    JSON.stringify({
      httpMethod: event.httpMethod,
      path: event.path,
      pathParameters: event.pathParameters ?? null,
      queryStringParameters: event.queryStringParameters ?? null,
      body: event.body ?? null,
    }),
  );
}
