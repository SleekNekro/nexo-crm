export type Product = {
  code: string;
  name: string;
  family: string;
  price: number;
  description: string;
  active: boolean;
  updatedAt?: string | null;
  version?: number;
  favorite?: boolean;
};
