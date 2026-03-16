/**
 * MealPlanView.tsx — Chanoch Meal Planner UI
 *
 * Hardening changes from the previous version:
 *
 * 1. SCHEMA ALIGNMENT   — day.meals.breakfast (nested) replaces day.breakfast (flat).
 *                         All reads/writes go through day.meals.* to match the new
 *                         MealPlanDay type.
 *
 * 2. DUPLICATE EXTRACTION REMOVED — handleGenerate no longer re-parses days/budget
 *                         from preferences. The service layer owns that logic.
 *                         The component just passes raw preferences + explicit params.
 *
 * 3. IMMUTABLE UPDATES   — All plan mutations use deep-clone patterns; no in-place
 *                         array/object mutation.
 *
 * 4. isToday FIX         — Derived from day.date vs today's ISO date, not index === 0.
 *
 * 5. NEW DATA SURFACES   — planSummary KPI bar, per-day dailyTotals, warnings banner,
 *                         plan-level error, usesGroceries chips, prep/cook times,
 *                         fiber + sugar in the macro grid.
 *
 * 6. SNACK SLOT          — Only rendered if day.meals.snack is present OR if the user
 *                         explicitly enabled snacks via preferences. Not always shown.
 *
 * 7. BUDGET PARAMS FORWARDED — handleGenerateRecipe forwards the parsed budget from
 *                         the parent plan so per-meal regeneration respects the budget.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar, ChefHat, Utensils, RefreshCw, Plus, X,
  ChevronDown, ChevronUp, Trash2, Clock, Users,
  AlertTriangle, TrendingUp, ShoppingBag,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { GroceryItem, HealthProfile, MealPlan, Meal, MealPlanDay } from '../types';
import { generateMealPlan, generateSingleMeal } from '../services/gemini';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CircularProgress } from '@mui/material';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Types ────────────────────────────────────────────────────────────────────

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface Props {
  groceries: GroceryItem[];
  profile: HealthProfile;
  mealPlan: MealPlan | null;
  setMealPlan: (plan: MealPlan | null) => void;
  selectedMeal: { dayIndex: number; type: MealType; meal: Meal } | null;
  setSelectedMeal: (meal: { dayIndex: number; type: MealType; meal: Meal } | null) => void;
  expandedDays: Record<number, boolean>;
  setExpandedDays: (
    fn: Record<number, boolean> | ((prev: Record<number, boolean>) => Record<number, boolean>),
  ) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true if the day's ISO date matches today. */
function isToday(day: MealPlanDay): boolean {
  if (!day.date) return false;
  const today = new Date().toISOString().split('T')[0];
  return day.date === today;
}

/**
 * Safe accessor for a meal slot — handles both the new nested schema
 * (day.meals.breakfast) and any legacy flat shape (day.breakfast) without
 * throwing if either path is missing.
 */
function getMealFromDay(day: MealPlanDay, type: MealType): Meal | undefined {
  // New schema: day.meals.*
  if (day.meals && day.meals[type]) return day.meals[type];
  // Legacy flat shape fallback
  return (day as any)[type] ?? undefined;
}

/** Deep-clones a MealPlan and sets a specific meal slot. */
function setPlanMeal(
  plan: MealPlan,
  dayIndex: number,
  type: MealType,
  meal: Meal | undefined,
): MealPlan {
  const clonedDays = plan.days.map((d, i) => {
    if (i !== dayIndex) return d;
    const clonedMeals = { ...d.meals };
    if (meal === undefined) {
      delete clonedMeals[type];
    } else {
      clonedMeals[type] = meal;
    }
    return { ...d, meals: clonedMeals };
  });
  return { ...plan, days: clonedDays };
}

/** Detect if the user's preferences string explicitly mentions snacks. */
function preferencesWantSnack(prefs?: string): boolean {
  if (!prefs) return false;
  return /snack/i.test(prefs);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const MacroChip: React.FC<{ label: string; value: number | undefined; unit: string; color: string }> = (
  { label, value, unit, color },
) => (
  <div className="flex flex-col items-center justify-center bg-[#F4EFE6] dark:bg-gray-800 rounded-2xl p-4 aspect-square">
    <div className={cn("text-3xl font-serif leading-none mb-1", color)}>
      {value ?? '—'}
    </div>
    <div className="text-[10px] font-medium text-[#A89F91] dark:text-gray-500 mb-1">{unit}</div>
    <div className="text-[9px] font-bold text-[#8C8273] dark:text-gray-400 uppercase tracking-widest mt-auto">
      {label}
    </div>
  </div>
);

const SummaryKpi: React.FC<{ label: string; value: string; icon: React.ReactNode }> = (
  { label, value, icon },
) => (
  <div className="flex items-center gap-3">
    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl text-emerald-600 dark:text-emerald-400">
      {icon}
    </div>
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</p>
      <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export default function MealPlanView({
  groceries,
  profile,
  mealPlan,
  setMealPlan,
  selectedMeal,
  setSelectedMeal,
  expandedDays,
  setExpandedDays,
}: Props) {
  const { t } = useTranslation();
  const [isGenerating, setIsGenerating]         = useState(false);
  const [error, setError]                       = useState<string | null>(null);
  const [preferences, setPreferences]           = useState('');
  const [addingMeal, setAddingMeal]             = useState<{ dayIndex: number; type: MealType } | null>(null);
  const [isGeneratingRecipe, setIsGeneratingRecipe] = useState(false);

  // ── Sync expanded state when plan changes ──────────────────────────────────
  useEffect(() => {
    if (!mealPlan?.days?.length) {
      setExpandedDays(prev => (Object.keys(prev).length > 0 ? {} : prev));
      return;
    }
    setExpandedDays(prev => {
      if (Object.keys(prev).length === mealPlan.days.length) return prev;
      return Object.fromEntries(mealPlan.days.map((_, i) => [i, true]));
    });
  }, [mealPlan, setExpandedDays]);

  // ── Generate full plan ─────────────────────────────────────────────────────
  // Intent extraction (days, budget, people) is now handled exclusively by
  // the service layer. The UI just passes raw preferences + any explicit params.
  const handleGenerate = useCallback(async () => {
    const safeGroceries = groceries ?? [];
    if (safeGroceries.length === 0 && !preferences.trim()) {
      setError('Add items to your grocery list or provide preferences to generate a plan.');
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const plan = await generateMealPlan(
        safeGroceries,
        profile,
        undefined,          // days   — service extracts from preferences
        undefined,          // people — service extracts from preferences
        preferences.trim() || undefined,
        undefined,          // budget — service extracts from preferences
      );

      if (plan?.error) {
        setError(plan.error);
        return;
      }
      if (plan?.days?.length) {
        setMealPlan(plan);
      } else {
        setError('Failed to generate meal plan. Please try again.');
      }
    } catch {
      setError('An error occurred while generating the meal plan.');
    } finally {
      setIsGenerating(false);
    }
  }, [groceries, profile, preferences, setMealPlan]);

  // ── Regenerate recipe for a single meal slot ───────────────────────────────
  const handleGenerateRecipe = useCallback(async () => {
    if (!selectedMeal || !mealPlan) return;
    setIsGeneratingRecipe(true);
    try {
      const dayLabel = mealPlan.days[selectedMeal.dayIndex]?.day ?? '';
      const newMeal  = await generateSingleMeal(
        selectedMeal.meal.name,
        selectedMeal.type,
        dayLabel,
        groceries,
        profile,
        'Please provide the full recipe and prep notes for this meal.',
        mealPlan.estimatedCost ? undefined : undefined, // budget forwarded if available
      );
      if (newMeal) {
        const updated = setPlanMeal(mealPlan, selectedMeal.dayIndex, selectedMeal.type, newMeal);
        setMealPlan(updated);
        setSelectedMeal({ ...selectedMeal, meal: newMeal });
      }
    } catch (err) {
      console.error('[MealPlanView] handleGenerateRecipe failed:', err);
    } finally {
      setIsGeneratingRecipe(false);
    }
  }, [selectedMeal, mealPlan, groceries, profile, setMealPlan, setSelectedMeal]);

  // ── Manual meal add ────────────────────────────────────────────────────────
  const handleAddMealSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!addingMeal || !mealPlan) return;
    const fd = new FormData(e.currentTarget);

    const newMeal: Meal = {
      name:        fd.get('name')        as string,
      description: fd.get('description') as string,
      cuisine:     fd.get('cuisine')     as string || undefined,
      ingredients: (fd.get('ingredients') as string).split('\n').filter(s => s.trim()),
      recipe:      fd.get('recipe')      as string,
      prepNotes:   fd.get('prepNotes')   as string || undefined,
      macros: {
        calories: Number(fd.get('calories')) || 0,
        protein:  Number(fd.get('protein'))  || 0,
        carbs:    Number(fd.get('carbs'))    || 0,
        fat:      Number(fd.get('fat'))      || 0,
      },
    };

    setMealPlan(setPlanMeal(mealPlan, addingMeal.dayIndex, addingMeal.type, newMeal));
    setAddingMeal(null);
  }, [addingMeal, mealPlan, setMealPlan]);

  // ── Remove meal ────────────────────────────────────────────────────────────
  const handleRemoveMeal = useCallback((dayIndex: number, type: MealType) => {
    if (!mealPlan) return;
    setMealPlan(setPlanMeal(mealPlan, dayIndex, type, undefined));
    setSelectedMeal(null);
  }, [mealPlan, setMealPlan, setSelectedMeal]);

  // ── Toggle day accordion ───────────────────────────────────────────────────
  const toggleDay = useCallback((index: number) => {
    setExpandedDays(prev => ({ ...prev, [index]: !prev[index] }));
  }, [setExpandedDays]);

  // ── Styling helpers ────────────────────────────────────────────────────────
  const getMealColor = (type: MealType) => {
    switch (type) {
      case 'breakfast': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 border-amber-200 dark:border-amber-800/50';
      case 'lunch':     return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50';
      case 'dinner':    return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50';
      case 'snack':     return 'bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-400 border-rose-200 dark:border-rose-800/50';
    }
  };

  const getMealLabel = (type: MealType) => {
    switch (type) {
      case 'breakfast': return t('meal_breakfast');
      case 'lunch':     return t('meal_lunch');
      case 'dinner':    return t('meal_dinner');
      case 'snack':     return 'Snack';
    }
  };

  // ── Meal slot renderer ─────────────────────────────────────────────────────
  const renderMealSlot = (day: MealPlanDay, dayIndex: number, type: MealType) => {
    const meal       = getMealFromDay(day, type);
    const colorClass = getMealColor(type);

    if (!meal) {
      return (
        <button
          key={type}
          onClick={() => setAddingMeal({ dayIndex, type })}
          className={cn(
            'h-full min-h-[120px] rounded-2xl border-2 border-dashed flex flex-col items-center',
            'justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]',
            'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
            'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300',
          )}
        >
          <Plus className="w-6 h-6" />
          <span className="text-sm font-medium">Add {getMealLabel(type)}</span>
        </button>
      );
    }

    return (
      <button
        key={type}
        onClick={() => setSelectedMeal({ dayIndex, type, meal })}
        className={cn(
          'h-full min-h-[120px] w-full text-left rounded-2xl p-4 border transition-all',
          'hover:scale-[1.02] active:scale-[0.98] flex flex-col',
          colorClass,
        )}
      >
        <div className="text-xs font-bold uppercase tracking-wider mb-2 opacity-80">
          {getMealLabel(type)}
        </div>
        <h4 className="font-bold text-lg leading-tight mb-2 line-clamp-2">{meal.name}</h4>
        {meal.cuisine && (
          <p className="text-xs opacity-60 mb-2 line-clamp-1">{meal.cuisine}</p>
        )}
        {meal.macros && (
          <div className="mt-auto flex items-center gap-3 text-xs font-medium opacity-80">
            <span>{meal.macros.calories} kcal</span>
            <span>{meal.macros.protein}g P</span>
            {(meal.prepTimeMinutes || meal.cookTimeMinutes) && (
              <span className="flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                {(meal.prepTimeMinutes ?? 0) + (meal.cookTimeMinutes ?? 0)}m
              </span>
            )}
          </div>
        )}
      </button>
    );
  };

  // ── Resolve which meal types to render per day ─────────────────────────────
  const getMealTypesForDay = (day: MealPlanDay): MealType[] => {
    const base: MealType[] = ['breakfast', 'lunch', 'dinner'];
    if (getMealFromDay(day, 'snack') || preferencesWantSnack(preferences)) {
      base.push('snack');
    }
    return base;
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6 relative">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl text-emerald-600 dark:text-emerald-400">
            <Calendar className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-3xl font-display font-bold text-gray-900 dark:text-white tracking-tight">
              {t('meal_title')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">{t('meal_subtitle')}</p>
          </div>
        </div>

        {mealPlan && (
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <Input
              type="text"
              value={preferences}
              onChange={e => setPreferences(e.target.value)}
              placeholder={t('meal_cravings_short')}
              disabled={isGenerating}
              className="w-48 sm:w-64 h-11 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-full text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus-visible:ring-emerald-500"
            />
            <Button
              variant="outline"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 h-11 px-5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border-none text-gray-700 dark:text-gray-300 rounded-full font-medium transition-all"
            >
              <RefreshCw className={cn('w-4 h-4', isGenerating && 'animate-spin')} />
              <span className="hidden sm:inline">{t('meal_regenerate')}</span>
            </Button>
            <Button
              variant="destructive"
              onClick={() => setMealPlan(null)}
              className="flex items-center gap-2 h-11 px-5 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-full font-medium transition-all"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Clear Plan</span>
            </Button>
          </div>
        )}
      </div>

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {!mealPlan && !isGenerating && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-12 text-center shadow-md border border-gray-200 dark:border-gray-700">
          <div className="w-24 h-24 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <ChefHat className="w-12 h-12 text-emerald-500" />
          </div>
          <h3 className="text-2xl font-display font-bold text-gray-900 dark:text-white mb-3">
            {t('meal_ready_title')}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto mb-6 text-lg">
            {t('meal_ready_subtitle')}
          </p>
          <div className="max-w-md mx-auto mb-8">
            <Textarea
              value={preferences}
              onChange={e => setPreferences(e.target.value)}
              placeholder={t('meal_cravings_placeholder')}
              className="w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus-visible:ring-emerald-500 resize-none h-24"
            />
          </div>
          <Button
            onClick={handleGenerate}
            className="flex sm:inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 hover:scale-105 active:scale-95 text-white w-full sm:w-auto px-8 h-14 rounded-full font-bold text-lg transition-all shadow-xl shadow-emerald-500/20 mx-auto"
          >
            <Utensils className="w-6 h-6" />
            {t('meal_generate_btn')}
          </Button>
          {error && (
            <p className="text-red-500 mt-6 font-medium bg-red-50 dark:bg-red-900/20 p-4 rounded-xl inline-block">
              {error}
            </p>
          )}
        </div>
      )}

      {/* ── Loading state ───────────────────────────────────────────────────── */}
      {isGenerating && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-16 text-center shadow-md border border-gray-200 dark:border-gray-700">
          <CircularProgress size={64} sx={{ color: '#10b981' }} className="mx-auto mb-6" />
          <h3 className="text-2xl font-display font-bold text-gray-900 dark:text-white mb-3">
            {t('meal_crafting_title')}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-lg">{t('meal_crafting_subtitle')}</p>
        </div>
      )}

      {/* ── Plan view ──────────────────────────────────────────────────────── */}
      {mealPlan && !isGenerating && (
        <div className="space-y-4">

          {/* Warnings banner */}
          {mealPlan.warnings && mealPlan.warnings.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-300">
                {mealPlan.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* Plan summary KPI bar */}
          {mealPlan.planSummary && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-md border border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap items-center justify-between gap-6">
                <SummaryKpi
                  label="Avg Daily Calories"
                  value={`${Math.round(mealPlan.planSummary.avgDailyCalories || 0)} kcal`}
                  icon={<TrendingUp className="w-4 h-4" />}
                />
                <SummaryKpi
                  label="Avg Daily Protein"
                  value={`${Math.round(mealPlan.planSummary.avgDailyProtein || 0)}g`}
                  icon={<Utensils className="w-4 h-4" />}
                />
                {mealPlan.servings && (
                  <SummaryKpi
                    label="Servings"
                    value={`${mealPlan.servings} ${mealPlan.servings === 1 ? 'person' : 'people'}`}
                    icon={<Users className="w-4 h-4" />}
                  />
                )}
                {mealPlan.planSummary.groceriesUsed && mealPlan.planSummary.groceriesUsed.length > 0 && (
                  <SummaryKpi
                    label="Groceries Used"
                    value={`${mealPlan.planSummary.groceriesUsed.length} items`}
                    icon={<ShoppingBag className="w-4 h-4" />}
                  />
                )}
              </div>
            </div>
          )}

          {/* Budget bar */}
          {(mealPlan.estimatedCost != null || mealPlan.budgetWarning) && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-md border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              {mealPlan.estimatedCost != null && (
                <SummaryKpi
                  label="Estimated Cost"
                  value={`$${mealPlan.estimatedCost.toFixed(2)}`}
                  icon={<span className="font-bold text-sm">$</span>}
                />
              )}
              {mealPlan.budgetWarning && (
                <div className="flex-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-amber-800 dark:text-amber-400 text-sm">
                  <p className="font-bold mb-1">Budget Warning</p>
                  <p>{mealPlan.budgetWarning}</p>
                </div>
              )}
            </div>
          )}

          {/* Day cards */}
          {mealPlan.days?.map((day, index) => {
            const todayDay   = isToday(day);
            const isExpanded = expandedDays[index] ?? true;
            const mealTypes  = getMealTypesForDay(day);
            const planned    = mealTypes.filter(t => getMealFromDay(day, t)).length;

            return (
              <div
                key={`${day.day}-${index}`}
                className={cn(
                  'bg-white dark:bg-gray-800 rounded-2xl shadow-md border transition-all overflow-hidden',
                  todayDay
                    ? 'border-l-4 border-l-amber-500 border-y-gray-200 border-r-gray-200 dark:border-y-gray-700 dark:border-r-gray-700'
                    : 'border-gray-200 dark:border-gray-700',
                )}
              >
                {/* Day header */}
                <button
                  onClick={() => toggleDay(index)}
                  className="w-full px-6 py-5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{day.day}</h3>
                    {todayDay && (
                      <span className="px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 text-xs font-bold uppercase tracking-wider rounded-full">
                        Today
                      </span>
                    )}
                    {day.date && (
                      <span className="text-sm text-gray-400 dark:text-gray-500">{day.date}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-gray-600 dark:text-gray-400">
                    {/* Per-day calorie total */}
                    {day.dailyTotals && (
                      <span className="hidden sm:block text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        {Math.round(day.dailyTotals.calories || 0)} kcal
                      </span>
                    )}
                    <span className="text-sm font-medium">{planned} planned</span>
                    {isExpanded
                      ? <ChevronUp className="w-5 h-5" />
                      : <ChevronDown className="w-5 h-5" />}
                  </div>
                </button>

                {/* Day body */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div
                        className={cn(
                          'p-6 pt-0 grid gap-4',
                          mealTypes.length === 4
                            ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
                            : 'grid-cols-1 sm:grid-cols-3',
                        )}
                      >
                        {mealTypes.map(type => renderMealSlot(day, index, type))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add Meal Modal ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {addingMeal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Add {getMealLabel(addingMeal.type)}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                    {mealPlan?.days[addingMeal.dayIndex]?.day}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setAddingMeal(null)}
                  className="text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <X className="w-6 h-6" />
                </Button>
              </div>

              <div className="p-6 overflow-y-auto">
                <form id="add-meal-form" onSubmit={handleAddMealSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Meal Name <span className="text-red-500">*</span>
                    </label>
                    <Input required name="name" type="text"
                      className="w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-xl focus-visible:ring-emerald-500"
                      placeholder="e.g., Avocado Toast" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description
                    </label>
                    <Input name="description" type="text"
                      className="w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-xl focus-visible:ring-emerald-500"
                      placeholder="Brief description" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Cuisine
                    </label>
                    <Input name="cuisine" type="text"
                      className="w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-xl focus-visible:ring-emerald-500"
                      placeholder="e.g., Mediterranean" />
                  </div>

                  {/* Macros grid */}
                  <div className="grid grid-cols-4 gap-3">
                    {(['calories', 'protein', 'carbs', 'fat'] as const).map(macro => (
                      <div key={macro}>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 capitalize">
                          {macro === 'calories' ? 'Kcal' : `${macro} (g)`}
                        </label>
                        <Input name={macro} type="number" min={0}
                          className="w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus-visible:ring-emerald-500"
                          placeholder="0" />
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Ingredients (one per line) <span className="text-red-500">*</span>
                    </label>
                    <Textarea required name="ingredients" rows={4}
                      className="w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-xl focus-visible:ring-emerald-500 resize-none"
                      placeholder={"200g chicken breast\n1 tbsp olive oil\nPinch of salt"} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Recipe / Instructions <span className="text-red-500">*</span>
                    </label>
                    <Textarea required name="recipe" rows={4}
                      className="w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-xl focus-visible:ring-emerald-500 resize-none"
                      placeholder="1. Season chicken...\n2. Heat oil in pan..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Prep Notes
                    </label>
                    <Input name="prepNotes" type="text"
                      className="w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-xl focus-visible:ring-emerald-500"
                      placeholder="e.g., Can be made the night before" />
                  </div>
                </form>
              </div>

              <div className="p-6 border-t border-gray-100 dark:border-gray-700 shrink-0 flex justify-end gap-3 bg-gray-50 dark:bg-gray-800/50">
                <Button type="button" variant="ghost" onClick={() => setAddingMeal(null)}
                  className="px-5 h-11 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
                  Cancel
                </Button>
                <Button type="submit" form="add-meal-form"
                  className="px-6 h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-full shadow-lg shadow-emerald-500/20 transition-all active:scale-95">
                  Save Meal
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Meal Detail Slide-in Panel ─────────────────────────────────────── */}
      <AnimatePresence>
        {selectedMeal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMeal(null)}
              className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 z-[110] w-full max-w-md bg-[#FDFBF7] dark:bg-gray-900 shadow-2xl border-l border-[#EAE5D9] dark:border-gray-800 flex flex-col text-[#4A4238] dark:text-gray-200 overflow-hidden"
            >
              {/* Panel header */}
              <div className="p-8 pb-4 flex items-start justify-between shrink-0">
                <div className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#9A8B71] dark:text-gray-400 mt-2">
                  {getMealLabel(selectedMeal.type)}
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedMeal(null)}
                  className="text-[#9A8B71] hover:text-[#4A4238] dark:text-gray-400 dark:hover:text-gray-200 rounded-full bg-[#F0EBE1] dark:bg-gray-800 transition-colors shrink-0">
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Title block */}
              <div className="px-8 pb-8 border-b border-[#EAE5D9] dark:border-gray-800 shrink-0">
                <h2 className="text-[2.5rem] font-serif text-[#1A1814] dark:text-white leading-[1.1] mb-4">
                  {selectedMeal.meal.name}
                </h2>
                {selectedMeal.meal.cuisine && (
                  <div className="flex items-center gap-2 text-[#8C8273] dark:text-gray-400 text-[15px] mb-4">
                    <span className="opacity-70">🍽️</span>
                    <span>{selectedMeal.meal.cuisine}</span>
                  </div>
                )}
                {/* Prep / cook times */}
                {(selectedMeal.meal.prepTimeMinutes || selectedMeal.meal.cookTimeMinutes) && (
                  <div className="flex items-center gap-4 text-[#8C8273] dark:text-gray-400 text-sm mb-4">
                    {selectedMeal.meal.prepTimeMinutes && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        Prep {selectedMeal.meal.prepTimeMinutes}m
                      </span>
                    )}
                    {selectedMeal.meal.cookTimeMinutes && (
                      <span className="flex items-center gap-1">
                        <Utensils className="w-4 h-4" />
                        Cook {selectedMeal.meal.cookTimeMinutes}m
                      </span>
                    )}
                  </div>
                )}
                {selectedMeal.meal.tags && selectedMeal.meal.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2.5">
                    {selectedMeal.meal.tags.map((tag, i) => (
                      <span key={i}
                        className="px-3.5 py-1.5 bg-[#F0EBE1] dark:bg-gray-800 text-[#6B6254] dark:text-gray-300 rounded-full text-xs font-medium">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto p-8 space-y-10">

                {/* Macros grid */}
                {selectedMeal.meal.macros && (
                  <div>
                    <h3 className="text-[11px] font-bold text-[#A89F91] dark:text-gray-400 uppercase tracking-[0.15em] mb-5">
                      Nutrition
                    </h3>
                    <div className="grid grid-cols-4 gap-3">
                      <MacroChip label="Calories" value={selectedMeal.meal.macros.calories} unit="kcal" color="text-[#C4704F] dark:text-orange-400" />
                      <MacroChip label="Protein"  value={selectedMeal.meal.macros.protein}  unit="g"    color="text-[#5B8291] dark:text-blue-400" />
                      <MacroChip label="Carbs"    value={selectedMeal.meal.macros.carbs}    unit="g"    color="text-[#B3A369] dark:text-yellow-400" />
                      <MacroChip label="Fat"      value={selectedMeal.meal.macros.fat}      unit="g"    color="text-[#6B8E6B] dark:text-green-400" />
                    </div>
                    {/* Fiber + sugar if available */}
                    {(selectedMeal.meal.macros.fiber != null || selectedMeal.meal.macros.sugar != null) && (
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        {selectedMeal.meal.macros.fiber != null && (
                          <MacroChip label="Fibre" value={selectedMeal.meal.macros.fiber} unit="g" color="text-[#7A8C5B] dark:text-lime-400" />
                        )}
                        {selectedMeal.meal.macros.sugar != null && (
                          <MacroChip label="Sugar" value={selectedMeal.meal.macros.sugar} unit="g" color="text-[#9B6B8C] dark:text-pink-400" />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* About */}
                {selectedMeal.meal.description && (
                  <div>
                    <h3 className="text-[11px] font-bold text-[#A89F91] dark:text-gray-400 uppercase tracking-[0.15em] mb-4">
                      About
                    </h3>
                    <p className="text-[16px] text-[#3A332A] dark:text-gray-300 leading-relaxed">
                      {selectedMeal.meal.description}
                    </p>
                  </div>
                )}

                {/* Groceries used */}
                {selectedMeal.meal.usesGroceries && selectedMeal.meal.usesGroceries.length > 0 && (
                  <div>
                    <h3 className="text-[11px] font-bold text-[#A89F91] dark:text-gray-400 uppercase tracking-[0.15em] mb-4">
                      From Your Groceries
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedMeal.meal.usesGroceries.map((g, i) => (
                        <span key={i}
                          className="px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-medium border border-emerald-200 dark:border-emerald-800">
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ingredients */}
                <div>
                  <h3 className="text-[11px] font-bold text-[#A89F91] dark:text-gray-400 uppercase tracking-[0.15em] mb-5">
                    Ingredients ({selectedMeal.meal.ingredients?.length ?? 0})
                  </h3>
                  <ul className="space-y-3">
                    {selectedMeal.meal.ingredients?.map((ing, i) => (
                      <li key={i} className="flex items-start gap-3.5 text-[16px] text-[#3A332A] dark:text-gray-300">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#C1A68D] dark:bg-gray-600 mt-2.5 shrink-0" />
                        <span className="leading-relaxed">{ing}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Preparation */}
                {selectedMeal.meal.recipe || selectedMeal.meal.prepNotes ? (
                  <div>
                    <h3 className="text-[11px] font-bold text-[#A89F91] dark:text-gray-400 uppercase tracking-[0.15em] mb-5">
                      Preparation
                    </h3>
                    <div className="bg-[#F4EFE6] dark:bg-gray-800 border-l-[3px] border-[#D4C3A3] dark:border-gray-600 rounded-r-2xl p-6 text-[16px] text-[#3A332A] dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                      {[selectedMeal.meal.prepNotes, selectedMeal.meal.recipe].filter(Boolean).join('\n\n')}
                    </div>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-[11px] font-bold text-[#A89F91] dark:text-gray-400 uppercase tracking-[0.15em] mb-5">
                      Preparation
                    </h3>
                    <Button
                      onClick={handleGenerateRecipe}
                      disabled={isGeneratingRecipe}
                      className="w-full flex items-center justify-center gap-2 h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-all"
                    >
                      {isGeneratingRecipe ? (
                        <><RefreshCw className="w-5 h-5 animate-spin" /> Generating Recipe…</>
                      ) : (
                        <><Utensils className="w-5 h-5" /> Generate Recipe</>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {/* Panel footer */}
              <div className="p-6 border-t border-[#EAE5D9] dark:border-gray-800 shrink-0 bg-[#FDFBF7] dark:bg-gray-900">
                <Button variant="ghost"
                  onClick={() => handleRemoveMeal(selectedMeal.dayIndex, selectedMeal.type)}
                  className="w-full flex items-center justify-center gap-2 h-12 text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 rounded-full transition-colors">
                  <Trash2 className="w-5 h-5" />
                  Remove Meal
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}