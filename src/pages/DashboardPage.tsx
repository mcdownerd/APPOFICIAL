"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { TicketAPI, Ticket, UserAPI } from "@/lib/api";
import { showError } from "@/utils/toast";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LayoutDashboardIcon, RefreshCwIcon, CheckCircleIcon, ClockIcon, CalendarIcon, ArrowUpDown } from "lucide-react";
import { format, parseISO } from "date-fns";
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

const DashboardPage = () => {
  const { user, isAdmin } = useAuth();
  const { t, i18n } = useTranslation();
  const [activeTickets, setActiveTickets] = useState<TicketWithRestaurantName[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRestaurant, setSelectedRestaurant] = useState("all"); // 'all' or a specific restaurant_id
  const [availableRestaurants, setAvailableRestaurants] = useState<{ id: string; name: string }[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ key: 'created_date', direction: 'desc' });

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
    setLoading(true);
    try {
      let tickets: Ticket[] = [];
      const filter: Partial<Ticket> = { soft_deleted: false };

      if (isAdmin) {
        if (selectedRestaurant !== "all") {
          filter.restaurant_id = selectedRestaurant;
        }
        tickets = await TicketAPI.filter(filter, "-created_date");
      } else if (user?.user_role === "restaurante" && user.restaurant_id) {
        filter.restaurant_id = user.restaurant_id;
        tickets = await TicketAPI.filter(filter, "-created_date");
      } else {
        tickets = [];
      }

      const ticketsWithRestaurantName: TicketWithRestaurantName[] = tickets.map(ticket => ({
        ...ticket,
        restaurantNameDisplay: getRestaurantNameForTicket(ticket.restaurant_id),
      }));

      // Apply client-side sorting
      if (sortConfig) {
        ticketsWithRestaurantName.sort((a, b) => {
          let aValue: any;
          let bValue: any;

          switch (sortConfig.key) {
            case 'code':
              aValue = a.code;
              bValue = b.code;
              break;
            case 'status':
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

      setActiveTickets(ticketsWithRestaurantName);
    } catch (error) {
      console.error("Failed to fetch active tickets for dashboard:", error);
      showError(t("failedToLoadActiveTickets"));
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, selectedRestaurant, t, sortConfig, getRestaurantNameForTicket]);

  useEffect(() => {
    fetchActiveTickets();
    const interval = setInterval(fetchActiveTickets, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [fetchActiveTickets]);

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

  if (!isAdmin && user?.user_role === "restaurante" && !user.restaurant_id) {
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
};

export default DashboardPage;