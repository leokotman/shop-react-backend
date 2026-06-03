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
      return generatePolicy('anonymous', 'Deny', methodArn);
    }

    const base64Credentials = authParts[1];
    
    // Decode the base64 credentials
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    if (!username || !password) {
      console.log('Malformed basic authorization token');
      return generatePolicy('anonymous', 'Deny', methodArn);
    }

    console.log(`Attempting to authenticate user: ${username}`);

    const availableUsers = Object.keys(process.env).filter(
      (key) => !key.startsWith('AWS_') && !key.startsWith('_HANDLER') && !key.startsWith('NODE_')
    );
    console.log('Auth credentials available:', availableUsers.join(', '));

    const isValid = process.env[username] === password;

    if (!isValid) {
      console.log(`Access denied for user: ${username}`);
      return generatePolicy(username, 'Deny', methodArn);
    }

    console.log(`Access granted for user: ${username}`);

    // Return IAM policy allowing access
    return generatePolicy(username, 'Allow', methodArn);
  } catch (error) {
    console.error('Authorization error:', error);

    throw new Error('Unauthorized');
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
