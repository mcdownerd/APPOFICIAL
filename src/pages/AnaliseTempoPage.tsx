"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { TicketAPI, Ticket, UserAPI } from "@/lib/api";
import { showError } from "@/utils/toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { RefreshCwIcon, TrendingUpIcon, ClockIcon, AlertCircleIcon, BarChart3Icon, DownloadIcon, CheckCircleIcon, Loader2 } from "lucide-react";
import { format, parseISO, differenceInMinutes, subDays, addDays, startOfDay, endOfDay, startOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon, ChevronDownIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Interface para dados agregados
interface AnalysisData {
  totalOrders: number;
  avgPendingTime: number; // Em minutos
  peakHour: string;
  peakCount: number;
  confirmationRate: number; // Em %
  hourlyData: HourlyData[];
}

interface HourlyData {
  hour: string;
  pedidos: number;
  avgPending?: number; // Opcional para futuro gráfico
}

// Type for DateRange (from shadcn/ui Calendar) - matching react-day-picker's required properties
type DateRange = { from: Date | undefined; to: Date | undefined };

// Componente para Date Range Picker simplificado
const DateRangePicker = ({ dateRange, onChange }: { dateRange: DateRange; onChange: (range: DateRange | undefined) => void }) => {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full sm:w-[280px] justify-start text-left font-normal">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {dateRange.from ? (
            dateRange.to ? (
              `${format(dateRange.from, "dd/MM/yyyy")} - ${format(dateRange.to, "dd/MM/yyyy")}`
            ) : (
              format(dateRange.from, "dd/MM/yyyy")
            )
          ) : (
            <span>{t("pickADate")}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={dateRange}
          onSelect={onChange}
          numberOfMonths={2}
          toDate={new Date()}
          fromDate={subDays(new Date(), 365)}
        />
      </PopoverContent>
    </Popover>
  );
};

// Função para calcular KPIs
const calculateKPIs = (tickets: Ticket[], t: any): AnalysisData => {
  if (tickets.length === 0) {
    return {
      totalOrders: 0,
      avgPendingTime: 0,
      peakHour: "00h",
      peakCount: 0,
      confirmationRate: 0,
      hourlyData: Array.from({ length: 24 }, (_, i) => ({ hour: `${i.toString().padStart(2, '0')}h`, pedidos: 0 })),
    };
  }

  const hourlyCounts: Record<string, number> = {};
  let totalPendingMinutes = 0;
  let confirmedCount = 0;
  let pendingCount = 0;

  for (let i = 0; i < 24; i++) {
    hourlyCounts[i.toString().padStart(2, '0')] = 0;
  }

  tickets.forEach((ticket) => {
    const createdDate = parseISO(ticket.created_date);
    const hour = format(createdDate, "HH", { locale: ptBR });
    hourlyCounts[hour]++;

    if (ticket.status === "CONFIRMADO") {
      confirmedCount++;
    } else {
      pendingCount++;
    }

    let endDate: Date | null = null;
    if (ticket.status === "CONFIRMADO" && ticket.acknowledged_at) {
      endDate = parseISO(ticket.acknowledged_at);
    } else if (ticket.soft_deleted && ticket.deleted_at) {
      endDate = parseISO(ticket.deleted_at);
    } else if (ticket.soft_deleted) {
      endDate = new Date();
    }

    if (endDate) {
      const minutes = differenceInMinutes(endDate, createdDate);
      totalPendingMinutes += Math.max(0, minutes);
    }
  });

  const avgPendingTime = tickets.length > 0 ? totalPendingMinutes / tickets.length : 0;
  const confirmationRate = tickets.length > 0 ? (confirmedCount / tickets.length) * 100 : 0;

  let peakHour = "00";
  let peakCount = 0;
  Object.entries(hourlyCounts).forEach(([hour, count]) => {
    if (count > peakCount) {
      peakCount = count;
      peakHour = hour;
    }
  });

  const hourlyData = Object.entries(hourlyCounts).map(([hour, pedidos]) => ({
    hour: `${hour}h`,
    pedidos,
  }));

  return {
    totalOrders: tickets.length,
    avgPendingTime: Math.round(avgPendingTime),
    peakHour: `${peakHour}h`,
    peakCount,
    confirmationRate: Math.round(confirmationRate),
    hourlyData,
  };
};

// Componente KPI Card
const KPIcard = ({ title, value, subtitle, icon: Icon, color = "blue" }: { title: string; value: any; subtitle: string; icon: React.ElementType; color?: string }) => (
  <Card className="p-4 hover:shadow-lg hover:scale-[1.02] transition-all duration-200">
    <div className="flex items-center justify-between">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <Icon className={`h-6 w-6 text-${color}-600`} />
    </div>
  </Card>
);

const AnaliseTempoPage = React.memo(() => {
  const { user, isAdmin } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [dateRange, setDateRange] = useState<DateRange>({ from: subDays(new Date(), 7), to: new Date() });
  const [selectedPeriod, setSelectedPeriod] = useState("week");
  const [selectedRestaurant, setSelectedRestaurant] = useState("all");
  const [availableRestaurants, setAvailableRestaurants] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const userRestaurantId = user?.restaurant_id;

  // Effect to update dateRange when selectedPeriod changes
  useEffect(() => {
    const today = new Date();
    let newFrom: Date | undefined;
    let newTo: Date | undefined;

    switch (selectedPeriod) {
      case "today":
        newFrom = startOfDay(today);
        newTo = endOfDay(today);
        break;
      case "week":
        newFrom = startOfWeek(today, { weekStartsOn: 0 });
        newTo = endOfDay(today);
        break;
      case "month":
        newFrom = startOfMonth(today);
        newTo = endOfDay(today);
        break;
      case "custom":
        return;
      default:
        break;
    }
    setDateRange({ from: newFrom, to: newTo });
  }, [selectedPeriod]);

  // Query para buscar restaurantes disponíveis (para filtro)
  const { isLoading: isLoadingRestaurants } = useQuery<{ id: string; name: string }[], Error>({
    queryKey: ["availableRestaurants"],
    queryFn: async () => {
      if (!isAdmin) return [];
      const restaurantUsers = await UserAPI.filter({ user_role: "restaurante", status: "APPROVED" });
      const uniqueRestaurantIds = Array.from(new Set(restaurantUsers.map(u => u.restaurant_id).filter(Boolean) as string[]));
      const restaurants = uniqueRestaurantIds.map(id => ({ id, name: `Restaurante ${id.substring(0, 4)}` }));
      setAvailableRestaurants(restaurants);
      return restaurants;
    },
    enabled: isAdmin,
    staleTime: 1000 * 60 * 10,
  });

  // Query para dados de análise
  const { data: analysisData, isLoading: isLoadingAnalysis, error: queryError, refetch } = useQuery<AnalysisData, Error>({
    queryKey: ["analysis", dateRange, selectedRestaurant, userRestaurantId, isAdmin],
    queryFn: async () => {
      let allTickets: Ticket[] = [];
      if (isAdmin) {
        allTickets = await TicketAPI.filter({ soft_deleted: undefined }, "-created_date");
      } else if (user?.user_role === "restaurante" && userRestaurantId) {
        allTickets = await TicketAPI.filter({ restaurant_id: userRestaurantId, soft_deleted: undefined }, "-created_date");
      }

      const startDate = dateRange.from ? startOfDay(dateRange.from) : null;
      const endDate = dateRange.to ? endOfDay(dateRange.to) : null;

      const filteredTickets = allTickets.filter((ticket) => {
        const created = parseISO(ticket.created_date);
        let passesDateFilter = true;
        if (startDate && created < startDate) passesDateFilter = false;
        if (endDate && created > endDate) passesDateFilter = false;
        return passesDateFilter;
      });

      if (isAdmin && selectedRestaurant !== "all") {
        const filteredByRestaurant = filteredTickets.filter((ticket) => ticket.restaurant_id === selectedRestaurant);
        return calculateKPIs(filteredByRestaurant, t);
      }

      return calculateKPIs(filteredTickets, t);
    },
    enabled: !!user && !isLoadingRestaurants,
    staleTime: 1000 * 60 * 5, // Cache por 5 minutos
    // Removido: onError, pois não é mais suportado diretamente nas opções do useQuery v5
  });

  // Handle query error
  useEffect(() => {
    if (queryError) {
      setError(queryError.message || t("failedToLoadTimeAnalysis"));
    } else {
      setError(null);
    }
  }, [queryError, t]);

  const handleDateRangeChange = useCallback((range: DateRange | undefined) => {
    setDateRange(range || { from: undefined, to: undefined });
    setSelectedPeriod("custom");
  }, []);

  const handleApplyFilters = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleExport = useCallback(() => {
    if (!analysisData) return;
    const csv = `Hora,Pedidos\n${analysisData.hourlyData.map(d => `${d.hour},${d.pedidos}`).join("\n")}`; // Corrigido: Acesso seguro a 'hourlyData'
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analise-tempo-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [analysisData]);

  // Custom Tooltip
  const CustomTooltip = useCallback(({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-md border bg-white p-2 text-sm shadow-md">
          <p className="font-bold">{label}</p>
          <p className="text-gray-700">{t("orders")}: {payload[0].value}</p>
          {analysisData && (
            <p className="text-xs text-muted-foreground">
              {t("totalOrdersCreatedEachHour", { total: analysisData.totalOrders })} // Corrigido: Acesso seguro a 'totalOrders'
            </p>
          )}
        </div>
      );
    }
    return null;
  }, [analysisData, t]);

  // Empty State
  if (!isLoadingAnalysis && analysisData?.totalOrders === 0) { // Corrigido: Acesso seguro a 'totalOrders'
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center min-h-[60vh] space-y-4"
      >
        <BarChart3Icon className="h-12 w-12 text-muted-foreground" />
        <h3 className="text-lg font-medium">{t("noDataAvailable")}</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          {t("noDataDescription", { period: t(selectedPeriod) })}
        </p>
        <Button onClick={handleApplyFilters} variant="outline">
          {t("adjustFilters")}
        </Button>
      </motion.div>
    );
  }

  // Error State
  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <Alert variant="destructive">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={() => { setError(null); refetch(); }} className="w-full">
          {t("retry")}
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
        <TrendingUpIcon className="h-8 w-8 text-green-600" />
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-800">{t("timeAnalysisOfOrders")}</h2>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <DateRangePicker dateRange={dateRange} onChange={handleDateRangeChange} />
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder={t("selectPeriod")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">{t("today")}</SelectItem>
                <SelectItem value="week">{t("week")}</SelectItem>
                <SelectItem value="month">{t("month")}</SelectItem>
                <SelectItem value="custom">{t("custom")}</SelectItem>
              </SelectContent>
            </Select>
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
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4 sm:mt-0">
            <Button onClick={handleApplyFilters} variant="default">
              {t("applyFilters")}
            </Button>
            <Button onClick={() => refetch()} variant="outline" disabled={isLoadingAnalysis}>
              <RefreshCwIcon className={cn("h-4 w-4 mr-2", isLoadingAnalysis && "animate-spin")} />
              {t("refresh")}
            </Button>
            <Button onClick={handleExport} variant="outline">
              <DownloadIcon className="h-4 w-4 mr-2" />
              {t("export")}
            </Button>
          </div>
        </div>
      </Card>

      {isLoadingAnalysis ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : analysisData ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPIcard
            title={t("totalOrders")}
            value={analysisData.totalOrders} // Corrigido: Acesso seguro a 'totalOrders'
            subtitle={t("thisPeriod", { period: t(selectedPeriod) })}
            icon={BarChart3Icon}
            color="blue"
          />
          <KPIcard
            title={t("avgPendingTime")}
            value={`${analysisData.avgPendingTime}min`} // Corrigido: Acesso seguro a 'avgPendingTime'
            subtitle={analysisData.avgPendingTime > 10 ? t("highPendingAlert") : t("goodPending")} // Corrigido: Acesso seguro a 'avgPendingTime'
            icon={ClockIcon}
            color={analysisData.avgPendingTime > 10 ? "red" : "green"} // Corrigido: Acesso seguro a 'avgPendingTime'
          />
          <KPIcard
            title={t("peakHour")}
            value={`${analysisData.peakHour} (${analysisData.peakCount})`} // Corrigido: Acesso seguro a 'peakHour' e 'peakCount'
            subtitle={t("peakDescription")}
            icon={TrendingUpIcon}
            color="orange"
          />
          <KPIcard
            title={t("confirmationRate")}
            value={`${analysisData.confirmationRate}%`} // Corrigido: Acesso seguro a 'confirmationRate'
            subtitle={analysisData.confirmationRate > 90 ? t("highRate") : t("improveRate")} // Corrigido: Acesso seguro a 'confirmationRate'
            icon={CheckCircleIcon}
            color={analysisData.confirmationRate > 90 ? "green" : "yellow"} // Corrigido: Acesso seguro a 'confirmationRate'
          />
        </div>
      ) : null}

      <Card className="p-6 lg:p-8">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-xl sm:text-2xl font-bold">{t("ordersByHourOfDay")}</CardTitle>
            <CardDescription className="mt-2">
              {t("totalOrdersCreatedEachHour")}
            </CardDescription>
          </div>
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoadingAnalysis}>
            <RefreshCwIcon className={cn("h-4 w-4", isLoadingAnalysis && "animate-spin")} />
          </Button>
        </CardHeader>
        <CardContent>
          {isLoadingAnalysis ? (
            <Skeleton className="h-[300px] w-full rounded-md" />
          ) : analysisData ? (
            <div className="h-[300px] sm:h-[350px] lg:h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analysisData.hourlyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}> {/* Corrigido: Acesso seguro a 'hourlyData' */}
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                  <XAxis dataKey="hour" tickLine={false} axisLine={false} className="text-sm text-gray-600" />
                  <YAxis tickLine={false} axisLine={false} className="text-sm text-gray-600" />
                  <Tooltip cursor={{ fill: 'transparent' }} content={<CustomTooltip />} />
                  <Bar dataKey="pedidos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
});

export default AnaliseTempoPage;