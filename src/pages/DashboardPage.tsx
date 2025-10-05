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

  // Estados para a funcionalidade de confirmação/remoção de tickets (para estafetas e restaurantes)
  const [processingTickets, setProcessingTickets] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const doubleClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DOUBLE_CLICK_THRESHOLD = 500; // milliseconds

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
    if (!user || (isEstafeta && !isDashboardActivated)) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setRefreshing(true);
    try {
      let tickets: Ticket[] = [];
      const filter: Partial<Ticket> = {}; // Buscar todos os tickets não deletados, independentemente do status

      if (isAdmin) {
        if (selectedRestaurant !== "all") {
          filter.restaurant_id = selectedRestaurant;
        }
        tickets = await TicketAPI.filter(filter, "created_date");
      } else if ((isRestaurante || isEstafeta) && user.restaurant_id) {
        filter.restaurant_id = user.restaurant_id;
        tickets = await TicketAPI.filter(filter, "created_date");
      } else {
        tickets = [];
      }

      const now = new Date();
      const ticketsToDisplay: TicketWithRestaurantName[] = [];

      tickets.forEach(ticket => {
        // Filtrar tickets soft-deleted que já passaram de 1 minuto
        if (ticket.soft_deleted) {
          if (ticket.deleted_at) {
            const deletedAtDate = parseISO(ticket.deleted_at);
            const oneMinuteAfterDeletion = addMinutes(deletedAtDate, 1);
            if (isPast(oneMinuteAfterDeletion)) {
              return; // Não incluir se já passou 1 minuto desde a exclusão
            }
          } else {
            return; // Se soft_deleted é true mas deleted_at é null, ignorar
          }
        }

        // Filtrar tickets CONFIRMADO que já passaram de 1 minuto
        if (ticket.status === "CONFIRMADO") {
          if (ticket.acknowledged_at) {
            const acknowledgedAtDate = parseISO(ticket.acknowledged_at);
            const oneMinuteAfterAcknowledgement = addMinutes(acknowledgedAtDate, 1);
            if (isPast(oneMinuteAfterAcknowledgement)) {
              return; // Não incluir se já passou 1 minuto desde a confirmação
            }
          } else {
            // Se status é CONFIRMADO mas acknowledged_at é null (caso improvável),
            // podemos optar por não mostrar ou mostrar por um tempo padrão.
            // Por simplicidade, vamos ignorar se acknowledged_at for null para tickets CONFIRMADO.
            return;
          }
        }
        
        // Incluir tickets que não foram soft-deleted há mais de 1 minuto,
        // e tickets PENDING, e tickets CONFIRMADO há menos de 1 minuto.
        ticketsToDisplay.push({
          ...ticket,
          restaurantNameDisplay: getRestaurantNameForTicket(ticket.restaurant_id),
        });
      });

      // Ordenar os tickets restantes
      if (sortConfig) {
        ticketsToDisplay.sort((a, b) => {
          let aValue: any;
          let bValue: any;

          switch (sortConfig.key) {
            case 'code':
              aValue = a.code;
              bValue = b.code;
              break;
            case 'status':
              // Priorizar PENDING sobre CONFIRMADO
              if (a.status === 'PENDING' && b.status === 'CONFIRMADO') return sortConfig.direction === 'asc' ? -1 : 1;
              if (a.status === 'CONFIRMADO' && b.status === 'PENDING') return sortConfig.direction === 'asc' ? 1 : -1;
              aValue = a.status;
              bValue = b.status;
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
  }, [user, isAdmin, isRestaurante, isEstafeta, isDashboardActivated, selectedRestaurant, t, sortConfig, getRestaurantNameForTicket]);

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

  // Lógica de confirmação/remoção de tickets (adaptada do BalcaoPage)
  const handleTicketClick = async (ticket: Ticket) => {
    if (!user || isEstafeta) { // Estafetas não podem clicar para ações
      showError(t("permissionDenied"));
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
    if (!user || isEstafeta || processingTickets.has(ticket.id)) { // Estafetas não podem confirmar
      showError(t("permissionDenied"));
      return;
    }

    setProcessingTickets(prev => new Set(prev).add(ticket.id));
    
    try {
      await TicketAPI.update(ticket.id, {
        status: 'CONFIRMADO',
        acknowledged_by_user_id: user.id,
        acknowledged_by_user_email: user.email,
        restaurant_id: ticket.restaurant_id,
      });
      
      showSuccess(t('ticketConfirmedSuccessfully'));
      await fetchActiveTickets();
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
    if (!user || isEstafeta || processingTickets.has(ticket.id)) { // Estafetas não podem remover
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
      await fetchActiveTickets();
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
        clickable: !isEstafeta, // Estafeta não pode clicar
        clickText: isEstafeta ? t('viewStatusOnly') : t('clickToConfirm') // Texto diferente para estafeta
      };
    }
    
    return {
      label: t('acknowledged'), // Usar 'acknowledged' para CONFIRMADO
      icon: CheckCircleIcon,
      className: 'bg-green-100 text-green-800 border-green-200',
      cardClass: 'border-green-300 bg-green-50',
      clickable: !isEstafeta, // Estafeta não pode clicar
      clickText: isEstafeta 
        ? t('viewStatusOnly') 
        : (pendingDelete === ticket.id ? t('clickAgainToRemove') : t('removeTicket'))
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
        <LayoutDashboardIcon className="h-16 w-16 text-red-500 mb-4" />
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

  // Renderização para Admin (tabela)
  if (isAdmin) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 w-full"
      >
        <div className="flex items-center gap-4">
          <LayoutDashboardIcon className="h-8 w-8 text-blue-600" />
          <h2 className="text-3xl font-bold text-gray-800">{t("dashboard")}</h2>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-2xl font-bold">{t("activeOrdersOverview")}</CardTitle>
            <div className="flex items-center gap-2">
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
              <Button variant="outline" size="icon" onClick={fetchActiveTickets} disabled={loading}>
                <RefreshCwIcon className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                <span className="sr-only">{t("refresh")}</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex flex-col gap-4 p-4">
                <Skeleton className="h-10 w-full" />
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : activeTickets.length === 0 ? (
              <p className="text-center text-gray-500 p-8">{t("noActiveOrders")}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <Button variant="ghost" onClick={() => handleSort('code')} className="p-0 h-auto">
                          {t("code")}
                          <ArrowUpDown className={cn("ml-2 h-4 w-4", sortConfig?.key === 'code' && sortConfig.direction === 'desc' && 'rotate-180')} />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button variant="ghost" onClick={() => handleSort('status')} className="p-0 h-auto">
                          {t("status")}
                          <ArrowUpDown className={cn("ml-2 h-4 w-4", sortConfig?.key === 'status' && sortConfig.direction === 'desc' && 'rotate-180')} />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button variant="ghost" onClick={() => handleSort('restaurantName')} className="p-0 h-auto">
                          {t("restaurantName")}
                          <ArrowUpDown className={cn("ml-2 h-4 w-4", sortConfig?.key === 'restaurantName' && sortConfig.direction === 'desc' && 'rotate-180')} />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button variant="ghost" onClick={() => handleSort('created_by_user_email')} className="p-0 h-auto">
                          {t("createdBy")}
                          <ArrowUpDown className={cn("ml-2 h-4 w-4", sortConfig?.key === 'created_by_user_email' && sortConfig.direction === 'desc' && 'rotate-180')} />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button variant="ghost" onClick={() => handleSort('created_date')} className="p-0 h-auto">
                          {t("createdAt")}
                          <ArrowUpDown className={cn("ml-2 h-4 w-4", sortConfig?.key === 'created_date' && sortConfig.direction === 'desc' && 'rotate-180')} />
                        </Button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeTickets.map((ticket) => (
                      <TableRow key={ticket.id}>
                        <TableCell className="font-medium">{ticket.code}</TableCell>
                        <TableCell>
                          {ticket.status === "PENDING" ? (
                            <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
                              <ClockIcon className="mr-1 h-3 w-3" /> {t("pending")}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-100 text-green-800">
                              <CheckCircleIcon className="mr-1 h-3 w-3" /> {t("ready")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{ticket.restaurantNameDisplay}</TableCell>
                        <TableCell>{ticket.created_by_user_email}</TableCell>
                        <TableCell className="flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4 text-gray-500" />
                          <span>{formatDateWithWeekday(ticket.created_date, i18n.language === 'pt' ? ptBR : undefined)}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // Renderização para Estafeta Ativado e Restaurante (cartões)
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
            {user?.restaurant_id && (
              <span className="ml-2 text-blue-600">({getRestaurantNameForTicket(user.restaurant_id)})</span>
            )}
          </h2>
          <p className="text-muted-foreground">
            {t('activeTicketsDescription', { count: activeTickets.length })}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
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
            {activeTickets.map((ticket, index) => {
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
                      "h-full transition-all duration-200 border-2 relative",
                      status.cardClass,
                      status.clickable ? 'hover:shadow-lg hover:scale-105 cursor-pointer' : 'cursor-default', // Cursor default para não clicável
                      isPendingDelete ? 'ring-4 ring-red-500 shadow-xl' : 'hover-lift',
                      isProcessing ? 'opacity-60 cursor-not-allowed' : '',
                      "flex flex-col"
                    )}
                    onClick={() => !isProcessing && status.clickable && handleTicketClick(ticket)} // Apenas clica se for clicável
                  >
                    {/* Posição do ticket (1º, 2º, etc.) */}
                    <Badge className="absolute top-2 left-2 bg-yellow-200 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full">
                      {index + 1}º
                    </Badge>
                    {/* Botão de remover (X) - Visível apenas para Admin/Restaurante */}
                    {(!isEstafeta || isAdmin || isRestaurante) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6 text-gray-500 hover:text-red-500"
                        onClick={(e) => {
                          e.stopPropagation(); // Previne o clique no cartão
                          handleSoftDelete(ticket);
                        }}
                        disabled={isProcessing || isEstafeta} // Desabilitado para estafeta
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    )}

                    <CardContent className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                      <div className="text-center mt-6"> {/* Ajuste para não sobrepor o badge */}
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
}