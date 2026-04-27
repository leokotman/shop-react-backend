export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  count: number;
}

export const PRODUCTS: Product[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    title: 'Cloud Native Handbook',
    description: 'Patterns for building resilient cloud applications.',
    price: 35,
    count: 50,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    title: 'TypeScript Cookbook',
    description: 'Recipes for typed JavaScript at scale.',
    price: 46,
    count: 120,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    title: 'AWS CDK Workshop',
    description: 'Hands-on infrastructure as code.',
    price: 29,
    count: 0,
  },
];

export function findProductById(productId: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === productId);
}
