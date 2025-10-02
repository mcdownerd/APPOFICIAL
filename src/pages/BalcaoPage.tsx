"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCcwIcon, ClockIcon, CheckCircleIcon, Trash2Icon, UtensilsCrossedIcon, SettingsIcon } from 'lucide-react';
import { TicketAPI, Ticket } from '@/lib/api';
import { showSuccess, showError, showInfo } from '@/utils/toast';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useSettings } from "@/context/SettingsContext"; // Import useSettings
import { Switch } from "@/components/ui/switch"; // Import Switch
import { Label } from "@/components/ui/label"; // Import Label

export default function BalcaoPage() {
  const { user, isAdmin } = useAuth();
  const { t, i18n } = useTranslation();
  const { isPendingLimitEnabled, togglePendingLimit } = useSettings(); // Use settings context
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingTickets, setProcessingTickets] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const doubleClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DOUBLE_CLICK_THRESHOLD = 500; // milliseconds

  const loadTickets = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      let fetchedTickets: Ticket[] = [];
      if (isAdmin) {
        // Admin vê todos os tickets ativos
        fetchedTickets = await TicketAPI.filter({ soft_deleted: false }, "created_date");
      } else if (user.user_role === "restaurante" && user.restaurant_id) {
        // Restaurante vê tickets PENDING sem restaurant_id E tickets CONFIRMADO com seu restaurant_id
        const pendingTickets = await TicketAPI.filter({ soft_deleted: false, status: "PENDING", restaurant_id: undefined }, "created_date");
        const confirmedTickets = await TicketAPI.filter({ soft_deleted: false, status: "CONFIRMADO", restaurant_id: user.restaurant_id }, "created_date");
        fetchedTickets = [...pendingTickets, ...confirmedTickets];
      } else {
        // Outros papéis (estafeta) não veem tickets aqui
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
  }, [user, isAdmin, t]);

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
      await TicketAPI.update(ticket.id, { // Passar id como primeiro argumento
        status: 'CONFIRMADO',
        acknowledged_by: user.id,
        restaurant_id: user.restaurant_id // Atribuir o ticket ao restaurante que o confirmou
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
      await TicketAPI.update(ticket.id, { // Passar id como primeiro argumento
        soft_deleted: true,
        deleted_by: user.id
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
        className: 'bg-yellow-100 text-yellow-800',
        clickable: true,
        clickText: t('clickToConfirm')
      };
    }
    
    return {
      label: t('ready'),
      icon: CheckCircleIcon,
      className: 'bg-green-100 text-green-800',
      clickable: true,
      clickText: pendingDelete === ticket.id 
        ? t('clickAgainToRemove')
        : t('clickToRemove')
    };
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6" // Removido max-w-6xl mx-auto p-4
    >
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">{t('activeTickets')}</h2>
          <p className="text-muted-foreground">
            {tickets.length} {t('ticket', { count: tickets.length })} {t('active', { count: tickets.length })}
          </p>
        </div>
        
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
          {tickets.map((ticket, index) => {
            const status = getTicketStatus(ticket);
            const StatusIcon = status.icon;
            const isProcessing = processingTickets.has(ticket.id);
            const isPendingDelete = pendingDelete === ticket.id;
            
            return (
              <motion.div
                key={ticket.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="group"
              >
                <Card 
                  className={cn(
                    "h-full cursor-pointer transition-all duration-200",
                    status.clickable ? 'hover:shadow-lg hover:scale-105' : '',
                    isPendingDelete ? 'ring-2 ring-red-500 shadow-lg' : 'hover-lift',
                    isProcessing ? 'opacity-50 cursor-not-allowed' : '',
                    "flex flex-col"
                  )}
                  onClick={() => !isProcessing && handleTicketClick(ticket)}
                >
                  <CardContent className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                    <div className="text-center">
                      <p className="text-4xl font-mono font-bold tracking-wider text-gray-900">
                        {ticket.code}
                      </p>
                    </div>
                    
                    <div className="flex justify-center">
                      <Badge className={cn("px-3 py-1", status.className)}>
                        {isProcessing ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <StatusIcon className="h-3 w-3 mr-1" />
                        )}
                        {status.label}
                      </Badge>
                    </div>
                    
                    {status.clickable && !isProcessing && (
                      <div className="text-center">
                        <p className={cn("text-xs", isPendingDelete ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                          {status.clickText}
                        </p>
                      </div>
                    )}
                    
                    <div className="text-center text-xs text-muted-foreground space-y-1 mt-auto">
                      <p>
                        {t('created')}: {format(parseISO(ticket.created_date), 'HH:mm', { locale: i18n.language === 'pt' ? ptBR : undefined })}
                      </p>
                      {ticket.acknowledged_at && (
                        <p>
                          {t('confirmed')}: {format(parseISO(ticket.acknowledged_at), 'HH:mm', { locale: i18n.language === 'pt' ? ptBR : undefined })}
                        </p>
                      )}
                    </div>

                    {ticket.status === 'CONFIRMADO' && !isProcessing && (
                      <div className="flex justify-center pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSoftDelete(ticket);
                          }}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2Icon className="h-3 w-3 mr-1" />
                          {t('remove')}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}