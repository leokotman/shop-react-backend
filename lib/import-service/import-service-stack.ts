import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

export class ImportServiceStack extends cdk.Stack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const importBucket = new s3.Bucket(this, 'ImportBucket', {
      bucketName: `import-service-bucket-${this.account}-${this.region}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: ['*'],
          exposedHeaders: [],
        },
      ],
    });

    const lambdaDir = path.join(__dirname, 'lambda');

    const bucketEnv = { IMPORT_BUCKET_NAME: importBucket.bucketName };

    const importProductsFileFn = new nodejs.NodejsFunction(
      this,
      'ImportProductsFile',
      {
        functionName: 'importProductsFile',
        runtime: lambda.Runtime.NODEJS_22_X,
        memorySize: 256,
        timeout: cdk.Duration.seconds(10),
        entry: path.join(lambdaDir, 'handlers/import-products-file.ts'),
        handler: 'handler',
        environment: bucketEnv,
      },
    );

    const importFileParserFn = new nodejs.NodejsFunction(
      this,
      'ImportFileParser',
      {
        functionName: 'importFileParser',
        runtime: lambda.Runtime.NODEJS_22_X,
        memorySize: 256,
        timeout: cdk.Duration.seconds(30),
        entry: path.join(lambdaDir, 'handlers/import-file-parser.ts'),
        handler: 'handler',
        environment: bucketEnv,
      },
    );

    // Grant permissions
    importBucket.grantPut(importProductsFileFn);
    importBucket.grantReadWrite(importFileParserFn);
    importBucket.grantDelete(importFileParserFn);

    // Trigger importFileParser on objects created in uploaded/ folder
    importBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(importFileParserFn),
      { prefix: 'uploaded/' },
    );

    const api = new apigateway.RestApi(this, 'ImportServiceApi', {
      restApiName: 'Import Service',
      description: 'HTTP API for importing product CSV files',
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

    const importResource = api.root.addResource('import');
    importResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(importProductsFileFn),
      {
        requestParameters: {
          'method.request.querystring.name': true,
        },
      },
    );

    this.apiUrl = api.urlForPath('/');

    new cdk.CfnOutput(this, 'ImportServiceApiUrl', {
      value: api.url,
      description: 'Base URL of the Import Service API (stage included)',
    });

    new cdk.CfnOutput(this, 'ImportServiceImportUrl', {
      value: `${api.url}import`,
      description: 'GET /import?name=<filename.csv>',
    });

    new cdk.CfnOutput(this, 'ImportBucketName', {
      value: importBucket.bucketName,
      description: 'S3 bucket for CSV imports',
    });
  }
}
