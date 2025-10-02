"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { TicketAPI, Ticket } from "@/lib/api";
import { showSuccess, showError } from "@/utils/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HistoryIcon, RefreshCcwIcon, Undo2Icon, CheckCircleIcon, ClockIcon, Trash2Icon } from "lucide-react";
import { format, parseISO, differenceInMinutes, differenceInHours, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTranslation } from "react-i18next"; // Import useTranslation

// Função auxiliar para calcular e formatar a duração do tempo pendente
const getPendingDuration = (ticket: Ticket, t: any): string => { // Pass t as argument
  const createdDate = parseISO(ticket.created_date);
  let endDate: Date | null = null;

  // O tempo pendente termina quando o ticket é CONFIRMADO ou, se for soft-deleted enquanto pendente, na data de exclusão.
  // Priorizamos a data de CONFIRMADO se existir, pois é a resolução do estado pendente.
  if (ticket.status === "CONFIRMADO" && ticket.acknowledged_at) {
    endDate = parseISO(ticket.acknowledged_at);
  } else if (ticket.soft_deleted && ticket.deleted_at) {
    // Se foi soft-deleted e não foi CONFIRMADO, o tempo pendente termina na exclusão.
    endDate = parseISO(ticket.deleted_at);
  }

  if (!endDate) {
    return "N/A"; // Não deve acontecer para tickets no histórico
  }

  const totalMinutes = differenceInMinutes(endDate, createdDate);

  if (totalMinutes < 1) {
    return t("lessThanOneMin");
  }

  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  let parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}min`);

  return parts.length > 0 ? parts.join(" ") : "0min";
};

const HistoricoPage = () => {
  const { user, isAdmin } = useAuth(); // Obter isAdmin do contexto
  const { t, i18n } = useTranslation(); // Use translation hook
  const [deletedTickets, setDeletedTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchDeletedTickets = useCallback(async () => {
    setLoading(true);
    try {
      let tickets: Ticket[];
      if (isAdmin) {
        // Admin vê todos os tickets removidos
        tickets = await TicketAPI.filter({ soft_deleted: true }, "-deleted_at");
      } else if (user?.user_role === "restaurante" && user.restaurant_id) {
        // Restaurante vê apenas os tickets removidos que foram CONFIRMADO por ele
        tickets = await TicketAPI.filter({ soft_deleted: true, restaurant_id: user.restaurant_id }, "-deleted_at");
      } else {
        tickets = []; // Outros usuários não veem tickets aqui
      }
      setDeletedTickets(tickets);
    } catch (error) {
      console.error("Failed to fetch deleted tickets:", error);
      showError(t("failedToLoadHistory"));
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, t]);

  useEffect(() => {
    fetchDeletedTickets(); // Fetch initially
  }, [fetchDeletedTickets]);

  const handleRestoreTicket = async (ticketId: string) => {
    if (!user) {
      showError(t("userNotAuthenticated"));
      return;
    }
    setActionLoading(ticketId);
    try {
      await TicketAPI.update(ticketId, { soft_deleted: false });
      showSuccess(t("ticketRestoredSuccessfully"));
      fetchDeletedTickets(); // Refresh list
    } catch (error) {
      console.error("Failed to restore ticket:", error);
      showError(t("failedToRestoreTicket"));
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6" // Removido max-w-6xl mx-auto
    >
      <div className="flex items-center gap-4">
        <HistoryIcon className="h-8 w-8 text-blue-600" />
        <h2 className="text-3xl font-bold text-gray-800">{t("ticketHistory")}</h2>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">{t("removedTickets")}</CardTitle>
          <Button variant="outline" size="icon" onClick={fetchDeletedTickets} disabled={loading}>
            <RefreshCcwIcon className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            <span className="sr-only">{t("refresh")}</span>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-t-transparent"></div>
            </div>
          ) : deletedTickets.length === 0 ? (
            <p className="text-center text-gray-500">{t("noRemovedTickets")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("code")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead>{t("createdBy")}</TableHead>
                    <TableHead>{t("removedAt")}</TableHead>
                    <TableHead>{t("pendingTime")}</TableHead> {/* Nova coluna */}
                    <TableHead className="text-right">{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deletedTickets.map((ticket) => (
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
                      <TableCell>{ticket.created_by}</TableCell>
                      <TableCell>
                        {ticket.deleted_at
                          ? format(parseISO(ticket.deleted_at), "dd/MM/yyyy HH:mm", { locale: i18n.language === 'pt' ? ptBR : undefined })
                          : "N/A"}
                      </TableCell>
                      <TableCell>{getPendingDuration(ticket, t)}</TableCell> {/* Exibe o tempo pendente */}
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestoreTicket(ticket.id)}
                          disabled={actionLoading === ticket.id}
                        >
                          <Undo2Icon className="mr-2 h-4 w-4" />
                          {actionLoading === ticket.id ? t("restoring") : t("restore")}
                        </Button>
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
};

export default HistoricoPage;