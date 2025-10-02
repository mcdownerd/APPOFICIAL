"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { TicketAPI, Ticket } from "@/lib/api";
import { showError } from "@/utils/toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { RefreshCcwIcon, TrendingUpIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTranslation } from "react-i18next"; // Import useTranslation

interface HourlyData {
  hour: string;
  pedidos: number; // Renomeado de 'count' para 'pedidos'
}

const AnaliseTempoPage = () => {
  const { user } = useAuth();
  const { t } = useTranslation(); // Use translation hook
  const [hourlyTicketData, setHourlyTicketData] = useState<HourlyData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAnalysisData = useCallback(async () => {
    setLoading(true);
    try {
      const allTickets = await TicketAPI.list("-created_date"); // Fetch all tickets
      
      // Initialize hourly counts for a 24-hour period
      const initialHourlyData: Record<string, number> = {};
      for (let i = 0; i < 24; i++) {
        initialHourlyData[i.toString().padStart(2, '0')] = 0;
      }

      allTickets.forEach(ticket => {
        const createdDate = parseISO(ticket.created_date);
        const hour = format(createdDate, "HH", { locale: ptBR }); // Get hour in 24-hour format
        if (initialHourlyData[hour] !== undefined) {
          initialHourlyData[hour]++;
        }
      });

      const formattedData: HourlyData[] = Object.keys(initialHourlyData).map(hour => ({
        hour: `${hour}h`,
        pedidos: initialHourlyData[hour], // Usando 'pedidos'
      }));
      
      setHourlyTicketData(formattedData);

    } catch (error) {
      console.error("Failed to fetch analysis data:", error);
      showError(t("failedToLoadTimeAnalysis"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchAnalysisData();
  }, [fetchAnalysisData]);

  // Custom Tooltip content
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-md border bg-white p-2 text-sm shadow-md">
          <p className="font-bold">{label}</p>
          <p className="text-gray-700">{t("orders")}: {payload[0].value}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 w-full" // Adicionado w-full
    >
      <div className="flex items-center gap-4">
        <TrendingUpIcon className="h-8 w-8 text-green-600" />
        <h2 className="text-3xl font-bold text-gray-800">{t("timeAnalysisOfOrders")}</h2>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">{t("ordersByHourOfDay")}</CardTitle>
          <Button variant="outline" size="icon" onClick={fetchAnalysisData} disabled={loading}>
            <RefreshCcwIcon className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            <span className="sr-only">{t("refresh")}</span>
          </Button>
        </CardHeader>
        <CardContent>
          <CardDescription className="mb-4">
            {t("totalOrdersCreatedEachHour")}
          </CardDescription>
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-t-transparent"></div>
            </div>
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyTicketData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                  <XAxis dataKey="hour" tickLine={false} axisLine={false} className="text-sm text-gray-600" />
                  <YAxis tickLine={false} axisLine={false} className="text-sm text-gray-600" />
                  <Tooltip cursor={{ fill: 'transparent' }} content={CustomTooltip} /> {/* Usando o Tooltip customizado */}
                  <Bar dataKey="pedidos" fill="#3b82f6" radius={[4, 4, 0, 0]} /> {/* dataKey alterado para 'pedidos' */}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default AnaliseTempoPage;