export interface WishInput {
  title: string;
  link: string | null;
  priceCents: number | null;
  note: string | null;
}
export interface Wish extends WishInput {
  id: string;
  fulfilled: boolean;
  createdAt: string;
  updatedAt: string;
}
