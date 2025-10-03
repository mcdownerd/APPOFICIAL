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
import { TruckIcon, ClockIcon, CheckCircleIcon, SendIcon } from "lucide-react";
import { motion } from "framer-motion";
import { parseISO } from "date-fns"; // Removed addMinutes, isPast
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const EstafetaPage = () => {
  const { user } = useAuth();
  const { isPendingLimitEnabled } = useSettings();
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [recentTickets, setRecentTickets] = useState<Ticket[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingTicketsCount, setPendingTicketsCount] = useState(0);

  const fetchRecentTickets = useCallback(async () => {
    if (!user) return;
    try {
      // Fetch all tickets by the user, including soft-deleted ones
      const allUserTickets = await TicketAPI.filter(
        { created_by: user.id, soft_deleted: undefined }, // `undefined` means don't filter by soft_deleted, get all
        "-created_date",
      );

      const ticketsToDisplay: Ticket[] = [];

      allUserTickets.forEach(ticket => {
        // Always display all tickets (active and soft-deleted) in the recent list
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
  const canSubmit = isCodeValid && !isSubmitting && (isPendingLimitEnabled ? pendingTicketsCount < 4 : true) && !!user?.restaurant_id;

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
          <h2 className="text-3xl font-bold text-gray-800">{t("courierCenter")}</h2>
        </div>

        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("sendNewCode")}</CardTitle>
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
                className="text-center text-2xl font-mono tracking-widest border-estafeta focus:ring-estafeta-dark focus:border-estafeta-dark"
                disabled={isSubmitting || (isPendingLimitEnabled && pendingTicketsCount >= 4) || !user?.restaurant_id}
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
          <CardTitle>{t("lastSevenCodesSent")}</CardTitle>
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
                    ticket.soft_deleted ? "bg-blue-50 border-blue-200" : "bg-yellow-50 border-yellow-200"
                  )}
                >
                  <Badge 
                    className={cn(
                      "text-base font-bold px-3 py-1",
                      ticket.soft_deleted ? "bg-blue-200 text-blue-900" : "bg-yellow-200 text-yellow-900"
                    )}
                  >
                    {ticket.code}
                  </Badge>
                  {ticket.soft_deleted ? (
                    <Badge variant="outline" className="bg-blue-100 text-blue-800">
                      <CheckCircleIcon className="mr-1 h-3 w-3" /> {t("ready")}
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