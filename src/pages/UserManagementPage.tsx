"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { UserAPI, User, UserStatus, UserRole, RestaurantAPI, Restaurant } from "@/lib/api";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { UsersIcon, CheckCircleIcon, XCircleIcon, RefreshCcwIcon, UserCogIcon, PlusCircleIcon, Loader2, SettingsIcon, MonitorIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch"; // Import Switch

const UserManagementPage = React.memo(() => {
  const { user: currentUser, isAdmin } = useAuth();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();

  // State for Add Restaurant Dialog
  const [isAddRestaurantDialogOpen, setIsAddRestaurantDialogOpen] = useState(false);
  const [newRestaurantId, setNewRestaurantId] = useState("");
  const [newRestaurantName, setNewRestaurantName] = useState("");

  // State for Manage Restaurant Settings Dialog
  const [isManageRestaurantsDialogOpen, setIsManageRestaurantsDialogOpen] = useState(false);

  // Query para buscar todos os usuários
  const { data: users, isLoading: isLoadingUsers, refetch: refetchUsers } = useQuery<User[], Error>({
    queryKey: ["allUsers"],
    queryFn: async () => {
      if (!isAdmin) return [];
      return UserAPI.filter({}, "-created_date");
    },
    enabled: isAdmin,
    staleTime: 1000 * 60 * 5, // Cache por 5 minutos
  });

  // Query para buscar todos os IDs de restaurantes
  const { data: restaurants, isLoading: isLoadingRestaurants, refetch: refetchRestaurants } = useQuery<Restaurant[], Error>({
    queryKey: ["allRestaurants"],
    queryFn: async () => {
      return RestaurantAPI.list();
    },
    staleTime: 1000 * 60 * 10, // Cache por 10 minutos
  });

  // Mutations para atualizar status, papel e restaurant_id do usuário
  const updateUserStatusMutation = useMutation({
    mutationFn: async (variables: { userId: string; status: UserStatus }) => {
      if (!isAdmin) throw new Error(t("permissionDenied"));
      return UserAPI.update(variables.userId, { status: variables.status });
    },
    onSuccess: (data, variables) => {
      showSuccess(t("userStatusUpdated", { status: variables.status }));
      queryClient.invalidateQueries({ queryKey: ["allUsers"] });
    },
    onError: (error) => {
      console.error("Failed to update user status:", error);
      showError(t("failedToUpdateUserStatus"));
    }
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: async (variables: { userId: string; role: UserRole }) => {
      if (!isAdmin) throw new Error(t("permissionDenied"));
      return UserAPI.update(variables.userId, { user_role: variables.role });
    },
    onSuccess: (data, variables) => {
      showSuccess(t("userRoleUpdated", { role: variables.role }));
      queryClient.invalidateQueries({ queryKey: ["allUsers"] });
    },
    onError: (error) => {
      console.error("Failed to update user role:", error);
      showError(t("failedToUpdateUserRole"));
    }
  });

  const updateUserRestaurantIdMutation = useMutation({
    mutationFn: async (variables: { userId: string; restaurantId: string | null }) => {
      if (!isAdmin) throw new Error(t("permissionDenied"));
      return UserAPI.update(variables.userId, { restaurant_id: variables.restaurantId });
    },
    onSuccess: () => {
      showSuccess(t("userRestaurantIdUpdated"));
      queryClient.invalidateQueries({ queryKey: ["allUsers"] });
    },
    onError: (error) => {
      console.error("Failed to update user restaurant ID:", error);
      showError(t("failedToUpdateUserRestaurantId"));
    }
  });

  const updateDashboardAccessCodeMutation = useMutation({
    mutationFn: async (variables: { userId: string; code: string | null }) => {
      if (!isAdmin) throw new Error(t("permissionDenied"));
      return UserAPI.update(variables.userId, { dashboard_access_code: variables.code });
    },
    onSuccess: () => {
      showSuccess(t("dashboardAccessCodeUpdated"));
      queryClient.invalidateQueries({ queryKey: ["allUsers"] });
    },
    onError: (error) => {
      console.error("Failed to update dashboard access code:", error);
      showError(t("failedToUpdateDashboardAccessCode"));
    }
  });

  const addRestaurantMutation = useMutation({
    mutationFn: async (variables: { id: string; name: string }) => {
      return RestaurantAPI.create(variables.id, variables.name);
    },
    onSuccess: () => {
      showSuccess(t("restaurantAddedSuccessfully"));
      setIsAddRestaurantDialogOpen(false);
      setNewRestaurantId("");
      setNewRestaurantName("");
      queryClient.invalidateQueries({ queryKey: ["allRestaurants"] }); // Refetch restaurant IDs
    },
    onError: (error: any) => {
      console.error("Failed to add restaurant:", error);
      if (error.statusCode === 409) {
        showError(t("restaurantIdAlreadyExists"));
      } else {
        showError(t("failedToAddRestaurant"));
      }
    }
  });

  const updateRestaurantSettingsMutation = useMutation({
    mutationFn: async (variables: { restaurantId: string; payload: Partial<Restaurant> }) => {
      if (!isAdmin) throw new Error(t("permissionDenied"));
      return RestaurantAPI.update(variables.restaurantId, variables.payload);
    },
    onSuccess: (data, variables) => {
      showSuccess(t("restaurantSettingsUpdated", { restaurantName: data.name }));
      queryClient.invalidateQueries({ queryKey: ["allRestaurants"] });
      // Invalidate settings context if the current user's restaurant settings were updated
      if (currentUser?.restaurant_id === variables.restaurantId) {
        queryClient.invalidateQueries({ queryKey: ["settings", currentUser.restaurant_id] });
      }
    },
    onError: (error) => {
      console.error("Failed to update restaurant settings:", error);
      showError(t("failedToUpdateRestaurantSettings"));
    }
  });

  const handleUpdateUserStatus = useCallback((userId: string, status: UserStatus) => {
    updateUserStatusMutation.mutate({ userId, status });
  }, [updateUserStatusMutation]);

  const handleUpdateUserRole = useCallback((userId: string, role: UserRole) => {
    updateUserRoleMutation.mutate({ userId, role });
  }, [updateUserRoleMutation]);

  const handleUpdateRestaurantId = useCallback((userId: string, newRestaurantId: string | null) => {
    updateUserRestaurantIdMutation.mutate({ userId, restaurantId: newRestaurantId === "unassigned" ? null : newRestaurantId });
  }, [updateUserRestaurantIdMutation]);

  const handleUpdateDashboardAccessCode = useCallback((userId: string, code: string) => {
    updateDashboardAccessCodeMutation.mutate({ userId, code: code || null });
  }, [updateDashboardAccessCodeMutation]);

  const handleAddRestaurant = useCallback(async () => {
    if (!newRestaurantId.trim() || !newRestaurantName.trim()) {
      showError(t("pleaseFillAllFields"));
      return;
    }
    addRestaurantMutation.mutate({ id: newRestaurantId.trim(), name: newRestaurantName.trim() });
  }, [newRestaurantId, newRestaurantName, addRestaurantMutation, t]);

  const handleToggleRestaurantSetting = useCallback((restaurantId: string, setting: 'pending_limit_enabled' | 'ecran_estafeta_enabled', currentValue: boolean) => {
    updateRestaurantSettingsMutation.mutate({
      restaurantId,
      payload: { [setting]: !currentValue }
    });
  }, [updateRestaurantSettingsMutation]);

  const getStatusBadge = useCallback((status: UserStatus) => {
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
  }, [t]);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-xl text-gray-600">{t("accessDeniedAdminOnly")}</p>
      </div>
    );
  }

  const isAnyActionLoading = updateUserStatusMutation.isPending || updateUserRoleMutation.isPending || updateUserRestaurantIdMutation.isPending || updateDashboardAccessCodeMutation.isPending || addRestaurantMutation.isPending || updateRestaurantSettingsMutation.isPending;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 w-full"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <UsersIcon className="h-8 w-8 text-blue-600" />
          <h2 className="text-3xl font-bold text-gray-800">{t("userManagement")}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsManageRestaurantsDialogOpen(true)}>
            <SettingsIcon className="mr-2 h-4 w-4" /> {t("manageRestaurants")}
          </Button>
          <Button variant="outline" onClick={() => setIsAddRestaurantDialogOpen(true)}>
            <PlusCircleIcon className="mr-2 h-4 w-4" /> {t("addRestaurant")}
          </Button>
          <Button variant="outline" size="icon" onClick={() => { refetchUsers(); refetchRestaurants(); }} disabled={isLoadingUsers || isLoadingRestaurants}>
            <RefreshCcwIcon className={(isLoadingUsers || isLoadingRestaurants) ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            <span className="sr-only">{t("refresh")}</span>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">{t("allUsers")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingUsers ? (
            <div className="flex items-center justify-center p-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-t-transparent"></div>
            </div>
          ) : users?.length === 0 ? (
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
                    <TableHead>{t("dashboardAccessCode")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead>{t("createdAt")}</TableHead>
                    <TableHead className="text-right">{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.full_name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Select
                          value={user.user_role}
                          onValueChange={(value: UserRole) => handleUpdateUserRole(user.id, value)}
                          disabled={isAnyActionLoading || user.id === currentUser?.id}
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
                        {(user.user_role === "restaurante" || user.user_role === "estafeta" || user.user_role === "admin") ? (
                          <Select
                            value={user.restaurant_id || "unassigned"}
                            onValueChange={(value: string) => handleUpdateRestaurantId(user.id, value)}
                            disabled={isAnyActionLoading}
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder={t("selectRestaurantId")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">{t("none")}</SelectItem>
                              {restaurants?.map(r => (
                                <SelectItem key={r.id} value={r.id}>{r.name} ({r.id})</SelectItem>
                              ))}
                              {/* If a user has a restaurant_id not in the current list, display it as an option */}
                              {!restaurants?.some(r => r.id === user.restaurant_id) && user.restaurant_id && (
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
                            disabled={isAnyActionLoading}
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
                            disabled={isAnyActionLoading}
                          >
                            {updateUserStatusMutation.isPending && updateUserStatusMutation.variables?.userId === user.id && updateUserStatusMutation.variables?.status === "APPROVED" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircleIcon className="mr-2 h-4 w-4" />} {t("approve")}
                          </Button>
                        )}
                        {user.status !== "REJECTED" && user.id !== currentUser?.id && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleUpdateUserStatus(user.id, "REJECTED")}
                            disabled={isAnyActionLoading}
                          >
                            {updateUserStatusMutation.isPending && updateUserStatusMutation.variables?.userId === user.id && updateUserStatusMutation.variables?.status === "REJECTED" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircleIcon className="mr-2 h-4 w-4" />} {t("reject")}
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

      {/* Add Restaurant Dialog */}
      <Dialog open={isAddRestaurantDialogOpen} onOpenChange={setIsAddRestaurantDialogOpen}>
        <DialogContent className="sm:max-w-[425px]" aria-labelledby="add-restaurant-dialog-title">
          <DialogHeader>
            <DialogTitle id="add-restaurant-dialog-title">{t("addRestaurant")}</DialogTitle>
            <DialogDescription>
              {t("addRestaurantDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="restaurantId" className="text-right">
                {t("restaurantId")}
              </Label>
              <Input
                id="restaurantId"
                value={newRestaurantId}
                onChange={(e) => setNewRestaurantId(e.target.value)}
                className="col-span-3"
                disabled={addRestaurantMutation.isPending}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="restaurantName" className="text-right">
                {t("restaurantName")}
              </Label>
              <Input
                id="restaurantName"
                value={newRestaurantName}
                onChange={(e) => setNewRestaurantName(e.target.value)}
                className="col-span-3"
                disabled={addRestaurantMutation.isPending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              onClick={handleAddRestaurant} 
              disabled={addRestaurantMutation.isPending || !newRestaurantId.trim() || !newRestaurantName.trim()}
            >
              {addRestaurantMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PlusCircleIcon className="mr-2 h-4 w-4" />
              )}
              {t("add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Restaurant Settings Dialog */}
      <Dialog open={isManageRestaurantsDialogOpen} onOpenChange={setIsManageRestaurantsDialogOpen}>
        <DialogContent className="sm:max-w-2xl" aria-labelledby="manage-restaurants-dialog-title">
          <DialogHeader>
            <DialogTitle id="manage-restaurants-dialog-title">{t("manageRestaurantSettings")}</DialogTitle>
            <DialogDescription>
              {t("manageRestaurantSettingsDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            {isLoadingRestaurants ? (
              <div className="flex items-center justify-center p-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-t-transparent"></div>
              </div>
            ) : restaurants?.length === 0 ? (
              <p className="text-center text-gray-500">{t("noRestaurantsFound")}</p>
            ) : (
              <div className="space-y-4">
                {restaurants?.map((restaurant) => (
                  <Card key={restaurant.id} className="p-4">
                    <CardTitle className="text-lg mb-2">{restaurant.name} ({restaurant.id})</CardTitle>
                    <div className="space-y-3">
                      {/* Pending Limit Setting */}
                      <div className="flex items-center justify-between">
                        <Label htmlFor={`pending-limit-${restaurant.id}`} className="flex flex-col">
                          <span>{t("enablePendingLimit")}</span>
                          <span className="text-xs text-muted-foreground">{t("pendingLimitDescription")}</span>
                        </Label>
                        <Switch
                          id={`pending-limit-${restaurant.id}`}
                          checked={restaurant.pending_limit_enabled}
                          onCheckedChange={(checked) => handleToggleRestaurantSetting(restaurant.id, 'pending_limit_enabled', restaurant.pending_limit_enabled)}
                          disabled={updateRestaurantSettingsMutation.isPending && updateRestaurantSettingsMutation.variables?.restaurantId === restaurant.id}
                        />
                      </div>
                      {/* Ecran Estafeta Setting */}
                      <div className="flex items-center justify-between">
                        <Label htmlFor={`ecran-estafeta-${restaurant.id}`} className="flex flex-col">
                          <span>{t("enableCourierScreen")}</span>
                          <span className="text-xs text-muted-foreground">{t("courierScreenDescription")}</span>
                        </Label>
                        <Switch
                          id={`ecran-estafeta-${restaurant.id}`}
                          checked={restaurant.ecran_estafeta_enabled}
                          onCheckedChange={(checked) => handleToggleRestaurantSetting(restaurant.id, 'ecran_estafeta_enabled', restaurant.ecran_estafeta_enabled)}
                          disabled={updateRestaurantSettingsMutation.isPending && updateRestaurantSettingsMutation.variables?.restaurantId === restaurant.id}
                        />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsManageRestaurantsDialogOpen(false)}>
              {t("close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
});

export default UserManagementPage;