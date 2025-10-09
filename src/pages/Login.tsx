"use client";

import React from "react";
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { LayoutDashboardIcon } from "lucide-react";

// Importar localizações do Supabase Auth UI
import { pt } from '@supabase/auth-ui-shared/dist/i18n/pt';
import { en } from '@supabase/auth-ui-shared/dist/i18n/en';

const Login = () => {
  const { isAuthenticated, isApproved, user, isLoading } = useAuth();
  const { t, i18n } = useTranslation(); // Usar i18n diretamente do useTranslation
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && isApproved && user) {
      // Redirect to first allowed page
      const firstPath = user.user_role === 'admin' ? '/admin/users' :
                        user.user_role === 'restaurante' ? '/balcao' :
                        '/estafeta';
      navigate(firstPath, { replace: true });
    }
  }, [isAuthenticated, isApproved, user, isLoading, navigate]);

  if (isLoading || (isAuthenticated && !isApproved)) return null; // Layout handles pending/rejected

  // Selecionar o objeto de localização correto
  const currentLocalization = i18n.language === 'pt' ? pt : en;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4"
    >
      <Card className="w-full max-w-md lg:max-w-4xl shadow-xl rounded-lg overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Branding Section (Left for Desktop, Top for Mobile) */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-700 text-white p-8 rounded-t-lg lg:rounded-l-lg lg:rounded-t-none flex flex-col items-center justify-center space-y-4">
            <LayoutDashboardIcon className="h-16 w-16" />
            <h1 className="text-4xl font-bold">{t("deliveryFlow")}</h1>
            <p className="text-lg text-center">{t("appTagline")}</p>
          </div>

          {/* Auth Form Section (Right for Desktop, Bottom for Mobile) */}
          <CardContent className="p-8 space-y-6 flex flex-col justify-center">
            <h2 className="text-3xl font-bold text-center text-gray-800">{t("loginToYourAccount")}</h2>
            <Auth
              supabaseClient={supabase}
              appearance={{ 
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: '#3b82f6', // Blue for primary
                      brandAccent: '#1d4ed8',
                    },
                  },
                },
              }}
              theme="light"
              providers={[]} // Only email/password
              view="sign_in"
              redirectTo={window.location.origin + '/dashboard'} // Redirect after auth
              localization={currentLocalization} // Pass dynamic localization
            />
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-500">
                {t("noAccount")}{" "}
                <a href="/register" className="text-blue-500 hover:underline">
                  {t("register")}
                </a>
              </p>
            </div>
            <div className="mt-4 flex justify-center">
              <LanguageSwitcher />
            </div>
          </CardContent>
        </div>
      </Card>
    </motion.div>
  );
};

export default Login;