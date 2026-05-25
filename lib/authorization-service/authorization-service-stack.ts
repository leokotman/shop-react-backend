import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as fs from 'fs';

export class AuthorizationServiceStack extends cdk.Stack {
  public readonly basicAuthorizerFunction: lambda.Function;
  public readonly cognitoAuthorizerFunction: lambda.Function;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const lambdaDir = path.join(__dirname, 'lambda');

    // Load credentials from .env file
    const authCredentials = this.loadCredentialsFromEnv();

    const basicAuthorizerFn = new nodejs.NodejsFunction(
      this,
      'BasicAuthorizer',
      {
        functionName: 'basicAuthorizer',
        runtime: lambda.Runtime.NODEJS_22_X,
        memorySize: 256,
        timeout: cdk.Duration.seconds(10),
        entry: path.join(lambdaDir, 'basic-authorizer.ts'),
        environment: {
          AUTH_CREDENTIALS: authCredentials,
        },
      }
    );

    // Create Cognito authorizer lambda
    const cognitoAuthorizerFn = new nodejs.NodejsFunction(
      this,
      'CognitoAuthorizer',
      {
        functionName: 'cognitoAuthorizer',
        runtime: lambda.Runtime.NODEJS_22_X,
        memorySize: 256,
        timeout: cdk.Duration.seconds(10),
        entry: path.join(lambdaDir, 'cognito-authorizer.ts'),
      }
    );

    this.basicAuthorizerFunction = basicAuthorizerFn;
    this.cognitoAuthorizerFunction = cognitoAuthorizerFn;
  }

  private loadCredentialsFromEnv(): string {
    try {
      // Try to load from .env file in the project root
      const envFilePath = path.join(__dirname, '../../.env');
      if (fs.existsSync(envFilePath)) {
        const envContent = fs.readFileSync(envFilePath, 'utf-8');
        // Parse the .env file and collect credential lines
        const credentials = envContent
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#') && line.includes('='))
          .join(',');
        
        if (credentials) {
          console.log('Loaded credentials from .env file');
          return credentials;
        }
      }
    } catch (error) {
      console.warn('Could not read .env file:', error);
    }

    // Fallback to default credential
    console.log('Using default credential');
    return 'leokotman=TEST_PASSWORD';
  }
}
