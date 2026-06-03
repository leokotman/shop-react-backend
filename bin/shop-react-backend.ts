#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ProductServiceStack } from '../lib/product-service/product-service-stack';
import { ImportServiceStack } from '../lib/import-service/import-service-stack';
import { AuthorizationServiceStack } from '../lib/authorization-service/authorization-service-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const authorizationServiceStack = new AuthorizationServiceStack(app, 'AuthorizationServiceStack', {
  env,
});

const productServiceStack = new ProductServiceStack(app, 'ProductServiceStack', {
  env,
});

new ImportServiceStack(app, 'ImportServiceStack', {
  env,
  catalogItemsQueue: productServiceStack.catalogItemsQueue,
});
