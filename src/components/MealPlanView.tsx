import React, { useState, useEffect } from 'react';
import { Calendar, ChefHat, Utensils, RefreshCw, Plus, X, ChevronDown, ChevronUp, Trash2, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { GroceryItem, HealthProfile, MealPlan, Meal, MealPlanDay } from '../types';
import { generateMealPlan } from '../services/gemini';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CircularProgress } from '@mui/material';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Textarea } from './ui/textarea';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Props {
  groceries: GroceryItem[];
  profile: HealthProfile;
  mealPlan: MealPlan | null;
  setMealPlan: (plan: MealPlan | null) => void;
  selectedMeal: { dayIndex: number, type: MealType, meal: Meal } | null;
  setSelectedMeal: (meal: { dayIndex: number, type: MealType, meal: Meal } | null) => void;
  expandedDays: Record<number, boolean>;
  setExpandedDays: (expandedDays: Record<number, boolean> | ((prev: Record<number, boolean>) => Record<number, boolean>)) => void;
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export default function MealPlanView({ groceries, profile, mealPlan, setMealPlan, selectedMeal, setSelectedMeal, expandedDays, setExpandedDays }: Props) {
  const { t } = useTranslation();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(7);
  const [budget, setBudget] = useState<string>('');
  const [preferences, setPreferences] = useState<string>('');
  
  const [addingMeal, setAddingMeal] = useState<{ dayIndex: number, type: MealType } | null>(null);

  // Initialize expanded days
  useEffect(() => {
    if (!mealPlan) {
      setExpandedDays(prev => Object.keys(prev).length > 0 ? {} : prev);
    } else {
      setExpandedDays(prev => {
        if (Object.keys(prev).length !== mealPlan.days.length) {
          const initialExpanded: Record<number, boolean> = {};
          mealPlan.days.forEach((_, idx) => {
            initialExpanded[idx] = true;
          });
          return initialExpanded;
        }
        return prev;
      });
    }
  }, [mealPlan, setExpandedDays]);

  const handleGenerate = async () => {
    if (groceries.length === 0 && !preferences.trim()) {
      setError('Please add items to your grocery list or provide some preferences to generate a meal plan.');
      return;
    }

    const parsedBudget = budget ? parseFloat(budget) : undefined;
    if (parsedBudget !== undefined && parsedBudget < 0) {
      setError('Budget cannot be negative.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const plan = await generateMealPlan(groceries, profile, days, parsedBudget, undefined, preferences.trim() || undefined);
      if (plan) {
        setMealPlan(plan);
      } else {
        setError('Failed to generate meal plan. Please try again.');
      }
    } catch (err) {
      setError('An error occurred while generating the meal plan.');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleDay = (index: number) => {
    setExpandedDays(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleAddMealSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!addingMeal || !mealPlan) return;

    const formData = new FormData(e.currentTarget);
    const newMeal: Meal = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      ingredients: (formData.get('ingredients') as string).split('\n').filter(i => i.trim()),
      recipe: formData.get('recipe') as string,
      prepNotes: formData.get('prepNotes') as string,
      macros: {
        calories: Number(formData.get('calories')) || 0,
        protein: Number(formData.get('protein')) || 0,
        carbs: Number(formData.get('carbs')) || 0,
        fat: Number(formData.get('fat')) || 0,
      }
    };

    const updatedPlan = { ...mealPlan };
    updatedPlan.days[addingMeal.dayIndex][addingMeal.type] = newMeal;
    setMealPlan(updatedPlan);
    setAddingMeal(null);
  };

  const handleRemoveMeal = (dayIndex: number, type: MealType) => {
    if (!mealPlan) return;
    const updatedPlan = { ...mealPlan };
    delete updatedPlan.days[dayIndex][type];
    setMealPlan(updatedPlan);
    setSelectedMeal(null);
  };

  const getMealColor = (type: MealType) => {
    switch (type) {
      case 'breakfast': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 border-amber-200 dark:border-amber-800/50';
      case 'lunch': return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50';
      case 'dinner': return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50';
      case 'snack': return 'bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-400 border-rose-200 dark:border-rose-800/50';
    }
  };

  const getMealLabel = (type: MealType) => {
    switch (type) {
      case 'breakfast': return t('meal_breakfast');
      case 'lunch': return t('meal_lunch');
      case 'dinner': return t('meal_dinner');
      case 'snack': return 'Snack';
    }
  };

  const renderMealSlot = (day: MealPlanDay, dayIndex: number, type: MealType) => {
    const meal = day[type];
    const colorClass = getMealColor(type);

    if (!meal) {
      return (
        <button
          onClick={() => setAddingMeal({ dayIndex, type })}
          className={cn(
            "h-full min-h-[120px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]",
            "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300"
          )}
        >
          <Plus className="w-6 h-6" />
          <span className="text-sm font-medium">Add {getMealLabel(type)}</span>
        </button>
      );
    }

    return (
      <button
        onClick={() => setSelectedMeal({ dayIndex, type, meal })}
        className={cn(
          "h-full min-h-[120px] w-full text-left rounded-2xl p-4 border transition-all hover:scale-[1.02] active:scale-[0.98] flex flex-col",
          colorClass
        )}
      >
        <div className="text-xs font-bold uppercase tracking-wider mb-2 opacity-80">
          {getMealLabel(type)}
        </div>
        <h4 className="font-bold text-lg leading-tight mb-2 line-clamp-2">{meal.name}</h4>
        {meal.macros && (
          <div className="mt-auto flex items-center gap-3 text-xs font-medium opacity-80">
            <span>{meal.macros.calories} kcal</span>
            <span>{meal.macros.protein}g P</span>
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6 relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl text-emerald-600 dark:text-emerald-400">
            <Calendar className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-3xl font-display font-bold text-gray-900 dark:text-white tracking-tight">{t('meal_title')}</h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">{t('meal_subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {mealPlan && (
            <Input
              type="text"
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              placeholder="Any specific cravings?"
              disabled={isGenerating}
              className="w-48 sm:w-64 h-11 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-full text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus-visible:ring-emerald-500"
            />
          )}
          <Select
            value={days}
            onChange={(val) => setDays(Number(val))}
            disabled={isGenerating}
            options={[1, 2, 3, 4, 5, 6, 7].map(d => ({ value: d, label: `${d} ${t('meal_days')}` }))}
            className="w-32"
          />
          {mealPlan && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="flex items-center gap-2 h-11 px-5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border-none text-gray-700 dark:text-gray-300 rounded-full font-medium transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
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
      </div>

      {!mealPlan && !isGenerating && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-12 text-center shadow-md border border-gray-200 dark:border-gray-700">
          <div className="w-24 h-24 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <ChefHat className="w-12 h-12 text-emerald-500" />
          </div>
          <h3 className="text-2xl font-display font-bold text-gray-900 dark:text-white mb-3">{t('meal_ready_title')}</h3>
          <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto mb-6 text-lg">
            {t('meal_ready_subtitle')}
          </p>
          
          <div className="max-w-md mx-auto mb-8 space-y-4">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="Optional budget (e.g. 150)"
              className="w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus-visible:ring-emerald-500"
            />
            <Textarea
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              placeholder="Any specific cravings or dietary requests? (e.g., 'I want lots of pasta', 'Low carb dinners only')"
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
          {error && <p className="text-red-500 mt-6 font-medium bg-red-50 dark:bg-red-900/20 p-4 rounded-xl inline-block">{error}</p>}
        </div>
      )}

      {isGenerating && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-16 text-center shadow-md border border-gray-200 dark:border-gray-700">
          <CircularProgress size={64} sx={{ color: '#10b981' }} className="mx-auto mb-6" />
          <h3 className="text-2xl font-display font-bold text-gray-900 dark:text-white mb-3">{t('meal_crafting_title')}</h3>
          <p className="text-gray-600 dark:text-gray-400 text-lg">{t('meal_crafting_subtitle')}</p>
        </div>
      )}

      {mealPlan && !isGenerating && (
        <div className="space-y-4">
          {(mealPlan.estimatedCost || mealPlan.budgetWarning) && (
            <div className={cn(
              "p-4 rounded-2xl mb-6 flex items-start gap-3",
              mealPlan.budgetWarning 
                ? "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800/30" 
                : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/30"
            )}>
              <Info className={cn("w-5 h-5 shrink-0 mt-0.5", mealPlan.budgetWarning ? "text-red-500" : "text-emerald-500")} />
              <div>
                {mealPlan.estimatedCost && (
                  <p className="font-bold text-lg mb-1">Estimated Cost: ${mealPlan.estimatedCost.toFixed(2)}</p>
                )}
                {mealPlan.budgetWarning && (
                  <p className="text-sm leading-relaxed">{mealPlan.budgetWarning}</p>
                )}
              </div>
            </div>
          )}
          {mealPlan.days?.map((day, index) => {
            const isToday = index === 0; // Assuming first day is today for this example
            const isExpanded = expandedDays[index];

            return (
              <div 
                key={index} 
                className={cn(
                  "bg-white dark:bg-gray-800 rounded-2xl shadow-md border transition-all overflow-hidden",
                  isToday ? "border-l-4 border-l-amber-500 border-y-gray-200 border-r-gray-200 dark:border-y-gray-700 dark:border-r-gray-700" : "border-gray-200 dark:border-gray-700"
                )}
              >
                <button 
                  onClick={() => toggleDay(index)}
                  className="w-full px-6 py-5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                      {day.day}
                    </h3>
                    {isToday && (
                      <span className="px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 text-xs font-bold uppercase tracking-wider rounded-full">
                        Today
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-gray-600 dark:text-gray-400">
                    <span className="text-sm font-medium">
                      {[day.breakfast, day.lunch, day.dinner, day.snack].filter(Boolean).length}/4 meals
                    </span>
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </button>
                
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-6 pt-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {renderMealSlot(day, index, 'breakfast')}
                        {renderMealSlot(day, index, 'lunch')}
                        {renderMealSlot(day, index, 'dinner')}
                        {renderMealSlot(day, index, 'snack')}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Meal Modal */}
      <AnimatePresence>
        {addingMeal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Add {getMealLabel(addingMeal.type)}</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{mealPlan?.days[addingMeal.dayIndex].day}</p>
                </div>
                <Button 
                  variant="ghost"
                  size="icon"
                  onClick={() => setAddingMeal(null)}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <X className="w-6 h-6" />
                </Button>
              </div>
              
              <div className="p-6 overflow-y-auto">
                <form id="add-meal-form" onSubmit={handleAddMealSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meal Name</label>
                    <Input required name="name" type="text" className="w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-xl focus-visible:ring-emerald-500" placeholder="e.g., Avocado Toast" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (Optional)</label>
                    <Input name="description" type="text" className="w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-xl focus-visible:ring-emerald-500" placeholder="Brief description" />
                  </div>
                  
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Calories</label>
                      <Input name="calories" type="number" className="w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus-visible:ring-emerald-500" placeholder="kcal" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Protein (g)</label>
                      <Input name="protein" type="number" className="w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus-visible:ring-emerald-500" placeholder="g" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Carbs (g)</label>
                      <Input name="carbs" type="number" className="w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus-visible:ring-emerald-500" placeholder="g" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Fat (g)</label>
                      <Input name="fat" type="number" className="w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus-visible:ring-emerald-500" placeholder="g" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ingredients (One per line)</label>
                    <Textarea required name="ingredients" rows={4} className="w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-xl focus-visible:ring-emerald-500 resize-none" placeholder="2 slices whole wheat bread&#10;1 avocado&#10;Pinch of salt" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Recipe / Instructions</label>
                    <Textarea required name="recipe" rows={4} className="w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-xl focus-visible:ring-emerald-500 resize-none" placeholder="Toast bread, mash avocado..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prep Notes (Optional)</label>
                    <Input name="prepNotes" type="text" className="w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-xl focus-visible:ring-emerald-500" placeholder="e.g., Can be made the night before" />
                  </div>
                </form>
              </div>
              
              <div className="p-6 border-t border-gray-100 dark:border-gray-700 shrink-0 flex justify-end gap-3 bg-gray-50 dark:bg-gray-800/50">
                <Button 
                  type="button"
                  variant="ghost"
                  onClick={() => setAddingMeal(null)}
                  className="px-5 h-11 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  form="add-meal-form"
                  className="px-6 h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-full shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                >
                  Save Meal
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Meal Detail Slide-in Panel */}
      <AnimatePresence>
        {selectedMeal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMeal(null)}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#FDFBF7] dark:bg-gray-900 shadow-2xl border-l border-[#EAE5D9] dark:border-gray-800 flex flex-col text-[#4A4238] dark:text-gray-200 overflow-hidden"
            >
              <div className="p-8 pb-4 flex items-start justify-between shrink-0">
                <div className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#9A8B71] dark:text-gray-400 mt-2">
                  {getMealLabel(selectedMeal.type)}
                </div>
                <Button 
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedMeal(null)}
                  className="text-[#9A8B71] hover:text-[#4A4238] dark:text-gray-400 dark:hover:text-gray-200 rounded-full bg-[#F0EBE1] dark:bg-gray-800 transition-colors shrink-0"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="px-8 pb-8 border-b border-[#EAE5D9] dark:border-gray-800 shrink-0">
                <h2 className="text-[2.5rem] font-serif text-[#1A1814] dark:text-white leading-[1.1] mb-4">{selectedMeal.meal.name}</h2>
                
                {selectedMeal.meal.cuisine && (
                  <div className="flex items-center gap-2 text-[#8C8273] dark:text-gray-400 text-[15px] mb-5">
                    <span className="opacity-70">🍽️</span>
                    <span>{selectedMeal.meal.cuisine}</span>
                  </div>
                )}

                {selectedMeal.meal.tags && selectedMeal.meal.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2.5">
                    {selectedMeal.meal.tags.map((tag, i) => (
                      <span key={i} className="px-3.5 py-1.5 bg-[#F0EBE1] dark:bg-gray-800 text-[#6B6254] dark:text-gray-300 rounded-full text-xs font-medium">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-10">
                {/* Macros */}
                {selectedMeal.meal.macros && (
                  <div>
                    <h3 className="text-[11px] font-bold text-[#A89F91] dark:text-gray-400 uppercase tracking-[0.15em] mb-5">Nutrition</h3>
                    <div className="grid grid-cols-4 gap-3">
                      <div className="bg-[#F4EFE6] dark:bg-gray-800 p-4 rounded-2xl text-center flex flex-col items-center justify-center aspect-square">
                        <div className="text-3xl font-serif text-[#C4704F] dark:text-orange-400 leading-none mb-1">{selectedMeal.meal.macros.calories}</div>
                        <div className="text-[10px] font-medium text-[#A89F91] dark:text-gray-500 mb-1">kcal</div>
                        <div className="text-[9px] font-bold text-[#8C8273] dark:text-gray-400 uppercase tracking-widest mt-auto">Calories</div>
                      </div>
                      <div className="bg-[#F4EFE6] dark:bg-gray-800 p-4 rounded-2xl text-center flex flex-col items-center justify-center aspect-square">
                        <div className="text-3xl font-serif text-[#5B8291] dark:text-blue-400 leading-none mb-1">{selectedMeal.meal.macros.protein}</div>
                        <div className="text-[10px] font-medium text-[#A89F91] dark:text-gray-500 mb-1">g</div>
                        <div className="text-[9px] font-bold text-[#8C8273] dark:text-gray-400 uppercase tracking-widest mt-auto">Protein</div>
                      </div>
                      <div className="bg-[#F4EFE6] dark:bg-gray-800 p-4 rounded-2xl text-center flex flex-col items-center justify-center aspect-square">
                        <div className="text-3xl font-serif text-[#B3A369] dark:text-yellow-400 leading-none mb-1">{selectedMeal.meal.macros.carbs}</div>
                        <div className="text-[10px] font-medium text-[#A89F91] dark:text-gray-500 mb-1">g</div>
                        <div className="text-[9px] font-bold text-[#8C8273] dark:text-gray-400 uppercase tracking-widest mt-auto">Carbs</div>
                      </div>
                      <div className="bg-[#F4EFE6] dark:bg-gray-800 p-4 rounded-2xl text-center flex flex-col items-center justify-center aspect-square">
                        <div className="text-3xl font-serif text-[#6B8E6B] dark:text-green-400 leading-none mb-1">{selectedMeal.meal.macros.fat}</div>
                        <div className="text-[10px] font-medium text-[#A89F91] dark:text-gray-500 mb-1">g</div>
                        <div className="text-[9px] font-bold text-[#8C8273] dark:text-gray-400 uppercase tracking-widest mt-auto">Fat</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* About */}
                {selectedMeal.meal.description && (
                  <div>
                    <h3 className="text-[11px] font-bold text-[#A89F91] dark:text-gray-400 uppercase tracking-[0.15em] mb-4">About</h3>
                    <p className="text-[16px] text-[#3A332A] dark:text-gray-300 leading-relaxed">
                      {selectedMeal.meal.description}
                    </p>
                  </div>
                )}

                {/* Ingredients */}
                <div>
                  <h3 className="text-[11px] font-bold text-[#A89F91] dark:text-gray-400 uppercase tracking-[0.15em] mb-5">
                    Ingredients ({selectedMeal.meal.ingredients?.length || 0})
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
                {(selectedMeal.meal.recipe || selectedMeal.meal.prepNotes) && (
                  <div>
                    <h3 className="text-[11px] font-bold text-[#A89F91] dark:text-gray-400 uppercase tracking-[0.15em] mb-5">Preparation</h3>
                    <div className="bg-[#F4EFE6] dark:bg-gray-800 border-l-[3px] border-[#D4C3A3] dark:border-gray-600 rounded-r-2xl p-6 text-[16px] text-[#3A332A] dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                      {selectedMeal.meal.prepNotes ? `${selectedMeal.meal.prepNotes}\n\n${selectedMeal.meal.recipe}` : selectedMeal.meal.recipe}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-[#EAE5D9] dark:border-gray-800 shrink-0 bg-[#FDFBF7] dark:bg-gray-900">
                <Button
                  variant="ghost"
                  onClick={() => handleRemoveMeal(selectedMeal.dayIndex, selectedMeal.type)}
                  className="w-full flex items-center justify-center gap-2 h-12 text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 rounded-full transition-colors"
                >
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
