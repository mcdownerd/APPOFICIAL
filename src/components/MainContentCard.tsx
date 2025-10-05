"use client";

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MainContentCardProps {
  children: React.ReactNode;
  className?: string;
}

const MainContentCard = ({ children, className }: MainContentCardProps) => {
  return (
    <Card className={cn("w-full max-w-4xl mx-auto my-8 shadow-lg rounded-lg", className)}>
      <CardContent className="p-6">
        {children}
      </CardContent>
    </Card>
  );
};

export default MainContentCard;