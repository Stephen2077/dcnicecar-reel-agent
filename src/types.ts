export interface Listing {
  source: "dcnicecar" | "auction";
  url: string | null;
  uid: string;
  title: string;
  year: number | null;
  make: string | null;
  model: string | null;
  price: number | null;
  vin: string | null;
  mileage: number | null;
  contact?: string;
  specs: Record<string, string>;
  imageUrls: string[];
  images: string[];
}
