"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { TicketAPI, Ticket, UserAPI } from "@/lib/api";
import { showError, showSuccess, showInfo } from "@/utils/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { LayoutDashboardIcon, RefreshCwIcon, CheckCircleIcon, ClockIcon, CalendarIcon, ArrowUpDown, Loader2, Trash2Icon, UtensilsCrossedIcon, KeyIcon } from "lucide-react";
import { format, parseISO, isPast, addMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Interface para o estado de ordenação
interface SortConfig {
  key: 'code' | 'status' | 'created_by_user_email' | 'created_date' | 'restaurantName';
  direction: 'asc' | 'desc';
}

// Estende a interface Ticket para incluir o nome do restaurante para ordenação
interface TicketWithRestaurantName extends Ticket {
  restaurantNameDisplay: string;
}

const DashboardPage = React.memo(() => {
  const { user, isAdmin, isRestaurante, isEstafeta, isDashboardActivated, userDashboardAccessCode, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();

  const [selectedRestaurant, setSelectedRestaurant] = useState("all");
  const [availableRestaurants, setAvailableRestaurants] = useState<{ id: string; name: string }[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ key: 'created_date', direction: 'desc' });

  const [activationCode, setActivationCode] = useState("");
  const [isActivating, setIsActivating] = useState(false);

  const userRestaurantId = user?.restaurant_id;
  const userId = user?.id;

  // Query para buscar restaurantes disponíveis (para filtro e display)
  const { isLoading: isLoadingRestaurants } = useQuery<{ id: string; name: string }[], Error>({
    queryKey: ["availableRestaurants"],
    queryFn: async () => {
      const restaurantUsers = await UserAPI.filter({ user_role: "restaurante", status: "APPROVED" });
      const uniqueRestaurantIds = Array.from(new Set(restaurantUsers.map(u => u.restaurant_id).filter(Boolean) as string[]));
      const restaurants = uniqueRestaurantIds.map(id => ({ id, name: `Restaurante ${id.substring(0, 4)}` }));
      setAvailableRestaurants(restaurants);
      return restaurants;
    },
    staleTime: 1000 * 60 * 10, // Cache por 10 minutos
  });

  const getRestaurantNameForTicket = useCallback((restaurantId: string | undefined) => {
    if (!restaurantId) return t("none");
    const restaurant = availableRestaurants.find(r => r.id === restaurantId);
    return restaurant ? restaurant.name : `Restaurante ${restaurantId.substring(0, 4)}`;
  }, [availableRestaurants, t]);

  // Query para buscar tickets ativos
  const { data: activeTickets, isLoading: isLoadingTickets, refetch: refetchActiveTickets } = useQuery<TicketWithRestaurantName[], Error>({ // Removido '= []'
    queryKey: ["dashboardActiveTickets", userRestaurantId, isAdmin, selectedRestaurant, isDashboardActivated, availableRestaurants],
    queryFn: async () => {
      if (!user || (isEstafeta && !isDashboardActivated)) {
        return [];
      }

      let allTickets: Ticket[] = [];
      const filter: Partial<Ticket> = { soft_deleted: undefined };

      if (isAdmin) {
        if (selectedRestaurant !== "all") {
          filter.restaurant_id = selectedRestaurant;
        }
        allTickets = await TicketAPI.filter(filter, "-created_date");
      } else if ((isRestaurante || isEstafeta) && userRestaurantId) {
        filter.restaurant_id = userRestaurantId;
        allTickets = await TicketAPI.filter(filter, "-created_date");
      } else {
        return [];
      }

      const ticketsToDisplay: TicketWithRestaurantName[] = [];
      const now = new Date();

      allTickets.forEach(ticket => {
        if (ticket.soft_deleted) {
          if (ticket.deleted_at) {
            const deletedAtDate = parseISO(ticket.deleted_at);
            const oneMinuteAfterDeletion = addMinutes(deletedAtDate, 1);
            if (isPast(oneMinuteAfterDeletion)) {
              return;
            }
          } else {
            return;
          }
        }
        ticketsToDisplay.push({
          ...ticket,
          restaurantNameDisplay: getRestaurantNameForTicket(ticket.restaurant_id),
        });
      });

      ticketsToDisplay.sort((a, b) => {
        if (a.soft_deleted && !b.soft_deleted) return -1;
        if (!a.soft_deleted && b.soft_deleted) return 1;

        if (a.soft_deleted && b.soft_deleted) {
          const deletedDateA = a.deleted_at ? parseISO(a.deleted_at).getTime() : 0;
          const deletedDateB = b.deleted_at ? parseISO(b.deleted_at).getTime() : 0;
          return deletedDateB - deletedDateA;
        }

        const createdDateA = parseISO(a.created_date).getTime();
        const createdDateB = parseISO(b.created_date).getTime();
        return createdDateB - createdDateA;
      });
      
      return ticketsToDisplay;
    },
    enabled: !!user && (isAdmin || (isRestaurante && !!userRestaurantId) || (isEstafeta && isDashboardActivated)) && !isLoadingRestaurants,
    staleTime: 1000 * 5, // Re-fetch a cada 5 segundos em background
    // Removido: onError, pois não é mais suportado diretamente nas opções do useQuery v5
  });

  // Supabase Realtime subscription for tickets
  useEffect(() => {
    if (!user || (isEstafeta && !isDashboardActivated)) return;

    const filterRestaurantId = isAdmin && selectedRestaurant !== "all" ? selectedRestaurant : userRestaurantId;

    if (!filterRestaurantId && !isAdmin) return;

    console.log(`DashboardPage: Subscribing to realtime changes for tickets in restaurant ${filterRestaurantId || 'all'}`);

    const channel = supabase
      .channel(`tickets_dashboard:${filterRestaurantId || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: filterRestaurantId ? `restaurant_id=eq.${filterRestaurantId}` : undefined
        },
        (payload) => {
          console.log('DashboardPage: Realtime update received:', payload);
          queryClient.invalidateQueries({ queryKey: ["dashboardActiveTickets", userRestaurantId, isAdmin, selectedRestaurant, isDashboardActivated] });
          queryClient.invalidateQueries({ queryKey: ["pendingTicketsCount", filterRestaurantId] });
          queryClient.invalidateQueries({ queryKey: ["userRecentTickets", userId, filterRestaurantId] });
          queryClient.invalidateQueries({ queryKey: ["analysis"] });
        }
      )
      .subscribe();

    return () => {
      console.log(`DashboardPage: Unsubscribing from realtime changes for tickets in restaurant ${filterRestaurantId || 'all'}`);
      supabase.removeChannel(channel);
    };
  }, [user, isAdmin, isEstafeta, isDashboardActivated, userRestaurantId, selectedRestaurant, userId, queryClient]);

  const activateDashboardMutation = useMutation({
    mutationFn: async (code: string) => {
      if (!user || !isEstafeta) throw new Error("User not authorized or not an estafeta.");
      if (code !== userDashboardAccessCode) throw new Error(t("invalidActivationCode"));

      await UserAPI.update(user.id, { dashboard_activated_at: new Date().toISOString() });
      return true;
    },
    onSuccess: () => {
      showSuccess(t("dashboardActivatedSuccessfully"));
      queryClient.invalidateQueries({ queryKey: ["user"] }); // Invalidate user to refetch dashboard_activated_at
    },
    onError: (error: any) => {
      console.error("Failed to activate dashboard:", error);
      showError(error.message || t("failedToActivateDashboard"));
    },
    onSettled: () => {
      setIsActivating(false);
    }
  });

  const handleActivateDashboard = useCallback(async () => {
    if (!user || !isEstafeta || isActivating) return;
    if (activationCode.trim() === "") {
      showError(t("pleaseEnterActivationCode"));
      return;
    }

    setIsActivating(true);
    activateDashboardMutation.mutate(activationCode.trim());
  }, [user, isEstafeta, isActivating, activationCode, activateDashboardMutation, t]);

  const getTicketStatus = useCallback((ticket: Ticket) => {
    if (ticket.soft_deleted) {
      return {
        label: t('ready'),
        icon: CheckCircleIcon,
        className: 'bg-green-100 text-green-800 border-green-200',
        cardClass: 'border-green-300 bg-green-50',
        codeBadgeClass: 'bg-green-200 text-green-900',
      };
    }
    
    return {
      label: t('pending'),
      icon: ClockIcon,
      className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      cardClass: 'border-yellow-300 bg-yellow-50',
      codeBadgeClass: 'bg-yellow-200 text-yellow-900',
    };
  }, [t]);

  if (!user || (isEstafeta && !isDashboardActivated)) {
    if (isEstafeta && !isDashboardActivated) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center p-4"
        >
          <Card className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-xl border border-gray-200">
            <KeyIcon className="h-16 w-16 text-blue-500 mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-gray-800">{t("activateDashboard")}</h2>
            <p className="text-gray-600">{t("enterActivationCodeForDashboard")}</p>
            <Input
              type="text"
              placeholder={t("activationCode")}
              value={activationCode}
              onChange={(e) => setActivationCode(e.target.value)}
              className="text-center text-xl font-mono tracking-widest"
              disabled={isActivating}
            />
            <Button onClick={handleActivateDashboard} disabled={isActivating} className="w-full">
              {isActivating ? t("activating") : t("activate")}
            </Button>
            <Button variant="outline" onClick={logout} className="w-full mt-2">
              {t("logout")}
            </Button>
          </Card>
        </motion.div>
      );
    }

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
      className="space-y-6 w-full"
    >
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-800">
            {t('dashboard')}
            {isAdmin && selectedRestaurant !== "all" && (
              <span className="ml-2 text-blue-600">({availableRestaurants.find(r => r.id === selectedRestaurant)?.name || selectedRestaurant})</span>
            )}
          </h2>
          <p className="text-muted-foreground">
            {t('activeTicketsDescription', { count: activeTickets?.length })} {/* Corrigido: Acesso seguro a 'length' */}
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
            onClick={() => refetchActiveTickets()}
            variant="outline"
            disabled={isLoadingTickets}
            className="space-x-2"
          >
            <RefreshCwIcon className={`h-4 w-4 ${isLoadingTickets ? 'animate-spin' : ''}`} />
            <span>{t('refresh')}</span>
          </Button>
        </div>
      </div>

      {isLoadingTickets ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : activeTickets?.length === 0 ? ( {/* Corrigido: Acesso seguro a 'length' */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12"
        >
          <Card className="shadow-lg">
            <CardContent className="py-12">
              <UtensilsCrossedIcon className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="text-lg font-medium mb-2 text-gray-800">{t('noActiveOrders')}</h3>
              <p className="text-muted-foreground">
                {t('awaitingNewCodes')}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence>
            {activeTickets?.map((ticket, index) => { {/* Corrigido: Acesso seguro a 'map' */}
              const status = getTicketStatus(ticket);
              const StatusIcon = status.icon;
              
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
                    <Badge className="absolute top-2 left-2 bg-yellow-200 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full">
                      {index + 1}º
                    </Badge>

                    <CardContent className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                      <div className="text-center mt-6">
                        <Badge 
                          className={cn(
                            "text-4xl font-mono font-extrabold tracking-wider px-4 py-2",
                            status.codeBadgeClass
                          )}
                        >
                          {ticket.code}
                        </Badge>
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
});

export default DashboardPage;