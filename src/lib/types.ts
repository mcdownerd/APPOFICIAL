export interface User {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  restaurant_id?: string;
  // Outros campos...
}

export enum UserRole {
  ADMIN = 'admin',
  RESTAURANTE = 'restaurante',
  ESTAFETA = 'estafeta',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  REJECTED = 'REJECTED',
  INACTIVE = 'INACTIVE',
}

export interface Ticket {
  id: string;
  code: string;
  customer_name: string;
  delivery_address: string;
  estafeta_id?: string;
  restaurant_id?: string;
  created_by?: string;
  acknowledged_by?: string;
  deleted_by?: string;
  status: 'PENDING' | 'CONFIRMADO';
  created_date: string;
  acknowledged_at?: string;
  deleted_at?: string;
  soft_deleted?: boolean;
}