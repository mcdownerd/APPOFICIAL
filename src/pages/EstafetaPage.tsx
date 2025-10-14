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
import { TruckIcon, ClockIcon, CheckCircleIcon, SendIcon } from 'lucide-react';
import { motion } from "framer-motion";
import { parseISO, isPast, addMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const EstafetaPage = () => {
  const { user } = useAuth();
  const { isPendingLimitEnabled, isSettingsLoading } = useSettings(); // Use isSettingsLoading
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [recentTickets, setRecentTickets] = useState<Ticket[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingTicketsCount, setPendingTicketsCount] = useState(0);

  // DEBUG LOGS
  useEffect(() => {
    console.log("EstafetaPage: isPendingLimitEnabled from Context:", isPendingLimitEnabled);
    console.log("EstafetaPage: isSettingsLoading from Context:", isSettingsLoading);
    console.log("EstafetaPage: User restaurant_id:", user?.restaurant_id);
  }, [isPendingLimitEnabled, isSettingsLoading, user?.restaurant_id]);

  const fetchRecentTickets = useCallback(async () => {
    if (!user) return;
    try {
      // Fetch all tickets by the user, including soft-deleted ones
      const allUserTickets = await TicketAPI.filter(
        { created_by_user_id: user.id, soft_deleted: undefined }, // Use created_by_user_id
        "-created_date",
      );

      const ticketsToDisplay: Ticket[] = [];
      const now = new Date();

      allUserTickets.forEach(ticket => {
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
        ticketsToDisplay.push(ticket);
      });

      ticketsToDisplay.sort((a, b) => {
        // Sort logic remains the same, prioritizing soft-deleted first, then by date
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
  }, [user, t]);

  const fetchPendingTicketsCount = useCallback(async () => {
    try {
      // Filter pending tickets by the current user's restaurant_id
      const pendingTickets = await TicketAPI.filter({ status: "PENDING", soft_deleted: false, restaurant_id: user?.restaurant_id });
      setPendingTicketsCount(pendingTickets.length);
    } catch (error) {
      console.error("Failed to fetch pending tickets count:", error);
      showError(t("pendingTicketsCountFailed"));
    }
  }, [t, user?.restaurant_id]);

  useEffect(() => {
    fetchRecentTickets();
    const interval = setInterval(fetchRecentTickets, 5000);
    return () => {
      clearInterval(interval);
    };
  }, [fetchRecentTickets]);

  useEffect(() => {
    fetchPendingTicketsCount();
    const interval = setInterval(fetchPendingTicketsCount, 5000);
    return () => {
      clearInterval(interval);
    };
  }, [fetchPendingTicketsCount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length !== 4 || isSubmitting) return;
    if (!user?.restaurant_id) {
      showError(t("userNotAssignedToRestaurant"));
      return;
    }

    if (isPendingLimitEnabled && pendingTicketsCount >= 4) {
      showError(t("pendingLimitReached"));
      return;
    }

    setIsSubmitting(true);
    try {
      await TicketAPI.create({ code, restaurant_id: user.restaurant_id });
      showSuccess(t("codeSentSuccessfully", { code }));
      setCode("");
      fetchRecentTickets();
      fetchPendingTicketsCount();
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

  const isCodeValid = code.length === 4 && /^[A-Z0-9]{4}$/.test(code);
  const canSubmit = isCodeValid && !isSubmitting && !isSettingsLoading && (isPendingLimitEnabled ? pendingTicketsCount < 4 : true) && !!user?.restaurant_id;

  // --- DEBUG LOGS ---
  console.log("EstafetaPage: isPendingLimitEnabled (final check for canSubmit):", isPendingLimitEnabled);
  console.log("EstafetaPage: pendingTicketsCount (final check for canSubmit):", pendingTicketsCount);
  console.log("EstafetaPage: isSettingsLoading (final check for canSubmit):", isSettingsLoading);
  console.log("EstafetaPage: canSubmit:", canSubmit);
  // --- END DEBUG LOGS ---

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      // Adicionado p-4 para padding geral
      className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4"
    >
      <div className="flex flex-col items-center space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="p-3 rounded-full bg-gradient-to-r from-estafeta to-estafeta-dark text-white mb-2">
            <TruckIcon className="h-8 w-8" />
          </div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800">{t("courierCenter")}</h2> {/* Ajustado tamanho da fonte */}
        </div>

        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg sm:text-xl md:text-2xl">{t("sendNewCode")}</CardTitle> {/* Ajustado tamanho da fonte */}
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                <ClockIcon className="mr-1 h-3 w-3" /> {t("pending")}: {pendingTicketsCount}
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
                // Ajustado tamanho da fonte
                className="text-xl sm:text-2xl text-center font-mono tracking-widest border-estafeta focus:ring-estafeta-dark focus:border-estafeta-dark"
                disabled={isSubmitting || isSettingsLoading || (isPendingLimitEnabled && pendingTicketsCount >= 4) || !user?.restaurant_id}
              />
              <p className="text-sm text-gray-500 text-center">{t("fourCharactersHint")}</p>
              {isPendingLimitEnabled && pendingTicketsCount >= 4 && (
                <p className="text-sm text-red-600 text-center font-medium">
                  {t("pendingLimitReached")}
                </p>
              )}
              {!user?.restaurant_id && (
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
      </div>

      <Card className="w-full">
        <CardHeader className="flex flex-row items-center gap-2">
          <ClockIcon className="h-5 w-5 text-gray-600" />
          <CardTitle className="text-lg sm:text-xl md:text-2xl">{t("lastSevenCodesSent")}</CardTitle> {/* Ajustado tamanho da fonte */}
        </CardHeader>
        <CardContent>
          {recentTickets.length === 0 ? (
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
                    // Prioridade: soft_deleted (azul), depois CONFIRMADO (verde), depois PENDING (amarelo)
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
    </motion.div>
  );
};

export default EstafetaPage;