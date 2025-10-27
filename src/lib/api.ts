import { formatISO, parseISO, differenceInMinutes } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { AuthResponse } from '@supabase/supabase-js';

// --- Interfaces (mantidas iguais) ---
export type UserRole = "admin" | "restaurante" | "estafeta";
export type UserStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface User {
  id: string;
  email: string;
  full_name: string;
  user_role: UserRole;
  status: UserStatus;
  created_date: string; // ISO date string
  restaurant_id?: string;
  dashboard_access_code?: string | null; // Nova coluna
  dashboard_activated_at?: string | null; // Nova coluna
}

export type TicketStatus = "PENDING" | "CONFIRMADO"; // Alterado de "ACKNOWLEDGED" para "CONFIRMADO"

export interface Ticket {
  id: string;
  code: string;
  status: TicketStatus;
  created_by_ip: string;
  acknowledged_at: string | null;
  acknowledged_by_user_id: string | null; // User ID (UUID)
  acknowledged_by_user_email: string | null; // User Email
  soft_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null; // User ID (UUID)
  deleted_by_user_email: string | null; // User Email
  created_date: string;
  created_by_user_id: string; // User ID (UUID)
  created_by_user_email: string; // User Email
  restaurant_id?: string;
}

// Nova interface para Restaurante
export interface Restaurant {
  id: string;
  name: string;
  pending_limit_enabled: boolean;
  ecran_estafeta_enabled: boolean; // Nova coluna
  created_at: string;
  updated_at: string;
}

// --- Supabase Auth Helpers ---
export const signInWithPassword = async (email: string, password: string): Promise<AuthResponse> => {
  return supabase.auth.signInWithPassword({ email, password });
};

export const signUp = async (email: string, password: string, fullName?: string): Promise<AuthResponse> => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }
    }
  });
  if (error) throw error;
  return { data, error: null };
};

export const signOut = async () => {
  return supabase.auth.signOut();
};

// --- User API (usando profiles table) ---
export const UserAPI = {
  me: async (): Promise<User | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      email: data.email,
      full_name: data.full_name,
      user_role: data.user_role,
      status: data.status,
      created_date: data.created_date,
      restaurant_id: data.restaurant_id,
      dashboard_access_code: data.dashboard_access_code, // Nova coluna
      dashboard_activated_at: data.dashboard_activated_at, // Nova coluna
    };
  },

  login: async (email: string, password: string): Promise<User> => {
    const { data: { session }, error } = await signInWithPassword(email, password);
    if (error) throw error;
    if (!session?.user) throw new Error("No session after login");

    const user = await UserAPI.me();
    if (!user) throw new Error("User profile not found");

    return user;
  },

  register: async (fullName: string, email: string, password: string): Promise<User> => {
    const { data, error } = await signUp(email, password, fullName);
    if (error) throw error;
    if (!data.session) throw new Error("No session after signup");

    // Auto-login after signup
    const loginResponse = await signInWithPassword(email, password);
    if (loginResponse.error) throw loginResponse.error;

    const user = await UserAPI.me();
    if (!user) throw new Error("User profile not created");

    return user;
  },

  logout: async (): Promise<void> => {
    const { error } = await signOut();
    if (error) throw error;
  },

  filter: async (
    query: Partial<User>,
    order: string = "created_date",
    limit?: number,
  ): Promise<User[]> => {
    let supabaseQuery = supabase.from('profiles').select('*');

    // Apply filters
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        supabaseQuery = supabaseQuery.eq(key, value);
      }
    }

    // Order (Supabase uses ascending by default; for desc, use order('-field'))
    const orderField = order.startsWith('-') ? order.substring(1) : order;
    const orderDir = order.startsWith('-') ? 'desc' : 'asc';
    supabaseQuery = supabaseQuery.order(orderField, { ascending: orderDir === 'asc' });

    if (limit) supabaseQuery = supabaseQuery.limit(limit);

    const { data, error } = await supabaseQuery;
    if (error) throw error;

    return data.map(profile => ({
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      user_role: profile.user_role,
      status: profile.status,
      created_date: profile.created_date,
      restaurant_id: profile.restaurant_id,
      dashboard_access_code: profile.dashboard_access_code, // Nova coluna
      dashboard_activated_at: profile.dashboard_activated_at, // Nova coluna
    }));
  },

  update: async (id: string, payload: Partial<User>): Promise<User> => {
    const { data, error } = await supabase
      .from('profiles')
      .update({ 
        ...payload, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error("User not found");

    return {
      id: data.id,
      email: data.email,
      full_name: data.full_name,
      user_role: data.user_role,
      status: data.status,
      created_date: data.created_date,
      restaurant_id: data.restaurant_id,
      dashboard_access_code: data.dashboard_access_code, // Nova coluna
      dashboard_activated_at: data.dashboard_activated_at, // Nova coluna
    };
  },
};

// --- Restaurant API ---
export const RestaurantAPI = {
  create: async (id: string, name: string): Promise<Restaurant> => {
    const { data, error } = await supabase
      .from('restaurants')
      .insert({ id, name, pending_limit_enabled: true, ecran_estafeta_enabled: false }) // Default to false
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique violation error code
        const customError = new Error("Restaurant ID already exists.");
        (customError as any).statusCode = 409;
        throw customError;
      }
      throw error;
    }
    if (!data) throw new Error("Restaurant not created");

    return {
      id: data.id,
      name: data.name,
      pending_limit_enabled: data.pending_limit_enabled,
      ecran_estafeta_enabled: data.ecran_estafeta_enabled, // Nova coluna
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  },
  
  list: async (): Promise<Restaurant[]> => {
    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return data.map(r => ({
      id: r.id,
      name: r.name,
      pending_limit_enabled: r.pending_limit_enabled,
      ecran_estafeta_enabled: r.ecran_estafeta_enabled, // Nova coluna
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  },

  update: async (id: string, payload: Partial<Restaurant>): Promise<Restaurant> => {
    const { data, error } = await supabase
      .from('restaurants')
      .update({ 
        ...payload, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error("Restaurant not found");

    return {
      id: data.id,
      name: data.name,
      pending_limit_enabled: data.pending_limit_enabled,
      ecran_estafeta_enabled: data.ecran_estafeta_enabled, // Nova coluna
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  },
};


// --- Ticket API ---
export const TicketAPI = {
  filter: async (
    query: Partial<Ticket>,
    order: string = "created_date",
    limit?: number,
  ): Promise<Ticket[]> => {
    let supabaseQuery = supabase
      .from('tickets')
      .select('*');
    
    // Apply filters
    for (const [key, value] of Object.entries(query)) {
      // Map new interface fields to database column names
      let dbKey = key;
      if (key === 'acknowledged_by_user_id') dbKey = 'acknowledged_by';
      if (key === 'acknowledged_by_user_email') dbKey = 'acknowledged_by_email';
      if (key === 'deleted_by_user_id') dbKey = 'deleted_by';
      if (key === 'deleted_by_user_email') dbKey = 'deleted_by_email';
      if (key === 'created_by_user_id') dbKey = 'created_by';
      if (key === 'created_by_user_email') dbKey = 'created_by_email';

      if (value !== undefined) {
        supabaseQuery = supabaseQuery.eq(dbKey, value);
      }
    }

    // Order
    const orderField = order.startsWith('-') ? order.substring(1) : order;
    const orderDir = order.startsWith('-') ? 'desc' : 'asc';
    supabaseQuery = supabaseQuery.order(orderField, { ascending: orderDir === 'asc' });

    if (limit) supabaseQuery = supabaseQuery.limit(limit);

    const { data, error } = await supabaseQuery;
    if (error) throw error;

    return data.map(ticket => ({
      id: ticket.id,
      code: ticket.code,
      status: ticket.status === "ACKED" ? "CONFIRMADO" : ticket.status, // Convert ACKED to CONFIRMADO
      created_by_ip: ticket.created_by_ip,
      acknowledged_at: ticket.acknowledged_at || null,
      acknowledged_by_user_id: ticket.acknowledged_by || null, // Map to new field
      acknowledged_by_user_email: ticket.acknowledged_by_email || null, // Map to new field
      soft_deleted: ticket.soft_deleted,
      deleted_at: ticket.deleted_at || null,
      deleted_by_user_id: ticket.deleted_by || null, // Map to new field
      deleted_by_user_email: ticket.deleted_by_email || null, // Map to new field
      created_date: ticket.created_date,
      created_by_user_id: ticket.created_by || '', // Corrigido aqui
      created_by_user_email: ticket.created_by_email || '', // Corrigido aqui
      restaurant_id: ticket.restaurant_id,
    }));
  },

  list: async (order: string = "created_date", limit?: number): Promise<Ticket[]> => {
    // This now correctly defaults to soft_deleted: false
    return TicketAPI.filter({}, order, limit);
  },

  create: async (payload: { code: string; restaurant_id?: string }): Promise<Ticket> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error("User not authenticated.");

    // Check for duplicate active code within the same restaurant
    const { data: existing } = await supabase
      .from('tickets')
      .select('id')
      .eq('code', payload.code.toUpperCase())
      .eq('soft_deleted', false)
      .eq('restaurant_id', payload.restaurant_id || null) // Filter by restaurant_id
      .maybeSingle();

    if (existing) {
      const error = new Error("DUPLICATE_ACTIVE_CODE") as any;
      error.statusCode = 409;
      throw error;
    }

    const { data, error } = await supabase
      .from('tickets')
      .insert({
        code: payload.code.toUpperCase(),
        created_by: session.user.id, // Use user ID
        created_by_email: session.user.email, // Use user email
        created_by_ip: '127.0.0.1', // Use real IP in production
        restaurant_id: payload.restaurant_id || null, // Save restaurant_id
      })
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error("Ticket not created");

    return {
      id: data.id,
      code: data.code,
      status: data.status === "ACKED" ? "CONFIRMADO" : data.status, // Convert ACKED to CONFIRMADO
      created_by_ip: data.created_by_ip,
      acknowledged_at: null,
      acknowledged_by_user_id: null,
      acknowledged_by_user_email: null,
      soft_deleted: false,
      deleted_at: null,
      deleted_by_user_id: null,
      deleted_by_user_email: null,
      created_date: data.created_date,
      created_by_user_id: data.created_by || '',
      created_by_user_email: data.created_by_email || '',
      restaurant_id: data.restaurant_id,
    };
  },

  update: async (id: string, payload: Partial<Ticket>): Promise<Ticket> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error("User not authenticated.");

    const updatePayload: any = { 
      ...payload, 
      updated_at: new Date().toISOString() 
    };

    // Map new interface fields to database column names for update
    if (payload.acknowledged_by_user_id !== undefined) {
      updatePayload.acknowledged_by = payload.acknowledged_by_user_id;
      delete updatePayload.acknowledged_by_user_id;
    }
    if (payload.acknowledged_by_user_email !== undefined) {
      updatePayload.acknowledged_by_email = payload.acknowledged_by_user_email;
      delete updatePayload.acknowledged_by_user_email;
    }
    if (payload.deleted_by_user_id !== undefined) {
      updatePayload.deleted_by = payload.deleted_by_user_id;
      delete updatePayload.deleted_by_user_id;
    }
    if (payload.deleted_by_user_email !== undefined) {
      updatePayload.deleted_by_email = payload.deleted_by_user_email;
      delete updatePayload.deleted_by_user_email;
    }
    if (payload.created_by_user_id !== undefined) {
      updatePayload.created_by = payload.created_by_user_id;
      delete updatePayload.created_by_user_id;
    }
    if (payload.created_by_user_email !== undefined) {
      updatePayload.created_by_email = payload.created_by_user_email;
      delete updatePayload.created_by_user_email;
    }

    // Convert CONFIRMADO back to ACKED for database if needed
    if (updatePayload.status === "CONFIRMADO") {
      updatePayload.status = "ACKED";
      updatePayload.acknowledged_at = new Date().toISOString();
      updatePayload.acknowledged_by = session.user.id; // Use user ID
      updatePayload.acknowledged_by_email = session.user.email; // Use user email
    }
    if (updatePayload.soft_deleted === true) {
      updatePayload.deleted_at = new Date().toISOString();
      updatePayload.deleted_by = session.user.id; // Use user ID
      updatePayload.deleted_by_email = session.user.email; // Use user email
    }

    let supabaseQuery = supabase
      .from('tickets')
      .update(updatePayload)
      .eq('id', id);

    // REMOVIDO: O filtro de restaurant_id no lado do cliente para updates.
    // A RLS já garante que apenas usuários autorizados (admin ou restaurante do ticket) podem atualizar.
    // if (payload.restaurant_id !== undefined) {
    //   supabaseQuery = supabaseQuery.eq('restaurant_id', payload.restaurant_id);
    // }

    const { data, error } = await supabaseQuery
      .select()
      .maybeSingle(); // Alterado de .single() para .maybeSingle()

    if (error) throw error;
    if (!data) {
      // Se não houver dados, significa que o ticket não foi encontrado ou o usuário não tem permissão.
      throw new Error("Ticket not found or user does not have permission to update it. Check RLS policies.");
    }

    return {
      id: data.id,
      code: data.code,
      status: data.status === "ACKED" ? "CONFIRMADO" : data.status, // Convert ACKED to CONFIRMADO
      created_by_ip: data.created_by_ip,
      acknowledged_at: data.acknowledged_at || null,
      acknowledged_by_user_id: data.acknowledged_by || null,
      acknowledged_by_user_email: data.acknowledged_by_email || null,
      soft_deleted: data.soft_deleted,
      deleted_at: data.deleted_at || null,
      deleted_by_user_id: data.deleted_by || null,
      deleted_by_user_email: data.deleted_by_email || null,
      created_date: data.created_date,
      created_by_user_id: data.created_by || '',
      created_by_user_email: data.created_by_email || '',
      restaurant_id: data.restaurant_id,
    };
  },
};

// Rate limiting would need server-side (Edge Function), but for now, client-side mock remains optional
let lastCreateTime = 0;
const RATE_LIMIT_INTERVAL = 5000;
const MAX_REQUESTS = 3;
let requestCount = 0;

const originalTicketCreate = TicketAPI.create;
TicketAPI.create = async (payload: { code: string; restaurant_id?: string }): Promise<Ticket> => {
  const now = Date.now();
  if (now - lastCreateTime > RATE_LIMIT_INTERVAL) {
    requestCount = 0;
    lastCreateTime = now;
  }
  requestCount++;
  if (requestCount > MAX_REQUESTS) {
    const error = new Error("RATE_LIMIT_EXCEEDED") as any;
    error.statusCode = 429;
    error.retryAfter = 30;
    throw error;
  }
  return originalTicketCreate(payload);
};