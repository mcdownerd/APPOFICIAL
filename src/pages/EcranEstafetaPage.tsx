"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCcwIcon, ClockIcon, CheckCircleIcon, UtensilsCrossedIcon, MonitorIcon, AlertCircleIcon, Trash2Icon } from 'lucide-react'; // Importar Trash2Icon
import { TicketAPI, Ticket, UserAPI } from '@/lib/api'; // Import UserAPI
import { showError, showSuccess } from '@/utils/toast'; // Importar showSuccess
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useSettings } from "@/context/SettingsContext"; // Importar useSettings
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Import Select components
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Importar Alert components

export default function EcranEstafetaPage() {
  const { user, isAdmin, isRestaurante } = useAuth();
  const { t, i18n } = useTranslation();
  const { isEcranEstafetaEnabled, isSettingsLoading } = useSettings(); // Usar isEcranEstafetaEnabled e isSettingsLoading
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingTickets, setProcessingTickets] = useState<Set<string>>(new Set()); // Para gerenciar o estado de processamento
  const [selectedRestaurant, setSelectedRestaurant] = useState("all"); // 'all' or a specific restaurant_id
  const [availableRestaurants, setAvailableRestaurants] = useState<{ id: string; name: string }[]>([]);

  // Fetch available restaurants for admin filter
  useEffect(() => {
    const fetchRestaurants = async () => {
      if (isAdmin) {
        try {
          const restaurantUsers = await UserAPI.filter({ user_role: "restaurante", status: "APPROVED" });
          const uniqueRestaurantIds = Array.from(new Set(restaurantUsers.map(u => u.restaurant_id).filter(Boolean) as string[]));
          const restaurants = uniqueRestaurantIds.map(id => ({ id, name: `Restaurante ${id.substring(0, 4)}` })); // Simple naming
          setAvailableRestaurants(restaurants);
        } catch (err) {
          console.error("Failed to fetch restaurant users:", err);
          showError(t("failedToLoadRestaurants"));
        }
      }
    };
    fetchRestaurants();
  }, [isAdmin, t]);

  const loadTickets = useCallback(async () => {
    // Não carregar tickets se a funcionalidade não estiver habilitada
    if (!isEcranEstafetaEnabled || !user || (!isAdmin && user.user_role === "restaurante" && !user.restaurant_id)) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    try {
      let fetchedTickets: Ticket[] = [];
      const filter: Partial<Ticket> = { soft_deleted: false };

      if (isAdmin) {
        if (selectedRestaurant !== "all") {
          filter.restaurant_id = selectedRestaurant;
        }
        fetchedTickets = await TicketAPI.filter(filter, "created_date");
      } else if (user.user_role === "restaurante" && user.restaurant_id) {
        filter.restaurant_id = user.restaurant_id;
        fetchedTickets = await TicketAPI.filter(filter, "created_date");
      } else {
        fetchedTickets = [];
      }
      setTickets(fetchedTickets);
    } catch (error) {
      console.error('Error loading tickets:', error);
      showError(t('failedToLoadActiveTickets'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, isAdmin, t, selectedRestaurant, isEcranEstafetaEnabled]); // Adicionar isEcranEstafetaEnabled

  useEffect(() => {
    loadTickets();
    
    // Auto-refresh every 5 seconds
    const interval = setInterval(loadTickets, 5000);
    return () => {
      clearInterval(interval);
    };
  }, [loadTickets]);

  const handleSoftDelete = async (ticket: Ticket) => {
    if (!user || processingTickets.has(ticket.id)) return;
    // Apenas admin e restaurante podem apagar tickets nesta tela
    if (!isAdmin && !isRestaurante) {
      showError(t("permissionDenied"));
      return;
    }

    setProcessingTickets(prev => new Set(prev).add(ticket.id));
    
    try {
      await TicketAPI.update(ticket.id, {
        soft_deleted: true,
        deleted_by_user_id: user.id,
        deleted_by_user_email: user.email,
        restaurant_id: ticket.restaurant_id,
      });
      
      showSuccess(t('ticketRemovedSuccessfully'));
      await loadTickets();
    } catch (error) {
      console.error('Error soft deleting ticket:', error);
      showError(t('failedToRemoveTicket'));
    } finally {
      setProcessingTickets(prev => {
        const newSet = new Set(prev);
        newSet.delete(ticket.id);
        return newSet;
      });
    }
  };

  const getTicketStatus = (ticket: Ticket) => {
    // Sempre retorna CONFIRMADO para o Ecrã Estafeta
    return {
      label: t('acknowledged'),
      icon: CheckCircleIcon,
      className: 'bg-green-100 text-green-800 border-green-200',
      cardClass: 'border-green-300 bg-green-50',
    };
  };

  // Determine the currently selected restaurant name for display
  const currentRestaurantName = isAdmin && selectedRestaurant !== "all"
    ? availableRestaurants.find(r => r.id === selectedRestaurant)?.name || selectedRestaurant
    : null;

  // Helper to get restaurant name for a ticket
  const getRestaurantNameForTicket = (restaurantId: string | undefined) => {
    if (!restaurantId) return t("none");
    const restaurant = availableRestaurants.find(r => r.id === restaurantId);
    return restaurant ? restaurant.name : `Restaurante ${restaurantId.substring(0, 4)}`;
  };

  if (loading || isSettingsLoading) { // Add isSettingsLoading to overall loading state
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <span className="text-gray-700">{t('loadingTickets')}</span>
        </div>
      </div>
    );
  }

  // Mensagem de funcionalidade desabilitada
  if (!isEcranEstafetaEnabled) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center p-4"
      >
        <Alert variant="default" className="max-w-md">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertTitle>{t("featureDisabled")}</AlertTitle>
          <AlertDescription>
            {t("courierScreenFeatureDisabled")}
          </AlertDescription>
        </Alert>
      </motion.div>
    );
  }

  if (!isAdmin && user?.user_role === "restaurante" && !user.restaurant_id) {
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
      {/* Header with refresh button and restaurant selector */}
      <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-4 w-full">
        <div className="text-center sm:text-left flex-1"> {/* Adicionado flex-1 e text-left para sm */}
          <h2 className="text-3xl font-bold text-gray-800">
            {t('courierScreen')}
            {currentRestaurantName && (
              <span className="ml-2 text-blue-600">({currentRestaurantName})</span>
            )}
          </h2>
          <p className="text-muted-foreground">
            {t('activeTicketsDescription', { count: tickets.length })}
          </p>
        </div>
        
        <div className="flex items-center gap-4 mt-4 sm:mt-0 sm:ml-auto"> {/* Adicionado sm:ml-auto */}
          {isAdmin && ( // O seletor de restaurante só aparece para admins
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
          {isAdmin && ( // O botão de atualizar só aparece para admins
            <Button
              onClick={loadTickets}
              variant="outline"
              disabled={refreshing}
              className="space-x-2"
            >
              <RefreshCcwIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{t('refresh')}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Tickets grid */}
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
                      "h-full transition-all duration-200 border-2 relative",
                      status.cardClass,
                      "flex flex-col"
                    )}
                  >
                    {(isAdmin || isRestaurante) && ( // Botão de lixeira só aparece para Admin e Restaurante
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 text-red-500 hover:text-red-700 transition-opacity duration-200"
                        onClick={(e) => {
                          e.stopPropagation(); // Previne que o clique no botão ative o clique do cartão
                          handleSoftDelete(ticket);
                        }}
                        disabled={isProcessing}
                        aria-label={t('removeTicket')}
                      >
                        {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2Icon className="h-5 w-5" />}
                      </Button>
                    )}
                    <CardContent className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                      <div className="text-center">
                        <p className="text-4xl font-mono font-extrabold tracking-wider text-gray-900">
                          {ticket.code}
                        </p>
                      </div>
                      
                      <div className="flex justify-center">
                        <Badge className={cn("px-3 py-1 text-sm font-semibold", status.className)}>
                          <StatusIcon className="h-4 w-4 mr-2" />
                          {status.label}
                        </Badge>
                      </div>
                      
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
}