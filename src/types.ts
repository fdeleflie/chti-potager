export interface Product {
  id: string;
  name: string;
  description?: string;
  category: string;
  unit: 'kg' | 'pièce' | 'pot' | 'sachet';
  price: number;
  isPriceEstimated: boolean;
  availability: 'En stock' | 'Bientôt disponible';
  origin: 'Serre' | 'Plein champ';
  stock: number;
  traceability?: string;
  imageUrl?: string;
  isDiscountActive?: boolean;
  discountPercentage?: number;
  isDeleted?: boolean;
}

export interface Category {
  id: string;
  name: string;
  order?: number;
}

export interface Settings {
  siteName: string;
  welcomeMessage?: string;
  siren: string;
  siret?: string;
  contactName: string;
  legalName?: string;
  email?: string;
  address: string;
  phone: string;
  logoUrl: string;
  pickupSlots: string[];
  openingHours: string;
  rcsCity?: string;
  vatExempt?: boolean;
  insurance?: string;
}
