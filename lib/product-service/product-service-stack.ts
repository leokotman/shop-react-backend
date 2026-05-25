import * as path from 'path';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

export interface ProductServiceStackProps extends cdk.StackProps {
  cognitoAuthorizerFunction?: lambda.Function;
}

export class ProductServiceStack extends cdk.Stack {
  public readonly apiUrl: string;
  public readonly catalogItemsQueue: sqs.Queue;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.IUserPoolClient;

  constructor(scope: Construct, id: string, props?: ProductServiceStackProps) {
    super(scope, id, props);

    const productsTable = new dynamodb.Table(this, 'ProductsTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const stockTable = new dynamodb.Table(this, 'StockTable', {
      partitionKey: {
        name: 'product_id',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const lambdaDir = path.join(__dirname, 'lambda');

    const tableEnv = {
      PRODUCTS_TABLE_NAME: productsTable.tableName,
      STOCK_TABLE_NAME: stockTable.tableName,
    };

    const getProductsListFn = new nodejs.NodejsFunction(
      this,
      'GetProductsList',
      {
        functionName: 'getProductsList',
        runtime: lambda.Runtime.NODEJS_22_X,
        memorySize: 256,
        timeout: cdk.Duration.seconds(10),
        entry: path.join(lambdaDir, 'handlers/get-products-list.ts'),
        handler: 'handler',
        environment: tableEnv,
      },
    );

    const getProductsByIdFn = new nodejs.NodejsFunction(
      this,
      'GetProductsById',
      {
        functionName: 'getProductsById',
        runtime: lambda.Runtime.NODEJS_22_X,
        memorySize: 256,
        timeout: cdk.Duration.seconds(10),
        entry: path.join(lambdaDir, 'handlers/get-products-by-id.ts'),
        handler: 'handler',
        environment: tableEnv,
      },
    );

    const createProductFn = new nodejs.NodejsFunction(this, 'CreateProduct', {
      functionName: 'createProduct',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      entry: path.join(lambdaDir, 'handlers/create-product.ts'),
      handler: 'handler',
      environment: tableEnv,
    });

    productsTable.grantReadData(getProductsListFn);
    stockTable.grantReadData(getProductsListFn);
    productsTable.grantReadData(getProductsByIdFn);
    stockTable.grantReadData(getProductsByIdFn);
    productsTable.grantWriteData(createProductFn);
    stockTable.grantWriteData(createProductFn);

    const catalogItemsQueue = new sqs.Queue(this, 'CatalogItemsQueue', {
      queueName: 'catalogItemsQueue',
      visibilityTimeout: cdk.Duration.seconds(30),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.catalogItemsQueue = catalogItemsQueue;

    const createProductTopic = new sns.Topic(this, 'CreateProductTopic', {
      topicName: 'createProductTopic',
      displayName: 'Create Product Topic',
    });

    const notificationEmail =
      process.env.NOTIFICATION_EMAIL || 'example@example.com';
    const expensiveProductsEmail =
      process.env.EXPENSIVE_PRODUCTS_EMAIL || notificationEmail;

    // All products subscription
    createProductTopic.addSubscription(
      new subs.EmailSubscription(notificationEmail),
    );

    if (expensiveProductsEmail !== notificationEmail) {
      // High-price products subscription with filter policy
      createProductTopic.addSubscription(
        new subs.EmailSubscription(expensiveProductsEmail, {
          filterPolicy: {
            price: sns.SubscriptionFilter.numericFilter({
              greaterThanOrEqualTo: 100,
            }),
          },
        }),
      );
    }

    const catalogBatchProcessFn = new nodejs.NodejsFunction(
      this,
      'CatalogBatchProcess',
      {
        functionName: 'catalogBatchProcess',
        runtime: lambda.Runtime.NODEJS_22_X,
        memorySize: 256,
        timeout: cdk.Duration.seconds(30),
        entry: path.join(lambdaDir, 'handlers/catalog-batch-process.ts'),
        handler: 'handler',
        environment: {
          ...tableEnv,
          CREATE_PRODUCT_TOPIC_ARN: createProductTopic.topicArn,
        },
      },
    );

    catalogBatchProcessFn.addEventSource(
      new SqsEventSource(catalogItemsQueue, {
        batchSize: 5,
      }),
    );

    productsTable.grantWriteData(catalogBatchProcessFn);
    stockTable.grantWriteData(catalogBatchProcessFn);
    createProductTopic.grantPublish(catalogBatchProcessFn);

    const api = new apigateway.RestApi(this, 'ProductServiceApi', {
      restApiName: 'Product Service',
      description: 'HTTP API for product catalog',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
        ],
      },
      deployOptions: {
        stageName: 'prod',
      },
    });

    const products = api.root.addResource('products');
    
    // Create Cognito authorizer if provided
    let cognitoAuthorizer: apigateway.TokenAuthorizer | undefined = undefined;
    if (props?.cognitoAuthorizerFunction) {
      cognitoAuthorizer = new apigateway.TokenAuthorizer(this, 'CognitoAuthorizer', {
        handler: props.cognitoAuthorizerFunction,
        identitySource: 'method.request.header.Authorization',
        validationRegex: '^Bearer ',
      });
    }
    
    // Add GET /products (with Cognito authorization if available)
    const getProductsMethodOptions: any = {
      // methodResponses: [{ statusCode: '200' }],
    };
    
    if (cognitoAuthorizer) {
      getProductsMethodOptions.authorizer = cognitoAuthorizer;
      getProductsMethodOptions.authorizationType = apigateway.AuthorizationType.CUSTOM;
    }
    
    products.addMethod(
      'GET',
      new apigateway.LambdaIntegration(getProductsListFn),
      getProductsMethodOptions,
    );
    
    products.addMethod(
      'POST',
      new apigateway.LambdaIntegration(createProductFn),
    );

    const productById = products.addResource('{productId}');
    productById.addMethod(
      'GET',
      new apigateway.LambdaIntegration(getProductsByIdFn),
    );

    // Setup Cognito User Pool for additional task
    const userPool = new cognito.UserPool(this, 'ProductServiceUserPool', {
      userPoolName: 'ProductServiceUserPool',
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: false,
        requireDigits: true,
        requireSymbols: false,
      },
      selfSignUpEnabled: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient('ProductServiceClient', {
      userPoolClientName: 'ProductServiceClient',
      authFlows: {
        userPassword: true,
        adminUserPassword: true,
        custom: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: ['http://localhost:3000/', 'http://localhost:5173/'],
        logoutUrls: ['http://localhost:3000/', 'http://localhost:5173/'],
      },
    });

    const domain = userPool.addDomain('ProductServiceDomain', {
      cognitoDomain: {
        domainPrefix: `product-service-${this.account}`,
      },
    });

    this.userPool = userPool;
    this.userPoolClient = userPoolClient;

    this.apiUrl = api.urlForPath('/');

    new cdk.CfnOutput(this, 'ProductServiceApiUrl', {
      value: api.url,
      description: 'Base URL of the Product Service API (stage included)',
    });

    new cdk.CfnOutput(this, 'ProductServiceProductsUrl', {
      value: `${api.url}products`,
      description: 'GET /products, POST /products',
    });

    new cdk.CfnOutput(this, 'ProductsTableName', {
      value: productsTable.tableName,
      description: 'DynamoDB products table (for seed script / AWS Console)',
    });

    new cdk.CfnOutput(this, 'StockTableName', {
      value: stockTable.tableName,
      description: 'DynamoDB stock table (for seed script / AWS Console)',
    });

    new cdk.CfnOutput(this, 'CatalogItemsQueueUrl', {
      value: catalogItemsQueue.queueUrl,
      description: 'SQS queue URL for catalog import events',
    });

    new cdk.CfnOutput(this, 'CreateProductTopicArn', {
      value: createProductTopic.topicArn,
      description: 'SNS topic ARN for created products',
    });

    // Cognito outputs
    new cdk.CfnOutput(this, 'CognitoUserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'CognitoUserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'CognitoHostedUiUrl', {
      value: `https://${domain.domainName}.auth.${this.region}.amazoncognito.com/login?client_id=${userPoolClient.userPoolClientId}&response_type=token&redirect_uri=http://localhost:3000/`,
      description: 'Cognito Hosted UI Login URL for localhost:3000',
    });

    new cdk.CfnOutput(this, 'CognitoHostedUiUrl5173', {
      value: `https://${domain.domainName}.auth.${this.region}.amazoncognito.com/login?client_id=${userPoolClient.userPoolClientId}&response_type=token&redirect_uri=http://localhost:5173/`,
      description: 'Cognito Hosted UI Login URL for localhost:5173 (Vite)',
    });
  }
}
