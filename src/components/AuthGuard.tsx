import React, { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, UserRole } from "@/context/AuthContext";

interface AuthGuardProps {
  children: ReactNode;
  allowedRoles: UserRole[];
  requiresRestaurantId?: boolean; // Nova propriedade
}

export const AuthGuard = ({ children, allowedRoles, requiresRestaurantId = false }: AuthGuardProps) => {
  const { isAuthenticated, isApproved, user, isLoading } = useAuth();

  if (isLoading) {
    return null; // Ou um spinner de carregamento
  }

  if (!isAuthenticated || !isApproved || !user || !allowedRoles.includes(user.user_role)) {
    // Redirecionar para a página inicial ou uma página proibida se não autorizado
    return <Navigate to="/" replace />;
  }

  // Se a rota requer um restaurant_id e o usuário não é admin, verificar se ele tem um.
  if (requiresRestaurantId && user.user_role !== 'admin' && !user.restaurant_id) {
    // Redirecionar para a página inicial se o restaurant_id estiver faltando
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};