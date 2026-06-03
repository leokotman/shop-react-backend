# Cart Service Infra (Task 8)

CDK project for cart service serverless infrastructure.

## What it creates

- Lambda (`NodejsFunction`) running NestJS entrypoint from `../cart-service-api/src/main-lambda.ts`
- API Gateway (`RestApi`) as HTTP front door
- RDS PostgreSQL instance
- VPC + security groups for Lambda <-> RDS connectivity
- Secrets Manager secret for DB credentials

## Commands

```bash
npm install
npm run build
npm run bootstrap
npm run deploy
```

After deployment, use `CartServiceApiUrl` output as `VITE_API_CART` in frontend.

To avoid ongoing cost after review:

```bash
npm run destroy
```
