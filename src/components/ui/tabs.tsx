'use client';

import type React from 'react';
import { createContext, useContext, useState, useId } from 'react';

interface TabsContextValue {
  value: string;
  onChange: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tab components must be used within a Tabs provider');
  }
  return context;
}

export interface TabsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}

export function Tabs({
  value: controlledValue,
  defaultValue = '',
  onValueChange,
  className = '',
  children,
}: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const baseId = useId();

  const isControlled = controlledValue !== undefined;
  const currentValue = isControlled ? controlledValue : uncontrolledValue;

  const handleChange = (newValue: string) => {
    if (!isControlled) {
      setUncontrolledValue(newValue);
    }
    onValueChange?.(newValue);
  };

  return (
    <TabsContext.Provider value={{ value: currentValue, onChange: handleChange, baseId }}>
      <div className={`ui-tabs ${className}`.trim()}>{children}</div>
    </TabsContext.Provider>
  );
}

export interface TabListProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'underline' | 'pills' | 'segmented';
  fullWidth?: boolean;
}

export function TabList({
  variant = 'underline',
  fullWidth = false,
  className = '',
  children,
  ...props
}: TabListProps) {
  const variantClass = `ui-tab-list-${variant}`;
  const widthClass = fullWidth ? 'ui-tab-list-full' : '';

  return (
    <div
      role="tablist"
      className={`ui-tab-list ${variantClass} ${widthClass} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

export interface TabTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
}

export function TabTrigger({
  value,
  badge,
  icon,
  className = '',
  children,
  disabled,
  ...props
}: TabTriggerProps) {
  const { value: activeValue, onChange, baseId } = useTabsContext();
  const isSelected = activeValue === value;
  const tabId = `${baseId}-tab-${value}`;
  const panelId = `${baseId}-panel-${value}`;

  return (
    <button
      type="button"
      role="tab"
      id={tabId}
      aria-selected={isSelected}
      aria-controls={panelId}
      tabIndex={isSelected ? 0 : -1}
      disabled={disabled}
      className={`ui-tab-trigger ${isSelected ? 'ui-tab-trigger-active' : ''} ${className}`.trim()}
      onClick={() => onChange(value)}
      {...props}
    >
      {icon && <span className="ui-tab-icon" aria-hidden="true">{icon}</span>}
      <span className="ui-tab-label">{children}</span>
      {badge !== undefined && badge !== null && (
        <span className="ui-tab-badge">{badge}</span>
      )}
    </button>
  );
}

export interface TabContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function TabContent({
  value,
  className = '',
  children,
  ...props
}: TabContentProps) {
  const { value: activeValue, baseId } = useTabsContext();
  const isSelected = activeValue === value;
  const tabId = `${baseId}-tab-${value}`;
  const panelId = `${baseId}-panel-${value}`;

  if (!isSelected) {
    return null;
  }

  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId}
      className={`ui-tab-content ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
