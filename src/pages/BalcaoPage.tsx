"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCcwIcon, ClockIcon, CheckCircleIcon, Trash2Icon, UtensilsCrossedIcon, SettingsIcon } from 'lucide-react';
import { TicketAPI, Ticket, UserAPI } from '@/lib/api'; // Import UserAPI
import { showSuccess, showError, showInfo } from '@/utils/toast';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useSettings } from "@/context/SettingsContext";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Import Select components

export default function BalcaoPage() {
  const { user, isAdmin } = useAuth();
  const { t, i18n } = useTranslation();
  const { isPendingLimitEnabled, togglePendingLimit } = useSettings();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingTickets, setProcessingTickets] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>("all"); // 'all' or a specific restaurant_id
  const [availableRestaurants, setAvailableRestaurants] = useState<{ id: string; name: string }[]>([]);

  const doubleClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DOUBLE_CLICK_THRESHOLD = 500; // milliseconds

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
    if (!user || (!isAdmin && user.user_role === "restaurante" && !user.restaurant_id)) {
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
  }, [user, isAdmin, t, selectedRestaurant]); // Add selectedRestaurant to dependencies

  useEffect(() => {
    loadTickets();
    
    // Auto-refresh every 5 seconds
    const interval = setInterval(loadTickets, 5000);
    return () => {
      clearInterval(interval);
      if (doubleClickTimeoutRef.current) {
        clearTimeout(doubleClickTimeoutRef.current);
        doubleClickTimeoutRef.current = null;
      }
    };
  }, [loadTickets]);

  const handleTicketClick = async (ticket: Ticket) => {
    if (!user) {
      showError(t("userNotAuthenticated"));
      return;
    }
    if (processingTickets.has(ticket.id)) return;

    if (ticket.status === 'PENDING') {
      // Acknowledge ticket
      await handleAcknowledge(ticket);
    } else if (ticket.status === 'CONFIRMADO') {
      if (pendingDelete === ticket.id) {
        // This is the second click on the same ticket
        if (doubleClickTimeoutRef.current) {
          clearTimeout(doubleClickTimeoutRef.current);
          doubleClickTimeoutRef.current = null; // Clear the ref
        }
        await handleSoftDelete(ticket);
        setPendingDelete(null); // Clear pendingDelete after successful deletion
      } else {
        // This is the first click on this ticket (or a new first click after timeout)
        // Clear any existing pending delete for other tickets
        if (doubleClickTimeoutRef.current) {
          clearTimeout(doubleClickTimeoutRef.current);
          doubleClickTimeoutRef.current = null;
        }
        setPendingDelete(ticket.id);
        showInfo(t('clickAgainToRemove'));
        
        doubleClickTimeoutRef.current = setTimeout(() => {
          setPendingDelete(null); // Reset pendingDelete if no second click within threshold
          doubleClickTimeoutRef.current = null;
        }, DOUBLE_CLICK_THRESHOLD);
      }
    }
  };

  const handleAcknowledge = async (ticket: Ticket) => {
    if (!user || processingTickets.has(ticket.id)) return;

    setProcessingTickets(prev => new Set(prev).add(ticket.id));
    
    try {
      await TicketAPI.update(ticket.id, {
        status: 'CONFIRMADO',
        acknowledged_by_user_id: user.id,
        acknowledged_by_user_email: user.email,
        restaurant_id: ticket.restaurant_id,
      });
      
      showSuccess(t('ticketConfirmedSuccessfully'));
      await loadTickets();
    } catch (error) {
      console.error('Error acknowledging ticket:', error);
      showError(t('failedToConfirmTicket'));
    } finally {
      setProcessingTickets(prev => {
        const newSet = new Set(prev);
        newSet.delete(ticket.id);
        return newSet;
      });
    }
  };

  const handleSoftDelete = async (ticket: Ticket) => {
    if (!user || processingTickets.has(ticket.id)) return;

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <span className="text-gray-700">{t('loadingTickets')}</span>
        </div>
      </div>
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
            onClick={loadTickets}
            variant="outline"
            disabled={refreshing}
            className="space-x-2"
          >
            <RefreshCcwIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{t('refresh')}</span>
          </Button>
        </div>
      </div>

      {/* Pending Limit Settings Card */}
      {(isAdmin || user?.user_role === "restaurante") && (
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
              />
              <Label htmlFor="pending-limit-toggle">{t("enablePendingLimit")}</Label>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {t("pendingLimitDescription")}
          </p>
        </Card>
      )}

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

                      {ticket.restaurant_id && (isAdmin || (user?.user_role === "restaurante" && selectedRestaurant === "all")) && (
                        <div className="text-center text-sm text-gray-600 mt-2">
                          <p className="font-medium">{t("restaurantName")}: {getRestaurantNameForTicket(ticket.restaurant_id)}</p>
                        </div>
                      )}
                      
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
}