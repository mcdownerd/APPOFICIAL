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

// Interface para o estado de ordenação
interface SortConfig {
  key: 'code' | 'created_by_user_email' | 'created_date' | 'restaurantName';
  direction: 'asc' | 'desc';
}

// Estende a interface Ticket para incluir o nome do restaurante para ordenação
interface TicketWithRestaurantName extends Ticket {
  restaurantNameDisplay: string;
}

export default function DashboardCopyPage() {
  const { user, isAdmin, isEstafeta, isDashboardActivated, userDashboardAccessCode, logout } = useAuth();
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
        const restaurantUsers = await UserAPI.filter({ user_role: "restaurante", status: "APPROVED" });
        const uniqueRestaurantIds = Array.from(new Set(restaurantUsers.map(u => u.restaurant_id).filter(Boolean) as string[]));
        const restaurants = uniqueRestaurantIds.map(id => ({ id, name: `Restaurante ${id.substring(0, 4)}` })); // Simple naming
        setAvailableRestaurants(restaurants);
      } catch (err) {
        console.error("Failed to fetch restaurant users for dashboard:", err);
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
      const filter: Partial<Ticket> = { soft_deleted: false }; // Apenas tickets NÃO soft-deleted

      if (isAdmin) {
        if (selectedRestaurant !== "all") {
          filter.restaurant_id = selectedRestaurant;
        }
        allTickets = await TicketAPI.filter(filter, "-created_date"); // Ordenar por data de criação descendente
      } else if (user.restaurant_id) { // Restaurante e Estafeta veem apenas os seus
        filter.restaurant_id = user.restaurant_id;
        allTickets = await TicketAPI.filter(filter, "-created_date"); // Ordenar por data de criação descendente
      } else {
        allTickets = [];
      }

      const ticketsToDisplay: TicketWithRestaurantName[] = allTickets.map(ticket => ({
        ...ticket,
        restaurantNameDisplay: getRestaurantNameForTicket(ticket.restaurant_id),
      }));

      // Aplica a ordenação no lado do cliente
      if (sortConfig) {
        ticketsToDisplay.sort((a, b) => {
          let aValue: any;
          let bValue: any;

          switch (sortConfig.key) {
            case 'code':
              aValue = a.code;
              bValue = b.code;
              break;
            case 'created_by_user_email':
              aValue = a.created_by_user_email || '';
              bValue = b.created_by_user_email || '';
              break;
            case 'created_date':
              aValue = parseISO(a.created_date).getTime();
              bValue = parseISO(b.created_date).getTime();
              break;
            case 'restaurantName':
              aValue = a.restaurantNameDisplay;
              bValue = b.restaurantNameDisplay;
              break;
            default:
              aValue = 0;
              bValue = 0;
          }

          if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        });
      }
      
      setActiveTickets(ticketsToDisplay);
    } catch (error) {
      console.error("Failed to fetch active tickets for dashboard:", error);
      showError(t("failedToLoadActiveTickets"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, isAdmin, isEstafeta, isDashboardActivated, selectedRestaurant, t, getRestaurantNameForTicket, sortConfig]);

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

  // A função getTicketStatus é modificada para o novo comportamento
  const getTicketStatus = (ticket: Ticket) => {
    // Neste painel, todos os tickets não soft-deleted são 'Em Processamento'
    return {
      label: t('inProcessing'), // Novo status genérico
      icon: ClockIcon,
      className: 'bg-blue-100 text-blue-800 border-blue-200', // Cor azul para 'Em Processamento'
      cardClass: 'border-blue-300 bg-blue-50',
      codeBadgeClass: 'bg-blue-200 text-blue-900',
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
    // Se o AuthGuard redirecionar, este bloco não será alcançado para usuários sem restaurant_id.
    // No entanto, mantemos um retorno nulo para garantir que nada seja renderizado inesperadamente.
    return null;
  }

  // Renderização unificada para todos os papéis com acesso
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
            {t('dashboardNew')} {/* Título para o novo painel */}
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
              // const StatusIcon = status.icon; // Não é mais necessário
              
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
                    <Badge className="absolute top-2 left-2 bg-blue-200 text-blue-900 text-xs font-bold px-2 py-1 rounded-full">
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
                      
                      {/* Removido o badge de status */}
                      
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