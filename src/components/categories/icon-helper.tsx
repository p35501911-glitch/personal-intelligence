'use client';

import React from 'react';
import * as LucideIcons from 'lucide-react';
import { LucideProps } from 'lucide-react';

interface CategoryIconProps extends Omit<LucideProps, 'ref' | 'name'> {
  name?: string | null;
}

export function CategoryIcon({ name, className, ...rest }: CategoryIconProps) {
  if (!name) {
    return <LucideIcons.Folder className={className || 'w-5 h-5'} {...rest} />;
  }

  // Typecast through unknown to access dynamic icon component
  const iconsMap = LucideIcons as unknown as Record<string, React.ComponentType<LucideProps>>;
  const IconComponent = iconsMap[name];

  if (!IconComponent) {
    return <LucideIcons.Layers className={className || 'w-5 h-5'} {...rest} />;
  }

  return <IconComponent className={className} {...rest} />;
}
