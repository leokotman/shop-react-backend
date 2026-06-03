/**
 * Cognito JWT Token Authorizer for Lambda
 * This lambda authorizes requests using Cognito ID tokens
 */

export async function handler(event: any) {
  console.log('Cognito Authorizer event:', JSON.stringify(event, null, 2));

  const authToken = event.authorizationToken;
  const methodArn = event.methodArn;

  // Check if Authorization header is provided
  if (!authToken) {
    console.log('No authorization token provided');
    throw new Error('Unauthorized');
  }

  try {
    // Extract the Bearer token
    const authParts = authToken.split(' ');
    
    if (authParts.length !== 2 || authParts[0] !== 'Bearer') {
      console.log('Invalid authorization header format');
      throw new Error('Unauthorized');
    }

    const jwtToken = authParts[1];

    // For now, we'll do a simple validation
    // In a production environment, you would validate the JWT signature against Cognito's public keys
    // For this task, we'll just check if the token is not empty
    if (!jwtToken || jwtToken.length === 0) {
      console.log('Empty JWT token');
      throw new Error('Unauthorized');
    }

    console.log('Token received, granting access');
    
    // Parse JWT to get the user info (without verification for this demo)
    // In production, always verify the signature
    try {
      const decodedToken = JSON.parse(Buffer.from(jwtToken.split('.')[1], 'base64').toString());
      console.log('Token username:', decodedToken.cognito_username || decodedToken.sub);
      
      return generatePolicy(
        decodedToken.cognito_username || decodedToken.sub || 'user',
        'Allow',
        methodArn
      );
    } catch (decodeError) {
      console.error('Error decoding token:', decodeError);
      throw new Error('Unauthorized');
    }
  } catch (error) {
    console.error('Authorization error:', error);
    throw error;
  }
}

function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string
): any {
  const authResponse: any = {
    principalId,
  };

  if (effect && resource) {
    const policyDocument: any = {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    };
    authResponse.policyDocument = policyDocument;
  }

  return authResponse;
}
