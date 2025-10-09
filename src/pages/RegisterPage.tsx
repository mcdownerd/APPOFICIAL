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
import * as SupabaseAuthUI from '@supabase/auth-ui-shared';

const RegisterPage = () => {
  const { isAuthenticated, isApproved, user, isLoading } = useAuth();
  const { t, i18n: reactI18n } = useTranslation(); // Renomeado para evitar conflito com o import do Supabase
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && !isApproved) {
      // After signup, show pending status via Layout
      navigate("/", { replace: true });
    } else if (isAuthenticated && isApproved && user) {
      const firstPath = user.user_role === 'admin' ? '/admin/users' :
                        user.user_role === 'restaurante' ? '/balcao' :
                        '/estafeta';
      navigate(firstPath, { replace: true });
    }
  }, [isAuthenticated, isApproved, user, isLoading, navigate]);

  if (isLoading) return null;

  // Selecionar o objeto de localização correto
  const currentLocalization = reactI18n.language === 'pt' ? SupabaseAuthUI.i18n.locales.pt : SupabaseAuthUI.i18n.locales.en;

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
            <h2 className="text-3xl font-bold text-center text-gray-800">{t("createYourNewAccount")}</h2>
            <Auth
              supabaseClient={supabase}
              appearance={{ 
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: '#3b82f6',
                      brandAccent: '#1d4ed8',
                    },
                  },
                },
              }}
              theme="light"
              providers={[]} // Only email/password
              view="sign_up"
              redirectTo={window.location.origin + '/dashboard'}
              localization={currentLocalization} // Pass dynamic localization
            />
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-500">
                {t("alreadyHaveAccount")}{" "}
                <a href="/login" className="text-blue-500 hover:underline">
                  {t("backToLogin")}
                </a>
              </p>
              <p className="text-xs text-gray-400 mt-2">
                {t("testEmailsHint")}
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

export default RegisterPage;