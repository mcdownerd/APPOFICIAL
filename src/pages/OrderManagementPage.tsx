"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { TicketAPI, Ticket, RestaurantAPI, Restaurant } from "@/lib/api";
import { showSuccess, showError, showInfo } from "@/utils/toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  RefreshCcwIcon,
  ClockIcon,
  CheckCircleIcon,
  Trash2Icon,
  UtensilsCrossedIcon,
  SendIcon,
  PackageIcon, // Novo ícone para a página combinada
} from "lucide-react";
import { format, parseISO, isPast, addMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function OrderManagementPage() {
  const { user, isAdmin, isRestaurante } = useAuth();
  const { t, i18n } = useTranslation();

  // State for sending codes (from EstafetaPage)
  const [code, setCode] = useState("");
  const [recentTickets, setRecentTickets] = useState<Ticket[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingTicketsCount, setPendingTicketsCount] = useState(0); // Still a no-op
  const [processingRecentDelete, setProcessingRecentDelete] = useState<string | null>(null); // Novo estado para gerenciar o carregamento da exclusão

  // State for viewing tickets (from BalcaoPage)
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true); // Renamed to avoid conflict
  const [refreshingTickets, setRefreshingTickets] = useState(false); // Renamed to avoid conflict
  const [processingTickets, setProcessingTickets] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  // Shared state for restaurant selection
  const [selectedRestaurant, setSelectedRestaurant] = useState("all");
  const [availableRestaurants, setAvailableRestaurants] = useState<Restaurant[]>([]);

  const doubleClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DOUBLE_CLICK_THRESHOLD = 500;

  // Fetch available restaurants for admin filter
  useEffect(() => {
    const fetchRestaurants = async () => {
      if (isAdmin || isRestaurante) {
        try {
          const restaurantsList = await RestaurantAPI.list();
          setAvailableRestaurants(restaurantsList);
        } catch (err) {
          console.error("Failed to fetch restaurants:", err);
          showError(t("failedToLoadRestaurants"));
        }
      }
    };
    fetchRestaurants();
  }, [isAdmin, isRestaurante, t]);

  // Set initial selected restaurant for non-admin users
  useEffect(() => {
    if (isRestaurante && user?.restaurant_id) {
      setSelectedRestaurant(user.restaurant_id);
    }
  }, [isRestaurante, user?.restaurant_id]);

  // --- Functions for Sending Codes (Estafeta-like) ---
  const fetchRecentTickets = useCallback(async () => {
    if (!user) return;
    try {
      const filter: Partial<Ticket> = { created_by_user_id: user.id, soft_deleted: undefined };
      if (user.user_role === "restaurante" && user.restaurant_id) {
        filter.restaurant_id = user.restaurant_id;
      } else if (isAdmin && selectedRestaurant !== "all") {
        filter.restaurant_id = selectedRestaurant;
      }

      const allUserTickets = await TicketAPI.filter(filter, "-created_date");

      const ticketsToDisplay: Ticket[] = [];
      allUserTickets.forEach(ticket => {
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
        ticketsToDisplay.push(ticket);
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

      setRecentTickets(ticketsToDisplay.slice(0, 7));
    } catch (error) {
      console.error("Failed to fetch recent tickets:", error);
      showError(t("failedToLoadRecentTickets"));
    }
  }, [user, t, isAdmin, selectedRestaurant]);

  const fetchPendingTicketsCount = useCallback(async () => {
    // This is a no-op now as pending limit logic was removed
    setPendingTicketsCount(0);
  }, []);

  useEffect(() => {
    fetchRecentTickets();
    fetchPendingTicketsCount();
    const interval = setInterval(() => {
      fetchRecentTickets();
      fetchPendingTicketsCount();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchRecentTickets, fetchPendingTicketsCount]);

  const handleSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length !== 4 || isSubmitting) return;
    const targetRestaurantId = (isAdmin && selectedRestaurant !== "all") ? selectedRestaurant : user?.restaurant_id;

    if (!targetRestaurantId) {
      showError(t("userNotAssignedToRestaurant"));
      return;
    }

    setIsSubmitting(true);
    try {
      await TicketAPI.create({ code, restaurant_id: targetRestaurantId });
      showSuccess(t("codeSentSuccessfully", { code }));
      setCode("");
      fetchRecentTickets();
      loadTickets(); // Refresh active tickets as well
    } catch (error: any) {
      if (error.statusCode === 409) {
        showError(t("codeAlreadyExists"));
      } else if (error.statusCode === 429) {
        showError(t("tooManyRequests"));
      } else {
        showError(t("failedToSendCode"));
      }
      console.error("Error creating ticket:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSoftDeleteRecentTicket = async (ticket: Ticket) => {
    if (!user || processingRecentDelete === ticket.id) return;

    setProcessingRecentDelete(ticket.id);
    try {
      await TicketAPI.update(ticket.id, {
        soft_deleted: true,
        deleted_by_user_id: user.id,
        deleted_by_user_email: user.email,
        restaurant_id: ticket.restaurant_id,
      });
      showSuccess(t('ticketRemovedSuccessfully'));
      fetchRecentTickets(); // Re-fetch recent tickets to update the list
      loadTickets(); // Also refresh active tickets
    } catch (error) {
      console.error('Error soft deleting recent ticket:', error);
      showError(t('failedToRemoveTicket'));
    } finally {
      setProcessingRecentDelete(null);
    }
  };

  const isCodeValid = code.length === 4 && /^[A-Z0-9]{4}$/.test(code);
  const canSubmitCode = isCodeValid && !isSubmitting && (!!user?.restaurant_id || (isAdmin && selectedRestaurant !== "all"));

  // --- Functions for Viewing Tickets (Balcao-like) ---
  const loadTickets = useCallback(async () => {
    if (!user || (!isAdmin && user.user_role === "restaurante" && !user.restaurant_id)) {
      setLoadingTickets(false);
      setRefreshingTickets(false);
      return;
    }
    setRefreshingTickets(true);
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
      setLoadingTickets(false);
      setRefreshingTickets(false);
    }
  }, [user, isAdmin, t, selectedRestaurant]);

  useEffect(() => {
    loadTickets();
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
      await fetchRecentTickets(); // Also refresh recent tickets
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
      await fetchRecentTickets(); // Also refresh recent tickets
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

  const getTicketStatusDisplay = (ticket: Ticket) => {
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

  const getRestaurantNameForTicket = (restaurantId: string | undefined) => {
    if (!restaurantId) return t("none");
    const restaurant = availableRestaurants.find(r => r.id === restaurantId);
    return restaurant ? restaurant.name : `Restaurante ${restaurantId.substring(0, 4)}`;
  };

  const currentRestaurantName = isAdmin && selectedRestaurant !== "all"
    ? availableRestaurants.find(r => r.id === selectedRestaurant)?.name || selectedRestaurant
    : (isRestaurante && user?.restaurant_id
      ? availableRestaurants.find(r => r.id === user.restaurant_id)?.name || user.restaurant_id
      : null);

  if (loadingTickets) {
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
      className="space-y-6 w-full"
    >
      <div className="flex items-center gap-4">
        <PackageIcon className="h-8 w-8 text-blue-600" />
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-800">{t("orderManagement")}</h2>
      </div>

      {/* Filter Bar */}
      {(isAdmin || isRestaurante) && (
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 w-full sm:w-auto">
              {isAdmin && (
                <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
                  <SelectTrigger className="w-full sm:w-[200px]">
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
              {isRestaurante && user?.restaurant_id && (
                <div className="text-lg font-medium text-gray-700">
                  {t("restaurant")}: {currentRestaurantName}
                </div>
              )}
            </div>
            <Button
              onClick={() => { loadTickets(); fetchRecentTickets(); }}
              variant="outline"
              disabled={refreshingTickets}
              className="space-x-2"
            >
              <RefreshCcwIcon className={`h-4 w-4 ${refreshingTickets ? 'animate-spin' : ''}`} />
              <span>{t('refresh')}</span>
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section for Sending Codes */}
        <div className="flex flex-col items-center space-y-6">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl md:text-2xl">{t("sendNewCode")}</CardTitle>
              <CardDescription>{t("sendDeliveryCodesToCounter")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitCode} className="flex flex-col gap-4">
                <Input
                  type="text"
                  placeholder="XXXX"
                  maxLength={4}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
                  className="text-xl sm:text-2xl text-center font-mono tracking-widest border-estafeta focus:ring-estafeta-dark focus:border-estafeta-dark"
                  disabled={isSubmitting || (!user?.restaurant_id && selectedRestaurant === "all")}
                />
                <p className="text-sm text-gray-500 text-center">{t("fourCharactersHint")}</p>
                {(!user?.restaurant_id && selectedRestaurant === "all") && (
                  <p className="text-sm text-red-600 text-center font-medium">
                    {t("userNotAssignedToRestaurant")}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={!canSubmitCode}
                  className="w-full bg-gradient-to-r from-estafeta to-estafeta-dark text-white hover:from-estafeta-dark hover:to-estafeta"
                >
                  {isSubmitting ? (
                    t("sending")
                  ) : (
                    <>
                      <SendIcon className="mr-2 h-4 w-4" /> {t("sendCode")}
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center gap-2">
              <ClockIcon className="h-5 w-5 text-gray-600" />
              <CardTitle className="text-lg sm:text-xl md:text-2xl">{t("lastSevenCodesSent")}</CardTitle>
            </CardHeader>
            <CardContent>
              {recentTickets.length === 0 ? (
                <p className="text-center text-gray-500">{t("noRecentCodes")}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {recentTickets.map((ticket) => {
                    const isTicketProcessing = processingRecentDelete === ticket.id;
                    const isSoftDeleted = ticket.soft_deleted;

                    return (
                      <motion.div
                        key={ticket.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                        className={cn(
                          "flex items-center justify-between rounded-lg border p-3 shadow-sm relative",
                          isSoftDeleted ? "bg-blue-50 border-blue-200" :
                          ticket.status === "CONFIRMADO" ? "bg-green-50 border-green-200" :
                          "bg-yellow-50 border-yellow-200",
                          isTicketProcessing && "opacity-60 cursor-not-allowed"
                        )}
                      >
                        <Badge
                          className={cn(
                            "text-base font-bold px-3 py-1",
                            isSoftDeleted ? "bg-blue-200 text-blue-900" :
                            ticket.status === "CONFIRMADO" ? "bg-green-200 text-green-900" :
                            "bg-yellow-200 text-yellow-900"
                          )}
                        >
                          {ticket.code}
                        </Badge>
                        <div className="flex items-center gap-2">
                          {isSoftDeleted ? (
                            <Badge variant="outline" className="bg-blue-100 text-blue-800">
                              <CheckCircleIcon className="mr-1 h-3 w-3" /> {t("ready")}
                            </Badge>
                          ) : ticket.status === "CONFIRMADO" ? (
                            <Badge variant="outline" className="bg-green-100 text-green-800">
                              <CheckCircleIcon className="mr-1 h-3 w-3" /> {t("acknowledged")}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
                              <ClockIcon className="mr-1 h-3 w-3" /> {t("pending")}
                            </Badge>
                          )}
                          {!isSoftDeleted && ( // Mostrar botão de apagar apenas se não estiver soft-deleted
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:text-red-700 transition-opacity duration-200"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSoftDeleteRecentTicket(ticket);
                              }}
                              disabled={isTicketProcessing}
                              aria-label={t('removeTicket')}
                            >
                              {isTicketProcessing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2Icon className="h-5 w-5" />
                              )}
                            </Button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Section for Viewing Active Tickets */}
        <div className="space-y-6">
          <h3 className="text-2xl font-bold text-gray-800">{t('activeTickets')}</h3>
          <p className="text-muted-foreground">
            {t('activeTicketsDescription', { count: tickets.length })}
          </p>

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
                  const status = getTicketStatusDisplay(ticket);
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
                          "h-full cursor-pointer transition-all duration-200 border-2 relative",
                          status.cardClass,
                          status.clickable ? 'hover:shadow-lg hover:scale-105' : '',
                          isPendingDelete ? 'ring-4 ring-red-500 shadow-xl' : 'hover-lift',
                          isProcessing ? 'opacity-60 cursor-not-allowed' : '',
                          "flex flex-col"
                        )}
                        onClick={() => !isProcessing && handleTicketClick(ticket)}
                      >
                        {ticket.status === 'CONFIRMADO' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 text-red-500 hover:text-red-700 transition-opacity duration-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSoftDelete(ticket);
                            }}
                            disabled={isProcessing}
                            aria-label={t('removeTicket')}
                          >
                            <Trash2Icon className="h-5 w-5" />
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
        </div>
      </div>
    </motion.div>
  );
}