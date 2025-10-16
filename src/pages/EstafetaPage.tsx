"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { TicketAPI, Ticket } from "@/lib/api";
import { showSuccess, showError } from "@/utils/toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TruckIcon, ClockIcon, CheckCircleIcon, SendIcon, Loader2 } from 'lucide-react';
import { motion } from "framer-motion";
import { parseISO, isPast, addMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client"; // Adicionado: Importação do cliente Supabase

const EstafetaPage = React.memo(() => {
  const { user } = useAuth();
  const { isPendingLimitEnabled, isSettingsLoading } = useSettings();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const restaurantId = user?.restaurant_id;
  const userId = user?.id;

  // Query para buscar tickets recentes do usuário
  const { data: recentTickets = [], isLoading: isLoadingRecentTickets } = useQuery<Ticket[], Error>({
    queryKey: ["userRecentTickets", userId, restaurantId],
    queryFn: async () => {
      if (!userId) return [];
      const allUserTickets = await TicketAPI.filter(
        { created_by_user_id: userId, soft_deleted: undefined },
        "-created_date",
      );

      const ticketsToDisplay: Ticket[] = [];
      const now = new Date();

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
      
      return ticketsToDisplay.slice(0, 7);
    },
    enabled: !!userId && !!restaurantId,
    staleTime: 1000 * 60 * 5, // Considerar tickets recentes "stale" após 5 minutos para re-fetch em background
  });

  // Query para contar tickets pendentes do restaurante
  const { data: pendingTicketsCount = 0, isLoading: isLoadingPendingCount } = useQuery<number, Error>({
    queryKey: ["pendingTicketsCount", restaurantId],
    queryFn: async () => {
      if (!restaurantId) return 0;
      const pendingTickets = await TicketAPI.filter({ status: "PENDING", soft_deleted: false, restaurant_id: restaurantId });
      return pendingTickets.length;
    },
    enabled: !!restaurantId,
    staleTime: 1000 * 5, // Re-fetch a cada 5 segundos em background
  });

  // Supabase Realtime subscription for tickets
  useEffect(() => {
    if (!restaurantId) return;

    console.log(`EstafetaPage: Subscribing to realtime changes for tickets in restaurant ${restaurantId}`);

    const channel = supabase // Corrigido: 'supabase' agora está importado
      .channel(`tickets_estafeta:${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'tickets',
          filter: `restaurant_id=eq.${restaurantId}`
        },
        (payload) => {
          console.log('EstafetaPage: Realtime update received:', payload);
          // Invalidate queries to trigger a refetch
          queryClient.invalidateQueries({ queryKey: ["userRecentTickets", userId, restaurantId] });
          queryClient.invalidateQueries({ queryKey: ["pendingTicketsCount", restaurantId] });
        }
      )
      .subscribe();

    return () => {
      console.log(`EstafetaPage: Unsubscribing from realtime changes for tickets in restaurant ${restaurantId}`);
      supabase.removeChannel(channel); // Corrigido: 'supabase' agora está importado
    };
  }, [restaurantId, userId, queryClient]);

  const createTicketMutation = useMutation({
    mutationFn: async (payload: { code: string; restaurant_id?: string }) => {
      return TicketAPI.create(payload);
    },
    onSuccess: (newTicket) => {
      showSuccess(t("codeSentSuccessfully", { code: newTicket.code }));
      setCode("");
      // Invalidate queries to refetch the lists
      queryClient.invalidateQueries({ queryKey: ["userRecentTickets", userId, restaurantId] });
      queryClient.invalidateQueries({ queryKey: ["pendingTicketsCount", restaurantId] });
    },
    onError: (error: any) => {
      if (error.statusCode === 409) {
        showError(t("codeAlreadyExists"));
      } else if (error.statusCode === 429) {
        showError(t("tooManyRequests"));
      } else {
        showError(t("failedToSendCode"));
      }
      console.error("Error creating ticket:", error);
    },
    onSettled: () => {
      setIsSubmitting(false);
    }
  });

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length !== 4 || isSubmitting) return;
    if (!restaurantId) {
      showError(t("userNotAssignedToRestaurant"));
      return;
    }

    if (isPendingLimitEnabled && pendingTicketsCount >= 4) {
      showError(t("pendingLimitReached"));
      return;
    }

    setIsSubmitting(true);
    createTicketMutation.mutate({ code, restaurant_id: restaurantId });
  }, [code, isSubmitting, restaurantId, isPendingLimitEnabled, pendingTicketsCount, createTicketMutation, t]);

  const isCodeValid = code.length === 4 && /^[A-Z0-9]{4}$/.test(code);
  const canSubmit = isCodeValid && !isSubmitting && !isSettingsLoading && !isLoadingPendingCount && (isPendingLimitEnabled ? pendingTicketsCount < 4 : true) && !!restaurantId;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 lg:grid-cols-2 gap-6"
    >
      <div className="flex flex-col items-center space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="p-3 rounded-full bg-gradient-to-r from-estafeta to-estafeta-dark text-white mb-2">
            <TruckIcon className="h-8 w-8" />
          </div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800">{t("courierCenter")}</h2>
        </div>

        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg sm:text-xl md:text-2xl">{t("sendNewCode")}</CardTitle>
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                <ClockIcon className="mr-1 h-3 w-3" /> {t("pending")}: {isLoadingPendingCount ? <Loader2 className="h-3 w-3 animate-spin" /> : pendingTicketsCount}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input
                type="text"
                placeholder="XXXX"
                maxLength={4}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
                className="text-xl sm:text-2xl text-center font-mono tracking-widest border-estafeta focus:ring-estafeta-dark focus:border-estafeta-dark"
                disabled={isSubmitting || isSettingsLoading || isLoadingPendingCount || (isPendingLimitEnabled && pendingTicketsCount >= 4) || !restaurantId}
              />
              <p className="text-sm text-gray-500 text-center">{t("fourCharactersHint")}</p>
              {isPendingLimitEnabled && pendingTicketsCount >= 4 && (
                <p className="text-sm text-red-600 text-center font-medium">
                  {t("pendingLimitReached")}
                </p>
              )}
              {!restaurantId && (
                <p className="text-sm text-red-600 text-center font-medium">
                  {t("userNotAssignedToRestaurant")}
                </p>
              )}
              <Button
                type="submit"
                disabled={!canSubmit}
                className="w-full bg-gradient-to-r from-estafeta to-estafeta-dark text-white hover:from-estafeta-dark hover:to-estafeta"
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <SendIcon className="mr-2 h-4 w-4" /> {t("sendCode")}
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="w-full flex justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="flex flex-row items-center gap-2">
            <ClockIcon className="h-5 w-5 text-gray-600" />
            <CardTitle className="text-lg sm:text-xl md:text-2xl">{t("lastSevenCodesSent")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingRecentTickets ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : recentTickets.length === 0 ? (
              <p className="text-center text-gray-500">{t("noRecentCodes")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {recentTickets.map((ticket) => (
                  <motion.div
                    key={ticket.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className={cn(
                      "flex items-center justify-between rounded-lg border p-3 shadow-sm",
                      ticket.soft_deleted ? "bg-blue-50 border-blue-200" : 
                      ticket.status === "CONFIRMADO" ? "bg-green-50 border-green-200" : 
                      "bg-yellow-50 border-yellow-200"
                    )}
                  >
                    <Badge 
                      className={cn(
                        "text-base font-bold px-3 py-1",
                        ticket.soft_deleted ? "bg-blue-200 text-blue-900" : 
                        ticket.status === "CONFIRMADO" ? "bg-green-200 text-green-900" : 
                        "bg-yellow-200 text-yellow-900"
                      )}
                    >
                      {ticket.code}
                    </Badge>
                    {ticket.soft_deleted ? (
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
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
});

export default EstafetaPage;