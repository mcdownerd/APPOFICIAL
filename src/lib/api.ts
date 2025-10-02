"use client";

import { supabase } from "@/integrations/supabase/client";
import { User, UserRole, UserStatus, Ticket } from "./types";

export { User, UserRole, UserStatus, Ticket };

export class UserAPI {
  static async signInWithPassword(email: string, password: string): Promise<User> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error("No user data");
    // Fetch user profile from DB
    const { data: profile } = await supabase.from('users').select('*').eq('id', data.user.id).single();
    if (error) throw error;
    return { ...data.user, ...profile } as User;
  }

  static async signUp(email: string, password: string, full_name: string, role: UserRole): Promise<User> {
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) throw authError;
    if (!authData.user) throw new Error("No user created");

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert({ id: authData.user.id, full_name, email, role, status: UserStatus.ACTIVE })
      .select()
      .single();
    if (profileError) throw profileError;
    return profile as User;
  }

  static async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  static async list(): Promise<User[]> {
    const { data, error } = await supabase.from('users').select('*');
    if (error) throw error;
    return data as User[];
  }

  static async update(id: string, payload: Partial<User>): Promise<User> {
    const { data, error } = await supabase.from('users').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data as User;
  }
}

export class TicketAPI {
  static async filter(query: any, order?: string, limit?: number): Promise<Ticket[]> {
    let supabaseQuery = supabase.from('tickets').select('*');

    // Lidar com ranges em created_date
    if (query.created_date && typeof query.created_date === 'object') {
      if (query.created_date.gte) {
        supabaseQuery = supabaseQuery.gte('created_date', query.created_date.gte);
      }
      if (query.created_date.lte) {
        supabaseQuery = supabaseQuery.lte('created_date', query.created_date.lte);
      }
      delete query.created_date;
    }

    // Aplicar outros filtros
    Object.entries(query).forEach(([key, value]) => {
      supabaseQuery = supabaseQuery.eq(key, value);
    });

    if (order) {
      supabaseQuery = supabaseQuery.order(order);
    }
    if (limit) {
      supabaseQuery = supabaseQuery.limit(limit);
    }

    const { data, error } = await supabaseQuery;
    if (error) throw error;
    return data as Ticket[];
  }

  static async list(order?: string, limit?: number): Promise<Ticket[]> {
    return this.filter({}, order, limit);
  }

  static async create(payload: Omit<Ticket, 'id' | 'created_date' | 'code'>): Promise<Ticket> {
    const { data, error } = await supabase
      .from('tickets')
      .insert({ ...payload, created_date: new Date().toISOString(), code: `TKT-${Date.now()}` })
      .select()
      .single();
    if (error) throw error;
    return data as Ticket;
  }

  static async update(id: string, payload: Partial<Ticket>): Promise<Ticket> {
    const { data, error } = await supabase.from('tickets').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data as Ticket;
  }

  static async acknowledge(id: string, userId: string): Promise<Ticket> {
    const { data, error } = await supabase
      .from('tickets')
      .update({ status: 'CONFIRMADO', acknowledged_at: new Date().toISOString(), acknowledged_by: userId })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Ticket;
  }

  static async softDelete(id: string, userId: string): Promise<Ticket> {
    const { data, error } = await supabase
      .from('tickets')
      .update({ soft_deleted: true, deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Ticket;
  }
}

// Re-export funções para compatibilidade
export const signInWithPassword = UserAPI.signInWithPassword;
export const signUp = UserAPI.signUp;
export const signOut = UserAPI.signOut;