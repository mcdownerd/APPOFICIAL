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
}

export type TicketStatus = "PENDING" | "CONFIRMADO"; // Alterado de "ACKNOWLEDGED" para "CONFIRMADO"

export interface Ticket {
  id: string;
  code: string;
  status: TicketStatus;
  created_by_ip: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  soft_deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  created_date: string;
  created_by: string;
  restaurant_id?: string;
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
    
    // Apply default soft_deleted: false ONLY if 'soft_deleted' is NOT explicitly provided in query
    // This ensures that if soft_deleted is not in the query, we only get active tickets.
    // If soft_deleted is explicitly provided (even as true or false), we respect that.
    if (!query.hasOwnProperty('soft_deleted')) {
      supabaseQuery = supabaseQuery.eq('soft_deleted', false);
    }

    // Apply filters
    for (const [key, value] of Object.entries(query)) {
      // Only apply filter if the key is not 'soft_deleted' or if 'soft_deleted' was explicitly provided
      // This prevents applying 'soft_deleted: false' twice or overriding an explicit 'soft_deleted: true'
      if (value !== undefined && (key !== 'soft_deleted' || query.hasOwnProperty('soft_deleted'))) {
        supabaseQuery = supabaseQuery.eq(key, value);
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
      acknowledged_by: ticket.acknowledged_by_email || null,
      soft_deleted: ticket.soft_deleted,
      deleted_at: ticket.deleted_at || null,
      deleted_by: ticket.deleted_by_email || null,
      created_date: ticket.created_date,
      created_by: ticket.created_by_email || '',
      restaurant_id: ticket.restaurant_id,
    }));
  },

  list: async (order: string = "created_date", limit?: number): Promise<Ticket[]> => {
    // This now correctly defaults to soft_deleted: false
    return TicketAPI.filter({}, order, limit);
  },

  create: async (payload: { code: string }): Promise<Ticket> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error("User not authenticated.");

    // Check for duplicate active code
    const { data: existing } = await supabase
      .from('tickets')
      .select('id')
      .eq('code', payload.code.toUpperCase())
      .eq('soft_deleted', false)
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
        created_by: session.user.id,
        created_by_email: session.user.email,
        created_by_ip: '127.0.0.1', // Use real IP in production
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
      acknowledged_by: null,
      soft_deleted: false,
      deleted_at: null,
      deleted_by: null,
      created_date: data.created_date,
      created_by: data.created_by_email || '',
      restaurant_id: undefined,
    };
  },

  update: async (id: string, payload: Partial<Ticket>): Promise<Ticket> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error("User not authenticated.");

    const updatePayload: any = { 
      ...payload, 
      updated_at: new Date().toISOString() 
    };

    // Convert CONFIRMADO back to ACKED for database if needed
    if (updatePayload.status === "CONFIRMADO") {
      updatePayload.status = "ACKED";
      updatePayload.acknowledged_at = new Date().toISOString();
      updatePayload.acknowledged_by = session.user.id;
      updatePayload.acknowledged_by_email = session.user.email;
    }
    if (updatePayload.soft_deleted === true) {
      updatePayload.deleted_at = new Date().toISOString();
      updatePayload.deleted_by = session.user.id;
      updatePayload.deleted_by_email = session.user.email;
    }

    const { data, error } = await supabase
      .from('tickets')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error("Ticket not found");

    return {
      id: data.id,
      code: data.code,
      status: data.status === "ACKED" ? "CONFIRMADO" : data.status, // Convert ACKED to CONFIRMADO
      created_by_ip: data.created_by_ip,
      acknowledged_at: data.acknowledged_at || null,
      acknowledged_by: data.acknowledged_by_email || null,
      soft_deleted: data.soft_deleted,
      deleted_at: data.deleted_at || null,
      deleted_by: data.deleted_by_email || null,
      created_date: data.created_date,
      created_by: data.created_by_email || '',
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
TicketAPI.create = async (payload: { code: string }): Promise<Ticket> => {
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