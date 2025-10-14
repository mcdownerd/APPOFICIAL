"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { UserAPI, User, UserStatus, UserRole } from "@/lib/api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { UsersIcon, CheckCircleIcon, XCircleIcon, RefreshCcwIcon, UserCogIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTranslation } from "react-i18next";

const UserManagementPage = () => {
  const { user: currentUser, isAdmin } = useAuth();
  const { t, i18n } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [restaurantIds, setRestaurantIds] = useState<string[]>([]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedUsers = await UserAPI.filter({}, "-created_date");
      setUsers(fetchedUsers);

      const uniqueIds = Array.from(new Set(
        fetchedUsers
          .map(u => u.restaurant_id)
          .filter((id): id is string => id !== undefined && id !== null)
      ));
      setRestaurantIds(uniqueIds.sort());

    } catch (error) {
      console.error("Failed to fetch users:", error);
      showError(t("failedToLoadUsers"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin, fetchUsers]);

  const handleUpdateUserStatus = async (userId: string, status: UserStatus) => {
    if (!isAdmin) {
      showError(t("permissionDenied"));
      return;
    }
    setActionLoading(userId);
    try {
      await UserAPI.update(userId, { status });
      showSuccess(t("userStatusUpdated", { status }));
      fetchUsers();
    } catch (error) {
      console.error("Failed to update user status:", error);
      showError(t("failedToUpdateUserStatus"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateUserRole = async (userId: string, role: UserRole) => {
    if (!isAdmin) {
      showError(t("permissionDenied"));
      return;
    }
    setActionLoading(userId);
    try {
      await UserAPI.update(userId, { user_role: role });
      showSuccess(t("userRoleUpdated", { role }));
      fetchUsers();
    } catch (error) {
      console.error("Failed to update user role:", error);
      showError(t("failedToUpdateUserRole"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateRestaurantId = async (userId: string, newRestaurantId: string | null) => {
    if (!isAdmin) {
      showError(t("permissionDenied"));
      return;
    }
    setActionLoading(userId);
    try {
      await UserAPI.update(userId, { restaurant_id: newRestaurantId === "unassigned" ? null : newRestaurantId });
      showSuccess(t("userRestaurantIdUpdated"));
      fetchUsers();
    } catch (error) {
      console.error("Failed to update user restaurant ID:", error);
      showError(t("failedToUpdateUserRestaurantId"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateDashboardAccessCode = async (userId: string, code: string) => {
    if (!isAdmin) {
      showError(t("permissionDenied"));
      return;
    }
    setActionLoading(userId);
    try {
      await UserAPI.update(userId, { dashboard_access_code: code || null });
      showSuccess(t("dashboardAccessCodeUpdated"));
      fetchUsers();
    } catch (error) {
      console.error("Failed to update dashboard access code:", error);
      showError(t("failedToUpdateDashboardAccessCode"));
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: UserStatus) => {
    switch (status) {
      case "PENDING":
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800">{t("pending")}</Badge>;
      case "APPROVED":
        return <Badge variant="outline" className="bg-green-100 text-green-800">{t("approved")}</Badge>;
      case "REJECTED":
        return <Badge variant="outline" className="bg-red-100 text-red-800">{t("rejected")}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-xl text-gray-600">{t("accessDeniedAdminOnly")}</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 w-full"
    >
      <div className="flex items-center gap-4">
        <UsersIcon className="h-8 w-8 text-blue-600" />
        <h2 className="text-3xl font-bold text-gray-800">{t("userManagement")}</h2>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">{t("allUsers")}</CardTitle>
          <Button variant="outline" size="icon" onClick={fetchUsers} disabled={loading}>
            <RefreshCcwIcon className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            <span className="sr-only">{t("refresh")}</span>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-t-transparent"></div>
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-gray-500">{t("noUsersFound")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("fullName")}</TableHead>
                    <TableHead>{t("email")}</TableHead>
                    <TableHead>{t("role")}</TableHead>
                    <TableHead>{t("restaurantId")}</TableHead>
                    <TableHead>{t("dashboardAccessCode")}</TableHead> {/* Nova coluna */}
                    <TableHead>{t("status")}</TableHead>
                    <TableHead>{t("createdAt")}</TableHead>
                    <TableHead className="text-right">{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.full_name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Select
                          value={user.user_role}
                          onValueChange={(value: UserRole) => handleUpdateUserRole(user.id, value)}
                          disabled={actionLoading === user.id || user.id === currentUser?.id}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder={t("selectRole")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="estafeta">{t("courier")}</SelectItem>
                            <SelectItem value="restaurante">{t("restaurant")}</SelectItem>
                            <SelectItem value="admin">{t("admin")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {/* Permitir que admin, restaurante e estafeta tenham restaurant_id */}
                        {(user.user_role === "restaurante" || user.user_role === "estafeta" || user.user_role === "admin") ? (
                          <Select
                            value={user.restaurant_id || "unassigned"}
                            onValueChange={(value: string) => handleUpdateRestaurantId(user.id, value)}
                            disabled={actionLoading === user.id}
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder={t("selectRestaurantId")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">{t("none")}</SelectItem>
                              {restaurantIds.map(id => (
                                <SelectItem key={id} value={id}>{id}</SelectItem>
                              ))}
                              {!restaurantIds.includes(user.restaurant_id || "") && user.restaurant_id && (
                                <SelectItem value={user.restaurant_id}>{user.restaurant_id} (current)</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        ) : (
                          user.restaurant_id || "N/A"
                        )}
                      </TableCell>
                      <TableCell>
                        {user.user_role === "estafeta" ? (
                          <Input
                            type="text"
                            value={user.dashboard_access_code || ""}
                            onChange={(e) => handleUpdateDashboardAccessCode(user.id, e.target.value)}
                            placeholder={t("setAccessCode")}
                            className="w-[120px]"
                            disabled={actionLoading === user.id}
                          />
                        ) : (
                          "N/A"
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(user.status)}</TableCell>
                      <TableCell>
                        {format(parseISO(user.created_date), "dd/MM/yyyy HH:mm", { locale: i18n.language === 'pt' ? ptBR : undefined })}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {user.status !== "APPROVED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUpdateUserStatus(user.id, "APPROVED")}
                            disabled={actionLoading === user.id}
                          >
                            <CheckCircleIcon className="mr-2 h-4 w-4" /> {t("approve")}
                          </Button>
                        )}
                        {user.status !== "REJECTED" && user.id !== currentUser?.id && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleUpdateUserStatus(user.id, "REJECTED")}
                            disabled={actionLoading === user.id}
                          >
                            <XCircleIcon className="mr-2 h-4 w-4" /> {t("reject")}
                          </Button>
                        )}
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

export default UserManagementPage;