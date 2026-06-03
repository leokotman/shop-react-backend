import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import { aws_apigateway as apigateway } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as rds from 'aws-cdk-lib/aws-rds';
import { aws_secretsmanager as secretsmanager } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class CartServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const dbCredentialsSecret = new secretsmanager.Secret(this, 'CartDbCredentials', {
      secretName: 'cart-service-db-credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'cart_admin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
      },
    });

    const vpc = new ec2.Vpc(this, 'CartServiceVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'CartLambdaSg', {
      vpc,
      description: 'Security group for Cart service Lambda',
      allowAllOutbound: true,
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'CartDbSg', {
      vpc,
      description: 'Security group for Cart service RDS',
      allowAllOutbound: false,
    });

    dbSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Lambda access to Postgres',
    );

    const database = new rds.DatabaseInstance(this, 'CartPostgresInstance', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_3,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE3,
        ec2.InstanceSize.MICRO,
      ),
      credentials: rds.Credentials.fromSecret(dbCredentialsSecret),
      databaseName: 'cart',
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      multiAz: false,
      publiclyAccessible: false,
      backupRetention: cdk.Duration.days(1),
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deleteAutomatedBackups: true,
    });

    const lambdaFunction = new lambdaNodejs.NodejsFunction(this, 'CartApiLambda', {
      functionName: 'cartServiceApi',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(
        __dirname,
        '..',
        '..',
        'cart-service-api',
        'src',
        'main-lambda.ts',
      ),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [lambdaSecurityGroup],
      depsLockFilePath: path.join(
        __dirname,
        '..',
        '..',
        'cart-service-api',
        'package-lock.json',
      ),
      bundling: {
        externalModules: [
          'aws-sdk',
          '@nestjs/microservices',
          '@nestjs/microservices/microservices-module',
          '@nestjs/websockets/socket-module',
          'class-transformer',
          'class-validator',
        ],
      },
      environment: {
        DB_HOST: database.dbInstanceEndpointAddress,
        DB_PORT: database.dbInstanceEndpointPort,
        DB_NAME: 'cart',
        DB_USERNAME: 'cart_admin',
        DB_SECRET_ARN: dbCredentialsSecret.secretArn,
        DB_SSL_ENABLED: 'true',
      },
    });

    database.connections.allowDefaultPortFrom(lambdaFunction);
    dbCredentialsSecret.grantRead(lambdaFunction);

    const api = new apigateway.RestApi(this, 'NestApi', {
      restApiName: 'Nest Service',
      description: 'This service serves a Nest.js cart application.',
      deployOptions: {
        stageName: 'prod',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key'],
      },
    });

    const getLambdaIntegration = new apigateway.LambdaIntegration(lambdaFunction);
    const proxy = api.root.addResource('{proxy+}');
    proxy.addMethod('ANY', getLambdaIntegration);
    api.root.addMethod('ANY', getLambdaIntegration);

    new cdk.CfnOutput(this, 'CartServiceApiUrl', {
      value: api.url,
      description: 'Base URL of the cart service API',
    });

    new cdk.CfnOutput(this, 'CartServiceProfileCartUrl', {
      value: `${api.url}api/profile/cart`,
      description: 'Cart endpoint URL',
    });
  }
}
