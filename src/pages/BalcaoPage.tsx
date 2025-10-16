"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCcwIcon, ClockIcon, CheckCircleIcon, Trash2Icon, UtensilsCrossedIcon, SettingsIcon } from 'lucide-react';
import { TicketAPI, Ticket, UserAPI } from '@/lib/api';
import { showSuccess, showError, showInfo } from '@/utils/toast';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useSettings } from "@/context/SettingsContext";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client"; // Adicionado: Importação do cliente Supabase

const BalcaoPage = React.memo(() => {
  const { user, isAdmin, isRestaurante } = useAuth();
  const { t, i18n } = useTranslation();
  const { isPendingLimitEnabled, togglePendingLimit, isSettingsLoading } = useSettings();
  const queryClient = useQueryClient();

  const [processingTickets, setProcessingTickets] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState("all");
  const [availableRestaurants, setAvailableRestaurants] = useState<{ id: string; name: string }[]>([]);

  const doubleClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DOUBLE_CLICK_THRESHOLD = 500; // milliseconds

  const userRestaurantId = user?.restaurant_id;

  // Query para buscar restaurantes disponíveis (apenas para admin)
  const { isLoading: isLoadingRestaurants } = useQuery<{ id: string; name: string }[], Error>({
    queryKey: ["availableRestaurants"],
    queryFn: async () => {
      if (!isAdmin) return [];
      const restaurantUsers = await UserAPI.filter({ user_role: "restaurante", status: "APPROVED" });
      const uniqueRestaurantIds = Array.from(new Set(restaurantUsers.map(u => u.restaurant_id).filter(Boolean) as string[]));
      const restaurants = uniqueRestaurantIds.map(id => ({ id, name: `Restaurante ${id.substring(0, 4)}` }));
      setAvailableRestaurants(restaurants);
      return restaurants;
    },
    enabled: isAdmin,
    staleTime: 1000 * 60 * 10, // Cache por 10 minutos
  });

  // Query para buscar tickets ativos
  const { data: tickets = [], isLoading: isLoadingTickets, refetch: refetchTickets } = useQuery<Ticket[], Error>({
    queryKey: ["activeTickets", userRestaurantId, isAdmin, selectedRestaurant],
    queryFn: async () => {
      if (!user || (!isAdmin && user.user_role === "restaurante" && !userRestaurantId)) {
        return [];
      }
      let filter: Partial<Ticket> = { soft_deleted: false };

      if (isAdmin) {
        if (selectedRestaurant !== "all") {
          filter.restaurant_id = selectedRestaurant;
        }
      } else if (user.user_role === "restaurante" && userRestaurantId) {
        filter.restaurant_id = userRestaurantId;
      } else {
        return [];
      }
      const fetchedTickets = await TicketAPI.filter(filter, "created_date");
      return fetchedTickets;
    },
    enabled: !!user && (isAdmin || (isRestaurante && !!userRestaurantId)),
    staleTime: 1000 * 5, // Re-fetch a cada 5 segundos em background
  });

  // Supabase Realtime subscription for tickets
  useEffect(() => {
    if (!user || (!isAdmin && !userRestaurantId)) return;

    const filterRestaurantId = isAdmin && selectedRestaurant !== "all" ? selectedRestaurant : userRestaurantId;

    if (!filterRestaurantId && !isAdmin) return; // Only subscribe if there's a specific restaurant or if admin (all restaurants)

    console.log(`BalcaoPage: Subscribing to realtime changes for tickets in restaurant ${filterRestaurantId || 'all'}`);

    const channel = supabase // Corrigido: 'supabase' agora está importado
      .channel(`tickets_balcao:${filterRestaurantId || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'tickets',
          filter: filterRestaurantId ? `restaurant_id=eq.${filterRestaurantId}` : undefined // Filter if specific restaurant
        },
        (payload) => {
          console.log('BalcaoPage: Realtime update received:', payload);
          queryClient.invalidateQueries({ queryKey: ["activeTickets", userRestaurantId, isAdmin, selectedRestaurant] });
          queryClient.invalidateQueries({ queryKey: ["pendingTicketsCount", filterRestaurantId] }); // Invalidate pending count for estafeta
        }
      )
      .subscribe();

    return () => {
      console.log(`BalcaoPage: Unsubscribing from realtime changes for tickets in restaurant ${filterRestaurantId || 'all'}`);
      supabase.removeChannel(channel); // Corrigido: 'supabase' agora está importado
    };
  }, [user, isAdmin, userRestaurantId, selectedRestaurant, queryClient]);

  const updateTicketMutation = useMutation({
    mutationFn: async (variables: { ticketId: string; payload: Partial<Ticket> }) => {
      return TicketAPI.update(variables.ticketId, variables.payload);
    },
    onSuccess: (updatedTicket, variables) => {
      if (updatedTicket.status === 'CONFIRMADO') {
        showSuccess(t('ticketConfirmedSuccessfully'));
      } else if (updatedTicket.soft_deleted) {
        showSuccess(t('ticketRemovedSuccessfully'));
      }
      // Invalidate queries to refetch the lists
      queryClient.invalidateQueries({ queryKey: ["activeTickets", userRestaurantId, isAdmin, selectedRestaurant] });
      queryClient.invalidateQueries({ queryKey: ["pendingTicketsCount", userRestaurantId] }); // Invalidate pending count for estafeta
      queryClient.invalidateQueries({ queryKey: ["userRecentTickets", user?.id, userRestaurantId] }); // Invalidate recent tickets for estafeta
      queryClient.invalidateQueries({ queryKey: ["analysis"] }); // Invalidate analysis data
    },
    onError: (error: any, variables) => {
      console.error('Error updating ticket:', error);
      if (variables.payload.status === 'CONFIRMADO') {
        showError(t('failedToConfirmTicket'));
      } else if (variables.payload.soft_deleted) {
        showError(t('failedToRemoveTicket'));
      } else {
        showError(t('failedToUpdateTicket'));
      }
    },
    onSettled: (data, error, variables) => {
      setProcessingTickets(prev => {
        const newSet = new Set(prev);
        newSet.delete(variables.ticketId);
        return newSet;
      });
    }
  });

  const handleTicketClick = useCallback(async (ticket: Ticket) => {
    if (!user) {
      showError(t("userNotAuthenticated"));
      return;
    }
    if (processingTickets.has(ticket.id)) return;

    if (ticket.status === 'PENDING') {
      await handleAcknowledge(ticket);
    } else if (ticket.status === 'CONFIRMADO') {
      if (pendingDelete === ticket.id) {
        if (doubleClickTimeoutRef.current) {
          clearTimeout(doubleClickTimeoutRef.current);
          doubleClickTimeoutRef.current = null;
        }
        await handleSoftDelete(ticket);
        setPendingDelete(null);
      } else {
        if (doubleClickTimeoutRef.current) {
          clearTimeout(doubleClickTimeoutRef.current);
          doubleClickTimeoutRef.current = null;
        }
        setPendingDelete(ticket.id);
        showInfo(t('clickAgainToRemove'));
        
        doubleClickTimeoutRef.current = setTimeout(() => {
          setPendingDelete(null);
          doubleClickTimeoutRef.current = null;
        }, DOUBLE_CLICK_THRESHOLD);
      }
    }
  }, [user, processingTickets, pendingDelete, t]);

  const handleAcknowledge = useCallback(async (ticket: Ticket) => {
    if (!user || processingTickets.has(ticket.id)) return;

    setProcessingTickets(prev => new Set(prev).add(ticket.id));
    updateTicketMutation.mutate({
      ticketId: ticket.id,
      payload: {
        status: 'CONFIRMADO',
        acknowledged_by_user_id: user.id,
        acknowledged_by_user_email: user.email,
        restaurant_id: ticket.restaurant_id,
      }
    });
  }, [user, processingTickets, updateTicketMutation]);

  const handleSoftDelete = useCallback(async (ticket: Ticket) => {
    if (!user || processingTickets.has(ticket.id)) return;

    setProcessingTickets(prev => new Set(prev).add(ticket.id));
    updateTicketMutation.mutate({
      ticketId: ticket.id,
      payload: {
        soft_deleted: true,
        deleted_by_user_id: user.id,
        deleted_by_user_email: user.email,
        restaurant_id: ticket.restaurant_id,
      }
    });
  }, [user, processingTickets, updateTicketMutation]);

  const getTicketStatus = useCallback((ticket: Ticket) => {
    if (ticket.status === 'PENDING') {
      return {
        label: t('pending'),
        icon: ClockIcon,
        className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        cardClass: 'border-yellow-300 bg-yellow-50',
        clickable: true,
        clickText: t('clickToConfirm')
      };
    }
    
    return {
      label: t('acknowledged'),
      icon: CheckCircleIcon,
      className: 'bg-green-100 text-green-800 border-green-200',
      cardClass: 'border-green-300 bg-green-50',
      clickable: true,
      clickText: pendingDelete === ticket.id 
        ? t('clickAgainToRemove')
        : t('removeTicket')
    };
  }, [t, pendingDelete]);

  const currentRestaurantName = isAdmin && selectedRestaurant !== "all"
    ? availableRestaurants.find(r => r.id === selectedRestaurant)?.name || selectedRestaurant
    : null;

  const isSwitchDisabled = isSettingsLoading || (!isAdmin && !isRestaurante);

  if (isLoadingTickets || isLoadingRestaurants || isSettingsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <span className="text-gray-700">{t('loadingTickets')}</span>
        </div>
      </div>
    );
  }

  if (!isAdmin && user?.user_role === "restaurante" && !userRestaurantId) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center p-4"
      >
        <UtensilsCrossedIcon className="h-16 w-16 text-red-500 mb-4" />
        <h3 className="text-2xl font-bold text-gray-800">{t("restaurantIdMissing")}</h3>
        <p className="text-lg text-gray-600">
          {t("assignRestaurantIdMessage")}
        </p>
        <Button onClick={() => window.location.reload()} className="mt-4">
          {t("refreshPage")}
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-800">
            {t('ordersCounter')}
            {currentRestaurantName && (
              <span className="ml-2 text-blue-600">({currentRestaurantName})</span>
            )}
          </h2>
          <p className="text-muted-foreground">
            {t('activeTicketsDescription', { count: tickets.length })}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {isAdmin && (
            <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t("selectRestaurant")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                {availableRestaurants.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            onClick={() => refetchTickets()}
            variant="outline"
            disabled={isLoadingTickets}
            className="space-x-2"
          >
            <RefreshCcwIcon className={`h-4 w-4 ${isLoadingTickets ? 'animate-spin' : ''}`} />
            <span>{t('refresh')}</span>
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-gray-600" />
            <h3 className="text-lg font-semibold">{t("pendingLimitSettings")}</h3>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="pending-limit-toggle"
              checked={isPendingLimitEnabled}
              onCheckedChange={togglePendingLimit}
              disabled={isSwitchDisabled}
            />
            <Label htmlFor="pending-limit-toggle">{t("enablePendingLimit")}</Label>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          {t("pendingLimitDescription")}
        </p>
      </Card>

      {tickets.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12"
        >
          <Card className="shadow-lg">
            <CardContent className="py-12">
              <UtensilsCrossedIcon className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="text-lg font-medium mb-2 text-gray-800">{t('noActiveTickets')}</h3>
              <p className="text-muted-foreground">
                {t('awaitingNewCodes')}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence>
            {tickets.map((ticket, index) => {
              const status = getTicketStatus(ticket);
              const StatusIcon = status.icon;
              const isProcessing = processingTickets.has(ticket.id);
              const isPendingDelete = pendingDelete === ticket.id;
              
              return (
                <motion.div
                  key={ticket.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: -20 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="group"
                >
                  <Card 
                    className={cn(
                      "h-full cursor-pointer transition-all duration-200 border-2",
                      status.cardClass,
                      status.clickable ? 'hover:shadow-lg hover:scale-105' : '',
                      isPendingDelete ? 'ring-4 ring-red-500 shadow-xl' : 'hover-lift',
                      isProcessing ? 'opacity-60 cursor-not-allowed' : '',
                      "flex flex-col"
                    )}
                    onClick={() => !isProcessing && handleTicketClick(ticket)}
                  >
                    <CardContent className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                      <div className="text-center">
                        <p className="text-4xl font-mono font-extrabold tracking-wider text-gray-900">
                          {ticket.code}
                        </p>
                      </div>
                      
                      <div className="flex justify-center">
                        <Badge className={cn("px-3 py-1 text-sm font-semibold", status.className)}>
                          {isProcessing ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <StatusIcon className="h-4 w-4 mr-2" />
                          )}
                          {status.label}
                        </Badge>
                      </div>
                      
                      {status.clickable && !isProcessing && (
                        <div className="text-center mt-2">
                          <p className={cn("text-xs font-medium", isPendingDelete ? 'text-red-700' : 'text-muted-foreground')}>
                            {status.clickText}
                          </p>
                        </div>
                      )}
                      
                      <div className="text-center text-xs text-muted-foreground space-y-1 mt-auto pt-3 border-t border-gray-200/50">
                        <p>
                          {t('created')}: {format(parseISO(ticket.created_date), 'HH:mm', { locale: i18n.language === 'pt' ? ptBR : undefined })}
                        </p>
                        {ticket.acknowledged_at && (
                          <p>
                            {t('confirmed')}: {format(parseISO(ticket.acknowledged_at), 'HH:mm', { locale: i18n.language === 'pt' ? ptBR : undefined })}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
});

export default BalcaoPage;