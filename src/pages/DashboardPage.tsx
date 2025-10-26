"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { TicketAPI, Ticket, UserAPI, RestaurantAPI } from "@/lib/api"; // Import RestaurantAPI
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
import { format, parseISO, isPast, addMinutes } from "date-fns"; // Importar isPast e addMinutes
import { ptBR } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// Interface para o estado de ordenação
interface SortConfig {
  key: 'code' | 'status' | 'created_by_user_email' | 'created_date' | 'restaurantName';
  direction: 'asc' | 'desc';
}

// Estende a interface Ticket para incluir o nome do restaurante para ordenação
interface TicketWithRestaurantName extends Ticket {
  restaurantNameDisplay: string;
}

export default function DashboardPage() {
  const { user, isAdmin, isRestaurante, isEstafeta, isDashboardActivated, userDashboardAccessCode, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const [activeTickets, setActiveTickets] = useState<TicketWithRestaurantName[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState("all"); // 'all' or a specific restaurant_id
  const [availableRestaurants, setAvailableRestaurants] = useState<{ id: string; name: string }[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ key: 'created_date', direction: 'desc' });

  // Estados para a funcionalidade de ativação do painel (apenas para estafetas)
  const [activationCode, setActivationCode] = useState("");
  const [isActivating, setIsActivating] = useState(false);

  // Fetch available restaurants for admin filter and display
  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        const restaurants = await RestaurantAPI.list(); // Fetch all restaurants
        setAvailableRestaurants(restaurants);
      } catch (err) {
        console.error("Failed to fetch restaurants for DashboardPage:", err);
        showError(t("failedToLoadRestaurants"));
      }
    };
    fetchRestaurants();
  }, [t]);

  const getRestaurantNameForTicket = useCallback((restaurantId: string | undefined) => {
    if (!restaurantId) return t("none");
    const restaurant = availableRestaurants.find(r => r.id === restaurantId);
    return restaurant ? restaurant.name : `Restaurante ${restaurantId.substring(0, 4)}`;
  }, [availableRestaurants, t]);

  const fetchActiveTickets = useCallback(async () => {
    if (!user || (isEstafeta && !isDashboardActivated)) { // Não carregar tickets se estafeta não ativou
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setRefreshing(true);
    try {
      let allTickets: Ticket[] = [];
      const filter: Partial<Ticket> = { soft_deleted: undefined }; // Buscar todos os tickets (soft_deleted true/false)

      if (isAdmin) {
        if (selectedRestaurant !== "all") {
          filter.restaurant_id = selectedRestaurant;
        }
        allTickets = await TicketAPI.filter(filter, "-created_date"); // Ordenar por data de criação descendente
      } else if ((isRestaurante || isEstafeta) && user.restaurant_id) {
        filter.restaurant_id = user.restaurant_id;
        allTickets = await TicketAPI.filter(filter, "-created_date"); // Ordenar por data de criação descendente
      } else {
        allTickets = [];
      }

      const ticketsToDisplay: TicketWithRestaurantName[] = [];
      const now = new Date();

      allTickets.forEach(ticket => {
        if (ticket.soft_deleted) {
          // Se o ticket foi soft-deleted, verificar se já passou 1 minuto desde deleted_at
          if (ticket.deleted_at) {
            const deletedAtDate = parseISO(ticket.deleted_at);
            const oneMinuteAfterDeletion = addMinutes(deletedAtDate, 1);
            if (isPast(oneMinuteAfterDeletion)) {
              // Se já passou 1 minuto desde a exclusão, não incluir na lista
              return; 
            }
          } else {
            // Se soft_deleted é true mas deleted_at é null (caso improvável), 
            // podemos optar por não mostrar ou mostrar por um tempo padrão.
            // Por simplicidade, vamos ignorar se deleted_at for null para tickets soft_deleted.
            return;
          }
        }
        // Incluir tickets que não foram soft-deleted ou que foram soft-deleted há menos de 1 minuto
        ticketsToDisplay.push({
          ...ticket,
          restaurantNameDisplay: getRestaurantNameForTicket(ticket.restaurant_id),
        });
      });

      // Ordenar: soft-deleted primeiro (mais recentes), depois pendentes (mais recentes)
      ticketsToDisplay.sort((a, b) => {
        if (a.soft_deleted && !b.soft_deleted) return -1; // Soft-deleted vem antes
        if (!a.soft_deleted && b.soft_deleted) return 1; // Soft-deleted vem antes

        if (a.soft_deleted && b.soft_deleted) {
          // Ambos soft-deleted, ordenar pelo deleted_at mais recente
          const deletedDateA = a.deleted_at ? parseISO(a.deleted_at).getTime() : 0;
          const deletedDateB = b.deleted_at ? parseISO(b.deleted_at).getTime() : 0;
          return deletedDateB - deletedDateA;
        }

        // Ambos pendentes, ordenar pelo created_date mais recente
        const createdDateA = parseISO(a.created_date).getTime();
        const createdDateB = parseISO(b.created_date).getTime();
        return createdDateB - createdDateA;
      });
      
      setActiveTickets(ticketsToDisplay);
    } catch (error) {
      console.error("Failed to fetch active tickets for dashboard:", error);
      showError(t("failedToLoadActiveTickets"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, isAdmin, isRestaurante, isEstafeta, isDashboardActivated, selectedRestaurant, t, getRestaurantNameForTicket]);

  useEffect(() => {
    // Só faz o fetch se o usuário não for estafeta ou se for estafeta e o painel estiver ativado
    if (!isEstafeta || isDashboardActivated) {
      fetchActiveTickets();
      const interval = setInterval(fetchActiveTickets, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [fetchActiveTickets, isEstafeta, isDashboardActivated]);

  const handleSort = (key: SortConfig['key']) => {
    setSortConfig(prevConfig => {
      if (prevConfig?.key === key) {
        return { ...prevConfig, direction: prevConfig.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' }; // Default to ascending when changing column
    });
  };

  const formatDateWithWeekday = (dateString: string, locale: any) => {
    const date = parseISO(dateString);
    return format(date, "dd/MM/yyyy (EEEE) HH:mm", { locale });
  };

  // Lógica de ativação do painel para estafetas
  const handleActivateDashboard = async () => {
    if (!user || !isEstafeta || isActivating) return;
    if (activationCode.trim() === "") {
      showError(t("pleaseEnterActivationCode"));
      return;
    }

    setIsActivating(true);
    try {
      if (activationCode === userDashboardAccessCode) {
        await UserAPI.update(user.id, { dashboard_activated_at: new Date().toISOString() });
        showSuccess(t("dashboardActivatedSuccessfully"));
        // O AuthContext irá recarregar o usuário e atualizar isDashboardActivated
      } else {
        showError(t("invalidActivationCode"));
      }
    } catch (error) {
      console.error("Failed to activate dashboard:", error);
      showError(t("failedToActivateDashboard"));
    } finally {
      setIsActivating(false);
    }
  };

  // A função getTicketStatus é mantida, mas suas propriedades interativas não serão usadas na renderização
  const getTicketStatus = (ticket: Ticket) => {
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
  };

  // Renderização condicional baseada no papel do usuário e estado de ativação
  if (!user || (isEstafeta && !isDashboardActivated)) {
    // Se for estafeta e o painel não estiver ativado, mostrar formulário de ativação
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

    // Caso contrário (ex: restaurante sem restaurant_id, ou outros casos de não-acesso)
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

  // Renderização unificada para todos os papéis com acesso (atualmente apenas Admin)
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 w-full"
    >
      {/* Header with refresh button and restaurant selector */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-800">
            {t('dashboard')}
            {isAdmin && selectedRestaurant !== "all" && (
              <span className="ml-2 text-blue-600">({availableRestaurants.find(r => r.id === selectedRestaurant)?.name || selectedRestaurant})</span>
            )}
          </h2>
          <p className="text-muted-foreground">
            {t('activeTicketsDescription', { count: activeTickets.length })}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
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
          <Button
            onClick={fetchActiveTickets}
            variant="outline"
            disabled={refreshing}
            className="space-x-2"
          >
            <RefreshCwIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{t('refresh')}</span>
          </Button>
        </div>
      </div>

      {/* Tickets grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : activeTickets.length === 0 ? (
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
            {activeTickets.map((ticket, index) => {
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
                    {/* Posição do ticket (1º, 2º, etc.) */}
                    <Badge className="absolute top-2 left-2 bg-yellow-200 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full">
                      {index + 1}º
                    </Badge>

                    <CardContent className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                      <div className="text-center mt-6"> {/* Ajuste para não sobrepor o badge */}
                        <Badge 
                          className={cn(
                            "text-4xl font-mono font-extrabold tracking-wider px-4 py-2",
                            status.codeBadgeClass // Usa a classe dinâmica para o código
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
}