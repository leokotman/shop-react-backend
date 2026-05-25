export async function handler(event: any) {
  console.log('Authorizer event:', JSON.stringify(event, null, 2));

  const authToken = event.authorizationToken;
  const methodArn = event.methodArn;

  // Check if Authorization header is provided
  if (!authToken) {
    console.log('No authorization token provided');
    throw new Error('Unauthorized');
  }

  try {
    // Extract the Basic token (should be in format "Basic {base64encoded_credentials}")
    const authParts = authToken.split(' ');
    
    if (authParts.length !== 2 || authParts[0] !== 'Basic') {
      console.log('Invalid authorization header format');
      throw new Error('Unauthorized');
    }

    const base64Credentials = authParts[1];
    
    // Decode the base64 credentials
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    console.log(`Attempting to authenticate user: ${username}`);

    // Get credentials from environment
    const authCredentials = process.env.AUTH_CREDENTIALS || '';
    console.log('Auth credentials available:', authCredentials.split(',').map(c => c.split('=')[0]).join(', '));

    // Check if the provided credentials match any in the environment
    const credentialPairs = authCredentials.split(',');
    const isValid = credentialPairs.some(pair => {
      const [envUsername, envPassword] = pair.split('=');
      return envUsername === username && envPassword === password;
    });

    if (!isValid) {
      console.log(`Access denied for user: ${username}`);
      // Return 403 Forbidden
      throw new Error('Forbidden');
    }

    console.log(`Access granted for user: ${username}`);

    // Return IAM policy allowing access
    return generatePolicy(username, 'Allow', methodArn);
  } catch (error) {
    console.error('Authorization error:', error);
    
    // Determine the error code from the message
    const errorMessage = (error as Error).message || 'Unauthorized';
    
    if (errorMessage === 'Forbidden') {
      // Return 403 policy (actually we need to throw error with specific structure)
      throw new Error('Forbidden');
    } else {
      // Return 401 Unauthorized
      throw new Error('Unauthorized');
    }
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
