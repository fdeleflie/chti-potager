export interface Product {
  id: string;
  name: string;
  description?: string;
  category: string;
  unit: string;
  price: number;
  isPriceEstimated: boolean;
  availability: 'En stock' | 'Bientôt disponible';
  origin: string;
  stock: number;
  isUnlimited?: boolean;
  isStockVisible?: boolean;
  traceability?: string;
  imageUrl?: string;
  isDiscountActive?: boolean;
  discountPercentage?: number;
  discountType?: 'percentage' | 'buyXgetY';
  buyX?: number;
  getY?: number;
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
  units?: string[];
  origins?: string[];
}
