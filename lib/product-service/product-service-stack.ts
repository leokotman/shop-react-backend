import * as path from 'path';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export class ProductServiceStack extends cdk.Stack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const lambdaDir = path.join(__dirname, 'lambda');

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
      },
    );

    const api = new apigateway.RestApi(this, 'ProductServiceApi', {
      restApiName: 'Product Service',
      description: 'HTTP API for product catalog',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'OPTIONS'],
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
    products.addMethod(
      'GET',
      new apigateway.LambdaIntegration(getProductsListFn),
    );

    const productById = products.addResource('{productId}');
    productById.addMethod(
      'GET',
      new apigateway.LambdaIntegration(getProductsByIdFn),
    );

    this.apiUrl = api.urlForPath('/');

    new cdk.CfnOutput(this, 'ProductServiceApiUrl', {
      value: api.url,
      description: 'Base URL of the Product Service API (stage included)',
    });

    new cdk.CfnOutput(this, 'ProductServiceProductsUrl', {
      value: `${api.url}products`,
      description: 'GET /products',
    });
  }
}
