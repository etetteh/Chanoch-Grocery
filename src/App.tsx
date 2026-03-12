import React, { useState, useEffect } from 'react';
import { Search, ShoppingCart, Mic, Plus, Trash2, CheckCircle2, Circle, Store, Loader2, X, ChevronRight, ChevronDown, Tag, MapPin, ExternalLink, RefreshCw, Moon, Sun, Share2, Camera, User, Heart, Calendar, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTranslation } from 'react-i18next';
import { debounce } from 'lodash';
import { searchSales, generateMealPlan, filterStoresByLocation } from './services/gemini';
import { SaleItem, GroceryItem, Tab, HealthProfile, MealPlan } from './types';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { SpeedDial } from './components/ui/speed-dial';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import CircularProgress from '@mui/material/CircularProgress';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function formatDate(dateString?: string) {
  if (!dateString) return '';
  try {
    if (dateString.includes('T')) {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
      }).format(date);
    }
    return dateString;
  } catch (e) {
    return dateString;
  }
}

import LiveAssistant from './components/LiveAssistant';
import HealthProfileView from './components/HealthProfileView';
import ScannerView from './components/ScannerView';
import MealPlanView from './components/MealPlanView';
import Carousel from './components/Carousel';

export default function App() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('search');
  const [startWithVideo, setStartWithVideo] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dark-mode');
      if (saved !== null) {
        return saved === 'true';
      }
      return true;
    }
    return true;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('dark-mode', darkMode.toString());
  }, [darkMode]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState<string | undefined>();
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [postalCode, setPostalCode] = useState(() => localStorage.getItem('user-postal-code') || '');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [saleResults, setSaleResults] = useState<SaleItem[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [groceryList, setGroceryList] = useState<GroceryItem[]>(() => {
    const saved = localStorage.getItem('toronto-grocery-list');
    if (!saved) return [];
    try {
      const items = JSON.parse(saved);
      return items.map((item: any) => ({
        ...item,
        quantity: (typeof item.quantity === 'number' && !isNaN(item.quantity)) ? item.quantity : 1
      }));
    } catch (e) {
      return [];
    }
  });

  const [showToast, setShowToast] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isLiveAssistantOpen, setIsLiveAssistantOpen] = useState(false);
  const [isLocationExpanded, setIsLocationExpanded] = useState(false);

  const [healthProfile, setHealthProfile] = useState<HealthProfile>(() => {
    const saved = localStorage.getItem('toronto-health-profile');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.dietType && !parsed.dietTypes) {
          parsed.dietTypes = [parsed.dietType];
          delete parsed.dietType;
        }
        return parsed;
      } catch (e) {
        // ignore
      }
    }
    return {
      dietTypes: [],
      allergies: [],
      goals: [],
      dislikedIngredients: []
    };
  });

  const [mealPlan, setMealPlan] = useState<MealPlan | null>(() => {
    const saved = localStorage.getItem('toronto-meal-plan');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return null;
  });

  const [selectedMeal, setSelectedMeal] = useState<{ dayIndex: number, type: 'breakfast' | 'lunch' | 'dinner' | 'snack', meal: any } | null>(null);
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({});

  useEffect(() => {
    localStorage.setItem('toronto-health-profile', JSON.stringify(healthProfile));
  }, [healthProfile]);

  useEffect(() => {
    if (mealPlan) {
      localStorage.setItem('toronto-meal-plan', JSON.stringify(mealPlan));
    } else {
      localStorage.removeItem('toronto-meal-plan');
    }
  }, [mealPlan]);

  const [hasApiKey, setHasApiKey] = useState(true);
  const [isCheckingKey, setIsCheckingKey] = useState(true);

  useEffect(() => {
    const checkApiKey = async () => {
      try {
        if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          setHasApiKey(hasKey);
        }
      } catch (e) {
        console.error("Error checking API key:", e);
      } finally {
        setIsCheckingKey(false);
      }
    };
    checkApiKey();
  }, []);

  const handleConnectKey = async () => {
    try {
      if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
        await window.aistudio.openSelectKey();
        setHasApiKey(true);
      }
    } catch (e) {
      console.error("Error opening key selector:", e);
    }
  };

  const [showInfo, setShowInfo] = useState(false);
  const [scanTrigger, setScanTrigger] = useState(0);

  const storeData = [
    // US & Global
    { name: 'Target', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://target.com&size=128' },
    { name: 'Kroger', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://kroger.com&size=128' },
    { name: 'Aldi', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://aldi.us&size=128' },
    { name: 'Trader Joe\'s', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://traderjoes.com&size=128' },
    { name: 'Tesco', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://tesco.com&size=128' },
    { name: 'Sainsbury\'s', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://sainsburys.co.uk&size=128' },
    { name: 'Asda', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://asda.com&size=128' },
    { name: 'Carrefour', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://carrefour.com&size=128' },
    { name: 'Woolworths', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://woolworths.com.au&size=128' },
    { name: 'Coles', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://coles.com.au&size=128' },
    
    // Canada
    { name: 'Loblaws', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://loblaws.ca&size=128' },
    { name: 'No Frills', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://nofrills.ca&size=128' },
    { name: 'Metro', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://metro.ca&size=128' },
    { name: 'Sobeys', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://sobeys.com&size=128' },
    { name: 'FreshCo', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://freshco.com&size=128' },
    { name: 'Walmart', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://walmart.ca&size=128' },
    { name: 'Food Basics', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://foodbasics.ca&size=128' },
    { name: 'Super C', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://superc.ca&size=128' },
    { name: 'Maxi', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://maxi.ca&size=128' },
    { name: 'Provigo', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://provigo.ca&size=128' },
    { name: 'IGA', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://iga.net&size=128' },
    { name: 'Save-On-Foods', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://saveonfoods.com&size=128' },
    { name: 'Safeway', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://safeway.ca&size=128' },
    { name: 'Longo\'s', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://longos.com&size=128' },
    { name: 'Farm Boy', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://farmboy.ca&size=128' },
    { name: 'Costco', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://costco.ca&size=128' },
    { name: 'Giant Tiger', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://gianttiger.com&size=128' },
    { name: 'Adonis', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://adonis.ca&size=128' },
    { name: 'T&T', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://tntsupermarket.com&size=128' },
    { name: 'Shoppers Drug Mart', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://shoppersdrugmart.ca&size=128' },
    { name: 'Whole Foods', logo: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://wholefoodsmarket.com&size=128' }
  ];
  const categories = [
    'Produce', 'Meat', 'Dairy', 'Bakery', 'Pantry', 'Frozen', 
    'Seafood', 'Deli', 'Beverages', 'Personal Care', 'Household', 
    'Pet', 'Baby', 'International', 'Health'
  ];

  const [filteredStores, setFilteredStores] = useState(storeData);
  const [isFilteringStores, setIsFilteringStores] = useState(false);

  useEffect(() => {
    const filterStores = async () => {
      if (!userLocation && !postalCode) {
        setFilteredStores(storeData);
        return;
      }
      setIsFilteringStores(true);
      try {
        const stores = await filterStoresByLocation(storeData, userLocation?.lat, userLocation?.lng, postalCode);
        setFilteredStores(stores);
      } catch (e) {
        console.error("Error filtering stores:", e);
        setFilteredStores(storeData);
      } finally {
        setIsFilteringStores(false);
      }
    };
    
    // Use a timeout to avoid spamming the API if location updates rapidly
    const timeoutId = setTimeout(() => {
      filterStores();
    }, 1000);
    
    return () => clearTimeout(timeoutId);
  }, [userLocation, postalCode]);

  useEffect(() => {
    localStorage.setItem('toronto-grocery-list', JSON.stringify(groceryList));
  }, [groceryList]);

  const refreshLocation = () => {
    if (!("geolocation" in navigator)) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        setIsLocating(false);
      },
      (error) => {
        console.error("Location error details:", {
          code: error.code,
          message: error.message
        });
        let message = "Unable to retrieve your location.";
        if (error.code === error.PERMISSION_DENIED) {
          message = "Location access denied. Please enable it in your browser settings or enter a postal/zip code below.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = "Location information is unavailable. Try entering a postal/zip code manually.";
        } else if (error.code === error.TIMEOUT) {
          message = "Location request timed out. Please try again or use a postal/zip code.";
        }
        setLocationError(message);
        setIsLocating(false);
      },
      {
        enableHighAccuracy: false, // More reliable in some environments
        timeout: 10000,
        maximumAge: 300000 // 5 minutes cache
      }
    );
  };

  useEffect(() => {
    refreshLocation();
  }, []);

  const handleSearch = async (e?: React.FormEvent, overrideQuery?: string, overrideStore?: string, overrideCat?: string, overridePostal?: string) => {
    e?.preventDefault();
    const query = (overrideQuery ?? searchQuery).trim();
    const store = overrideStore ?? selectedStore;
    const cat = overrideCat ?? selectedCategory;
    const pc = overridePostal ?? postalCode;
    
    if (!query && !store && !cat) return;
    
    setIsSearching(true);
    setSearchError(null);
    try {
      const results = await searchSales(query, store, cat, userLocation?.lat, userLocation?.lng, userLocation?.accuracy, pc);
      if (results.length === 0 && query) {
        setSearchError("No deals found for this search. Try a different item or store.");
      }
      setSaleResults(results);
    } catch (error) {
      console.error("Search failed:", error);
      setSearchError("Something went wrong while searching for deals. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced version for filter changes
  const debouncedSearch = React.useMemo(
    () => debounce((q, s, c, p) => handleSearch(undefined, q, s, c, p), 500),
    [userLocation, postalCode]
  );

  const addToList = (item: SaleItem | { name: string; category: string; store?: string; price?: string; originalPrice?: string; validFrom?: string; validUntil?: string; address?: string; mapsUri?: string; quantity?: number; distance?: string; unit?: string }) => {
    const newItem: GroceryItem = {
      id: Math.random().toString(36).substr(2, 9),
      name: item.name || 'Unknown Item',
      price: item.price,
      originalPrice: item.originalPrice,
      validFrom: item.validFrom,
      validUntil: item.validUntil,
      store: item.store,
      category: item.category || 'General',
      address: item.address,
      distance: item.distance,
      mapsUri: item.mapsUri,
      quantity: ('quantity' in item && typeof item.quantity === 'number') ? item.quantity : 1,
      unit: item.unit,
      completed: false,
      selected: false,
    };
    setGroceryList(prev => [newItem, ...prev]);
  };

  const toggleComplete = (id: string) => {
    setGroceryList(prev => prev.map(item => 
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
  };

  const toggleSelect = (id: string) => {
    setGroceryList(prev => prev.map(item => 
      item.id === id ? { ...item, selected: !item.selected } : item
    ));
  };

  const removeItem = (id: string) => {
    setGroceryList(prev => prev.filter(item => item.id !== id));
  };

  const removeFromListByName = (name: string) => {
    const search = name.toLowerCase()
      .replace(/^(remove|delete|take off|get rid of|the|a|an)\s+/g, '')
      .trim();
    
    if (!search) return;

    setGroceryList(prev => {
      let index = prev.findIndex(item => (item.name || '').toLowerCase() === search);
      if (index === -1) {
        index = prev.findIndex(item => {
          const itemName = (item.name || '').toLowerCase();
          return itemName.includes(search) || search.includes(itemName);
        });
      }
      if (index === -1) {
        const searchWords = search.split(/\s+/).filter(w => w.length > 2);
        if (searchWords.length > 0) {
          index = prev.findIndex(item => {
            const itemName = (item.name || '').toLowerCase();
            return searchWords.some(word => itemName.includes(word));
          });
        }
      }
      
      if (index !== -1) {
        const newList = [...prev];
        newList.splice(index, 1);
        return newList;
      }
      return prev;
    });
  };

  const updateItemInList = (originalName: string, updates: { name?: string, quantity?: number, store?: string, price?: string }) => {
    const search = originalName.toLowerCase()
      .replace(/^(update|change|modify|edit|the|a|an)\s+/g, '')
      .trim();
    
    if (!search) return;

    setGroceryList(prev => {
      let index = prev.findIndex(item => (item.name || '').toLowerCase() === search);
      if (index === -1) {
        index = prev.findIndex(item => {
          const itemName = (item.name || '').toLowerCase();
          return itemName.includes(search) || search.includes(itemName);
        });
      }
      if (index === -1) {
        const searchWords = search.split(/\s+/).filter(w => w.length > 2);
        if (searchWords.length > 0) {
          index = prev.findIndex(item => {
            const itemName = (item.name || '').toLowerCase();
            return searchWords.some(word => itemName.includes(word));
          });
        }
      }

      if (index !== -1) {
        const newList = [...prev];
        const item = newList[index];
        newList[index] = { 
          ...item, 
          ...updates,
          quantity: updates.quantity !== undefined ? Number(updates.quantity) : item.quantity
        };
        return newList;
      }
      return prev;
    });
  };

  const clearGroceryList = () => {
    setGroceryList([]);
  };

  const updateQuantity = (id: string, delta: number) => {
    setGroceryList(prev => prev.map(item => {
      if (item.id === id) {
        const currentQty = (typeof item.quantity === 'number' && !isNaN(item.quantity)) ? item.quantity : 1;
        const newQuantity = Math.max(1, currentQty + delta);
        return { ...item, quantity: newQuantity };
      }
      return item;
    }));
  };

  const handleShare = async () => {
    const listText = groceryList
      .map(i => `${i.completed ? '[x]' : '[ ]'} ${i.quantity || 1}x ${i.name} (${i.price || 'N/A'}) @ ${i.store || 'Unknown'}`)
      .join('\n');
    
    const fullText = `Chanoch Shopping List:\n\n${listText}\n\nEstimated Total: $${totalEstimated.toFixed(2)}`;
    
    try {
      if (navigator.share && window.isSecureContext) {
        await navigator.share({
          title: 'Chanoch Shopping List',
          text: fullText,
        });
      } else if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(fullText);
      }
      
      if (!navigator.share) {
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      }
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const clearList = () => {
    setGroceryList([]);
    setShowClearConfirm(false);
  };

  // Group items by name (simple grouping for comparison)
  const salesGrouped = saleResults.filter(item => item.isOnSale).reduce((acc, item) => {
    const key = (item.name || 'Unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, SaleItem[]>);

  const regularGrouped = saleResults.filter(item => !item.isOnSale).reduce((acc, item) => {
    const key = (item.name || 'Unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, SaleItem[]>);

  const parsePrice = (priceStr: string) => {
    const match = priceStr.match(/(\d+\.?\d*)/);
    if (!match) return 0;
    const val = parseFloat(match[1]);
    return isNaN(val) ? 0 : val;
  };

  // Group shopping list by store for better UX
  const listByStore = groceryList.reduce((acc, item) => {
    const store = item.store || 'Uncategorized';
    if (!acc[store]) acc[store] = [];
    acc[store].push(item);
    return acc;
  }, {} as Record<string, GroceryItem[]>);

  const totalEstimated = groceryList.reduce((sum, item) => {
    if (item.completed) return sum;
    const price = item.price ? parsePrice(item.price) : 0;
    const qty = (typeof item.quantity === 'number' && !isNaN(item.quantity)) ? item.quantity : 1;
    const itemTotal = price * qty;
    return sum + itemTotal;
  }, 0);

  const selectedTotal = groceryList.reduce((sum, item) => {
    if (!item.selected) return sum;
    const price = item.price ? parsePrice(item.price) : 0;
    const qty = (typeof item.quantity === 'number' && !isNaN(item.quantity)) ? item.quantity : 1;
    const itemTotal = price * qty;
    return sum + itemTotal;
  }, 0);

  const selectedCount = groceryList.filter(i => i.selected).length;

  if (isCheckingKey) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-[#020617] flex items-center justify-center">
        <CircularProgress size={40} sx={{ color: '#22c55e' }} />
      </div>
    );
  }

  if (!hasApiKey && !isCheckingKey) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-[#020617] text-slate-900 dark:text-slate-100 font-sans flex items-center justify-center p-6">
        <div className="max-w-md w-full glass p-8 rounded-3xl border border-slate-200 dark:border-white/10 text-center shadow-2xl">
          <div className="w-20 h-20 brand-gradient rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-brand-500/30">
            <Key size={36} className="text-white" />
          </div>
          <h1 className="font-display font-bold text-3xl mb-4 text-gradient">Connect Your Account</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
            To use this application, you need to connect your Google Cloud account with a valid Gemini API key.
          </p>
          <button
            onClick={handleConnectKey}
            className="w-full brand-gradient text-white font-semibold py-4 px-6 rounded-2xl shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Key size={20} />
            Connect Google Cloud Account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-[#020617] text-slate-900 dark:text-slate-100 font-sans selection:bg-brand-100 selection:text-brand-900 relative overflow-hidden">
      {/* Immersive Background */}
      <div className="fixed inset-0 atmosphere pointer-events-none z-0" />
      
      {/* Header */}
      <header className="glass sticky top-0 z-30 transition-all duration-500 border-b border-slate-200 dark:border-white/5">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.div 
              whileHover={{ rotate: 10, scale: 1.1 }}
              className="w-12 h-12 brand-gradient rounded-full flex items-center justify-center text-white shadow-xl shadow-brand-500/30"
            >
              <ShoppingCart size={26} strokeWidth={2.5} />
            </motion.div>
            <div>
              <h1 className="font-display font-bold text-2xl tracking-tight leading-none text-gradient">{t('app_name')}</h1>
              <div className="flex items-center gap-1.5 mt-1.5">
                <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse" />
                <p className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase tracking-[0.2em]">{t('app_subtitle')}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SpeedDial
              direction="down"
              align="center"
              mainIcon={<span className="text-xs font-bold uppercase">{i18n.language.split('-')[0]}</span>}
              activeIcon={<X size={20} />}
              buttonClassName="w-11 h-11 glass rounded-full transition-all text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 !bg-transparent !shadow-none border border-slate-300 dark:border-white/10"
              actionClassName="px-4 py-2 text-xs"
              actions={[
                { code: 'en', label: 'English' },
                { code: 'zh', label: '中文' },
                { code: 'es', label: 'Español' },
                { code: 'fr', label: 'Français' },
                { code: 'pt', label: 'Português' },
                { code: 'hi', label: 'हिन्दी' },
                { code: 'ar', label: 'العربية' },
                { code: 'pnb', label: 'پنجابی' }
              ].map(lang => ({
                name: lang.label,
                icon: <span className="text-xs font-bold uppercase">{lang.code}</span>,
                active: i18n.language.startsWith(lang.code),
                onClick: () => i18n.changeLanguage(lang.code)
              }))}
            />
            <div className="flex items-center gap-3">
              <motion.button 
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.1 }}
                onClick={() => setDarkMode(!darkMode)}
                aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
                className="w-11 h-11 flex items-center justify-center glass rounded-full transition-all text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 border border-slate-300 dark:border-white/10 focus:ring-2 focus:ring-brand-500 outline-none"
              >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </motion.button>
              <motion.button 
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.1 }}
                onClick={() => setShowInfo(true)}
                aria-label="About this app"
                className="w-11 h-11 flex items-center justify-center glass rounded-full transition-all text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 border border-slate-300 dark:border-white/10 focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <Tag size={20} />
              </motion.button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-8 pb-32">
        <AnimatePresence mode="wait">
          {activeTab === 'search' && (
            <motion.div
              key="search"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="space-y-8"
            >
              {/* Search Section */}
              <div className="flex flex-col gap-3">
                {/* Location Status & Postal Code Split Button */}
                <div className={cn(
                  "flex flex-col rounded-[1.5rem] transition-all shadow-sm border overflow-hidden",
                  locationError ? "bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-800/30" : 
                  userLocation ? "bg-emerald-50 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800/30" :
                  "bg-slate-100 border-slate-200 dark:bg-slate-800 dark:border-slate-700"
                )}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-full flex-shrink-0",
                        locationError ? "bg-red-100 dark:bg-red-900/40" :
                        userLocation ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-400" :
                        "bg-slate-200 dark:bg-slate-700"
                      )}>
                        {isLocating ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <MapPin size={14} />
                        )}
                      </div>
                      <div className="flex flex-col justify-center">
                        {isLocating ? <span>{t('locating')}</span> : 
                         locationError ? <span>{locationError}</span> : 
                         userLocation ? (
                           <>
                             <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                               <span>{t('voice_active')} ({userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)})</span>
                               <a 
                                 href={`https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}`}
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors flex items-center gap-1"
                               >
                                 {t('navigate')} <ExternalLink size={10} />
                               </a>
                             </div>
                             {userLocation.accuracy && (
                               <span className="text-[9px] opacity-70 mt-0.5">{t('accuracy')}: ±{Math.round(userLocation.accuracy)}M</span>
                             )}
                           </>
                         ) : 
                         <span>Location Disabled</span>}
                      </div>
                    </div>
                    
                    <div className="flex items-center self-start sm:self-auto bg-black/5 dark:bg-white/5 rounded-full p-1">
                      <button 
                        onClick={refreshLocation}
                        disabled={isLocating}
                        aria-label="Refresh location"
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all active:scale-95 disabled:opacity-50 focus:ring-2 outline-none",
                          locationError ? "hover:bg-red-100 dark:hover:bg-red-900/40 focus:ring-red-500" :
                          userLocation ? "hover:bg-emerald-100 dark:hover:bg-emerald-900/40 focus:ring-emerald-500" :
                          "hover:bg-slate-200 dark:hover:bg-slate-700 focus:ring-slate-500"
                        )}
                      >
                        <RefreshCw size={12} className={isLocating ? "animate-spin" : ""} />
                        Refresh
                      </button>
                      <div className="w-px h-4 bg-black/10 dark:bg-white/10 mx-1" />
                      <button
                        onClick={() => setIsLocationExpanded(!isLocationExpanded)}
                        aria-label="Toggle postal code input"
                        className={cn(
                          "p-2 rounded-full transition-all active:scale-95 focus:ring-2 outline-none",
                          locationError ? "hover:bg-red-100 dark:hover:bg-red-900/40 focus:ring-red-500" :
                          userLocation ? "hover:bg-emerald-100 dark:hover:bg-emerald-900/40 focus:ring-emerald-500" :
                          "hover:bg-slate-200 dark:hover:bg-slate-700 focus:ring-slate-500"
                        )}
                      >
                        <ChevronDown size={14} className={cn("transition-transform duration-300", isLocationExpanded && "rotate-180")} />
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isLocationExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="border-t border-black/5 dark:border-white/5 bg-white/50 dark:bg-black/20"
                      >
                        <div className="flex items-center gap-3 px-5 h-12">
                          <MapPin size={16} className="text-slate-400 dark:text-slate-500 flex-shrink-0" />
                          <input
                            type="text"
                            value={postalCode}
                            autoCorrect="on"
                            spellCheck="true"
                            autoCapitalize="characters"
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase();
                              setPostalCode(val);
                              localStorage.setItem('user-postal-code', val);
                              debouncedSearch(searchQuery, selectedStore, selectedCategory, val);
                            }}
                            placeholder="Enter Postal/Zip Code (e.g. M5V 3L9 or 90210)"
                            className="bg-transparent border-none outline-none text-sm font-medium w-full text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Main Search Input */}
                <form onSubmit={handleSearch} role="search" className="relative group">
                  <input
                    type="text"
                    placeholder="Find the best deals in your area..."
                    aria-label={t('search_placeholder')}
                    value={searchQuery}
                    autoCorrect="on"
                    spellCheck="true"
                    autoCapitalize="none"
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      debouncedSearch(e.target.value, selectedStore, selectedCategory, postalCode);
                    }}
                    className="w-full bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/5 rounded-[1.5rem] h-14 sm:h-16 pl-12 sm:pl-14 pr-[100px] sm:pr-[110px] shadow-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/50 transition-all text-base sm:text-lg placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none text-slate-700 dark:text-slate-200"
                  />
                  <Search className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-brand-500 transition-colors w-5 h-5 sm:w-6 sm:h-6" />
                  
                  <div className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {isSearching ? (
                      <CircularProgress size={24} sx={{ color: '#16a34a' }} className="mr-4" />
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setStartWithVideo(true);
                            setIsLiveAssistantOpen(true);
                          }}
                          className="flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 bg-brand-50 dark:bg-emerald-900/30 text-brand-600 dark:text-emerald-400 hover:bg-brand-100 dark:hover:bg-emerald-800/50 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                          title="Scan with Camera"
                        >
                          <Camera size={18} className="sm:w-5 sm:h-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStartWithVideo(false);
                            setIsLiveAssistantOpen(true);
                          }}
                          className="flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 bg-brand-50 dark:bg-emerald-900/30 text-brand-600 dark:text-emerald-400 hover:bg-brand-100 dark:hover:bg-emerald-800/50 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-brand-500/50 group-focus-within:animate-pulse"
                          title="Ask the Live Agent"
                        >
                          <Mic size={18} className="sm:w-5 sm:h-5" />
                        </button>
                      </>
                    )}
                  </div>
                </form>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <Store size={14} className="text-brand-500" />
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-[0.2em]">{t('stores_title')}</span>
                  </div>
                  <Carousel>
                    {filteredStores.map(store => (
                      <button
                        key={store.name}
                        onClick={() => {
                          const newStore = selectedStore === store.name ? undefined : store.name;
                          setSelectedStore(newStore);
                          debouncedSearch(searchQuery, newStore, selectedCategory, postalCode);
                        }}
                        aria-pressed={selectedStore === store.name}
                        className={cn(
                          "px-4 py-2.5 rounded-2xl text-[11px] font-bold border-2 whitespace-nowrap transition-all active:scale-95 hover:scale-105 hover:shadow-lg flex items-center justify-center gap-2.5 min-w-[140px]",
                          selectedStore === store.name 
                            ? "bg-brand-600 border-brand-600 text-white shadow-lg shadow-brand-500/30" 
                            : "bg-white dark:bg-slate-900/50 border-slate-200 dark:border-white/5 text-slate-700 dark:text-slate-400 hover:border-brand-500/50"
                        )}
                      >
                        <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center p-0.5 shadow-sm flex-shrink-0 overflow-hidden">
                          <img src={store.logo} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                        </div>
                        <span className="truncate">{store.name}</span>
                      </button>
                    ))}
                  </Carousel>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <Tag size={14} className="text-brand-500" />
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-[0.2em]">{t('categories_title')}</span>
                  </div>
                  <Carousel>
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => {
                          const newCat = selectedCategory === cat ? undefined : cat;
                          setSelectedCategory(newCat);
                          debouncedSearch(searchQuery, selectedStore, newCat, postalCode);
                        }}
                        aria-pressed={selectedCategory === cat}
                        className={cn(
                          "px-6 py-3 rounded-2xl text-xs font-bold border-2 whitespace-nowrap transition-all active:scale-95 hover:scale-105 hover:shadow-lg focus:ring-2 focus:ring-brand-500 outline-none",
                          selectedCategory === cat 
                            ? "bg-slate-900 dark:bg-white border-slate-900 dark:border-white text-white dark:text-slate-900 shadow-xl" 
                            : "bg-white dark:bg-slate-900/50 border-slate-200 dark:border-white/5 text-slate-700 dark:text-slate-400 hover:border-slate-900/50 dark:hover:border-white/20"
                        )}
                      >
                        {t(`cat_${cat.toLowerCase().replace(' ', '_')}`)}
                      </button>
                    ))}
                  </Carousel>
                </div>
              </div>

              {/* Results Section */}
              <div className="space-y-6">
                <div className="flex items-center justify-between px-1">
                  <h2 className="font-display font-bold text-lg text-slate-800">
                    {saleResults.length > 0 ? t('sales_near_you') : t('categories_title')}
                  </h2>
                  {saleResults.length > 0 && (
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-widest">
                      {saleResults.length} {t('items')}
                    </span>
                  )}
                </div>
                
                {searchError && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-6 glass border-red-500/20 bg-red-500/5 rounded-[2rem] text-center space-y-3"
                  >
                    <p className="text-red-600 dark:text-red-400 font-medium">{searchError}</p>
                    <button 
                      onClick={() => handleSearch()}
                      className="text-xs font-bold uppercase tracking-widest text-brand-600 hover:underline"
                    >
                      Try Again
                    </button>
                  </motion.div>
                )}

                {saleResults.length === 0 && !isSearching && !searchError && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                    {[
                      { name: t('popular_produce'), key: 'Fresh Produce', icon: <Tag className="text-emerald-500" />, color: 'bg-emerald-500/10' },
                      { name: t('popular_meat'), key: 'Meat & Seafood', icon: <Tag className="text-red-500" />, color: 'bg-red-500/10' },
                      { name: t('popular_dairy'), key: 'Dairy & Eggs', icon: <Tag className="text-blue-500" />, color: 'bg-blue-500/10' },
                      { name: t('popular_pantry'), key: 'Pantry Staples', icon: <Tag className="text-amber-500" />, color: 'bg-amber-500/10' }
                    ].map((cat, i) => (
                      <motion.button
                        key={cat.key}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        onClick={() => {
                          setSearchQuery(cat.name);
                          handleSearch(undefined, cat.name);
                        }}
                        className="glass p-8 rounded-[2.5rem] text-left border-2 border-slate-300 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 transition-all group relative overflow-hidden active:scale-[0.98]"
                      >
                        <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110 group-hover:rotate-3", cat.color)}>
                          {cat.icon}
                        </div>
                        <p className="font-display font-bold text-slate-900 dark:text-white text-xl leading-tight">{cat.name}</p>
                        <div className="flex items-center text-[10px] font-bold text-brand-700 dark:text-brand-400 mt-4 uppercase tracking-widest opacity-80 group-hover:opacity-100 transition-all">
                          {t('explore_deals')} <ChevronRight size={14} className="ml-1" />
                        </div>
                      </motion.button>
                    ))}
                  </div>
                )}

                <div className="space-y-10">
                  {Object.keys(salesGrouped).length > 0 && (
                    <div className="space-y-6">
                      <h2 className="font-display font-bold text-lg text-slate-800 dark:text-white">Sales Near You</h2>
                      {Object.entries(salesGrouped).map(([key, items]) => {
                        const sortedItems = [...items].sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
                        const bestPrice = sortedItems[0].price;
                        return (
                          <div key={key} className="space-y-4">
                            {items.length > 1 && (
                              <div className="flex items-center gap-3 px-2">
                                <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                                <div className="flex items-center gap-2">
                                  <Tag size={12} className="text-brand-600" />
                                  <h3 className="text-[10px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-[0.2em]">
                                    Comparison: {items[0].name}
                                  </h3>
                                </div>
                                <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                              </div>
                            )}
                            
                            <div className="space-y-3">
                              {sortedItems.map((item) => (
                                <motion.div
                                  layout="position"
                                  key={item.id}
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  whileHover={{ y: -4, scale: 1.01 }}
                                  className="glass p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 group transition-all duration-300"
                                >
                                  <div className="flex-1 space-y-2 sm:space-y-3 w-full">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant="outline" className="text-[10px] font-mono font-bold bg-brand-500/10 text-brand-600 dark:text-brand-400 px-2.5 py-0.5 rounded-full uppercase tracking-widest border-brand-500/20">
                                        {item.category}
                                      </Badge>
                                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                                        <Store size={12} className="text-slate-300" /> {item.store}
                                      </span>
                                      {items.length > 1 && item.price === bestPrice && (
                                        <Badge variant="outline" className="text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2.5 py-0.5 rounded-full uppercase tracking-widest border-amber-500/20 flex items-center gap-1">
                                          <Tag size={10} /> Best Deal
                                        </Badge>
                                      )}
                                    </div>
                                    <h3 className="font-display font-bold text-slate-900 dark:text-white text-lg sm:text-xl leading-tight tracking-tight">{item.name}</h3>
                                    <div className="flex flex-wrap items-center gap-3 sm:gap-5">
                                      <div className="flex flex-col">
                                        <div className="flex items-baseline gap-2">
                                          <span className="text-brand-700 dark:text-brand-400 font-mono font-bold text-2xl sm:text-3xl tracking-tighter">{item.price}</span>
                                          {item.originalPrice && (
                                            <span className="text-slate-500 dark:text-slate-400 font-mono text-sm sm:text-base line-through decoration-slate-400 dark:decoration-slate-600">{item.originalPrice}</span>
                                          )}
                                        </div>
                                        {(item.validFrom || item.validUntil) && (
                                          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-500 mt-0.5">
                                            {item.validFrom && item.validUntil ? `Valid ${formatDate(item.validFrom)} - ${formatDate(item.validUntil)}` : item.validFrom ? `Starts ${formatDate(item.validFrom)}` : `Valid until ${formatDate(item.validUntil)}`}
                                          </span>
                                        )}
                                      </div>
                                      {item.address && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                                            <MapPin size={12} className="text-slate-300 shrink-0" /> <span>{item.address}</span>
                                          </span>
                                          {item.distance && (
                                            <span className="text-[9px] sm:text-[10px] font-mono font-bold text-brand-500 bg-brand-500/5 px-2 py-0.5 rounded-full border border-brand-500/10 whitespace-nowrap">
                                              {item.distance}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    {item.mapsUri && (
                                      <a 
                                        href={item.mapsUri} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:underline transition-all"
                                      >
                                        Navigate <ExternalLink size={12} />
                                      </a>
                                    )}
                                  </div>
                                  <Button
                                    onClick={() => addToList(item)}
                                    className="w-full sm:w-14 h-12 sm:h-14 bg-brand-500 hover:bg-brand-600 text-white rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg shadow-brand-500/20 shrink-0"
                                  >
                                    <Plus size={24} strokeWidth={2.5} className="sm:w-7 sm:h-7" />
                                    <span className="sm:hidden ml-2 font-bold uppercase tracking-wider text-sm">Add to List</span>
                                  </Button>
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {Object.keys(regularGrouped).length > 0 && (
                    <div className="space-y-6">
                      <h2 className="font-display font-bold text-lg text-slate-800 dark:text-white">Regular Near You</h2>
                      {Object.entries(regularGrouped).map(([key, items]) => {
                        const sortedItems = [...items].sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
                        const bestPrice = sortedItems[0].price;
                        return (
                          <div key={key} className="space-y-4">
                            {items.length > 1 && (
                              <div className="flex items-center gap-3 px-2">
                                <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                                <div className="flex items-center gap-2">
                                  <Tag size={12} className="text-slate-500" />
                                  <h3 className="text-[10px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-[0.2em]">
                                    Comparison: {items[0].name}
                                  </h3>
                                </div>
                                <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                              </div>
                            )}
                            
                            <div className="space-y-3">
                              {sortedItems.map((item) => (
                                <motion.div
                                  layout="position"
                                  key={item.id}
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  whileHover={{ y: -4, scale: 1.01 }}
                                  className="glass p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 group transition-all duration-300"
                                >
                                  <div className="flex-1 space-y-2 sm:space-y-3 w-full">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant="outline" className="text-[10px] font-mono font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 px-2.5 py-0.5 rounded-full uppercase tracking-widest border-slate-500/20">
                                        {item.category}
                                      </Badge>
                                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                                        <Store size={12} className="text-slate-300" /> {item.store}
                                      </span>
                                      {items.length > 1 && item.price === bestPrice && (
                                        <Badge variant="outline" className="text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2.5 py-0.5 rounded-full uppercase tracking-widest border-amber-500/20 flex items-center gap-1">
                                          <Tag size={10} /> Best Deal
                                        </Badge>
                                      )}
                                    </div>
                                    <h3 className="font-display font-bold text-slate-900 dark:text-white text-lg sm:text-xl leading-tight tracking-tight">{item.name}</h3>
                                    <div className="flex flex-wrap items-center gap-3 sm:gap-5">
                                      <div className="flex flex-col">
                                        <div className="flex items-baseline gap-2">
                                          <span className="text-slate-700 dark:text-slate-300 font-mono font-bold text-2xl sm:text-3xl tracking-tighter">{item.price}</span>
                                        </div>
                                        {item.address && (
                                          <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                                              <MapPin size={12} className="text-slate-300 shrink-0" /> <span>{item.address}</span>
                                            </span>
                                            {item.distance && (
                                              <span className="text-[9px] sm:text-[10px] font-mono font-bold text-slate-500 bg-slate-500/5 px-2 py-0.5 rounded-full border border-slate-500/10 whitespace-nowrap">
                                                {item.distance}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    {item.mapsUri && (
                                      <a 
                                        href={item.mapsUri} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:underline transition-all"
                                      >
                                        Navigate <ExternalLink size={12} />
                                      </a>
                                    )}
                                  </div>
                                  <Button
                                    onClick={() => addToList(item)}
                                    className="w-full sm:w-14 h-12 sm:h-14 bg-slate-600 hover:bg-slate-700 text-white rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg shadow-slate-500/20 shrink-0"
                                  >
                                    <Plus size={24} strokeWidth={2.5} className="sm:w-7 sm:h-7" />
                                    <span className="sm:hidden ml-2 font-bold uppercase tracking-wider text-sm">Add to List</span>
                                  </Button>
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'list' && (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col gap-6 px-1">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h2 className="font-display font-bold text-3xl text-slate-800 dark:text-white tracking-tight">{t('tab_list')}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{t('estimated_total')}: <span className="text-brand-600 dark:text-brand-400 font-bold">${totalEstimated.toFixed(2)}</span></p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button 
                      variant="ghost"
                      size="sm"
                      onClick={handleShare}
                      className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest hover:text-brand-600 hover:bg-transparent hover:scale-105 transition-all flex items-center gap-1.5"
                    >
                      <Share2 size={12} /> Share
                    </Button>
                    
                    <div className="relative">
                      <Button 
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowClearConfirm(!showClearConfirm)}
                        className={cn(
                          "text-[10px] font-bold uppercase tracking-widest transition-all hover:bg-transparent hover:scale-105",
                          showClearConfirm ? "text-red-600 hover:text-red-700" : "text-slate-500 dark:text-slate-400 hover:text-red-500"
                        )}
                      >
                        {showClearConfirm ? "Cancel" : "Clear All"}
                      </Button>
                      
                      <AnimatePresence>
                        {showClearConfirm && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 10 }}
                            className="absolute right-0 top-full mt-2 glass border-white/10 shadow-2xl rounded-2xl p-4 z-50 min-w-[200px]"
                          >
                            <p className="text-xs font-bold text-slate-800 dark:text-white mb-3">{t('clear_confirm_title')}</p>
                            <Button 
                              onClick={clearList}
                              className="w-full bg-red-600 text-white py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-700 transition-colors shadow-lg shadow-red-500/20"
                            >
                              {t('confirm')}
                            </Button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="bg-slate-200/50 px-4 py-1.5 rounded-2xl">
                      <span className="text-xs font-bold text-slate-600">
                        {groceryList.filter(i => !i.completed).length} {t('items')}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedCount > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="brand-gradient text-white p-6 rounded-[2.5rem] shadow-xl shadow-brand-500/20 flex items-center justify-between border border-white/10"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
                        <CheckCircle2 size={18} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{t('selected_items')}</p>
                        <p className="text-sm font-bold">{selectedCount} {t('products_selected')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{t('selected_total')}</p>
                      <p className="text-lg font-mono font-bold">${selectedTotal.toFixed(2)}</p>
                    </div>
                  </motion.div>
                )}
              </div>

              {groceryList.length === 0 ? (
                <div className="text-center py-32 space-y-8">
                  <motion.div 
                    animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className="w-32 h-32 glass rounded-5xl flex items-center justify-center mx-auto text-slate-300 dark:text-slate-600"
                  >
                    <ShoppingCart size={56} strokeWidth={1.5} />
                  </motion.div>
                  <div className="space-y-3">
                    <h3 className="font-display font-bold text-2xl text-slate-800 dark:text-white">{t('empty_list_title')}</h3>
                    <p className="text-slate-600 dark:text-slate-400 text-sm max-w-[280px] mx-auto leading-relaxed">{t('empty_list_subtitle')}</p>
                  </div>
                  <Button 
                    onClick={() => setActiveTab('search')}
                    className="bg-brand-500 hover:bg-brand-600 text-white px-10 h-14 rounded-2xl font-bold shadow-xl shadow-brand-500/20 transition-all hover:scale-105 active:scale-95 text-lg"
                  >
                    {t('tab_search')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-12">
                  {Object.entries(listByStore).map(([store, items]) => (
                    <div key={store} className="space-y-6">
                      <div className="flex items-center gap-4 px-2">
                        <div className="w-10 h-10 glass rounded-xl flex items-center justify-center text-brand-500">
                          <Store size={20} />
                        </div>
                        <div className="flex flex-col">
                          <h3 className="font-display font-bold text-xl text-slate-800 dark:text-white leading-tight">{store}</h3>
                          {items[0]?.address && (
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                                <MapPin size={10} /> {items[0].address}
                              </span>
                              {items[0]?.mapsUri && (
                                <a 
                                  href={items[0].mapsUri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] font-bold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-0.5"
                                >
                                  {t('navigate')} <ExternalLink size={10} />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="h-px flex-1 bg-slate-200 dark:bg-white/5" />
                        <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-md">
                          {items.length} {t('items')}
                        </span>
                      </div>
                      
                      <div className="space-y-4">
                        {items.map((item) => (
                          <motion.div
                            layout="position"
                            key={item.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={cn(
                              "glass p-4 sm:p-5 rounded-[1.5rem] sm:rounded-[2rem] transition-all flex flex-col sm:flex-row items-start sm:items-center gap-4 border-white/5 relative group",
                              item.completed ? "opacity-60 grayscale-[0.5]" : "shadow-xl shadow-black/5",
                              item.selected && !item.completed && "ring-2 ring-brand-500"
                            )}
                          >
                            <div className="flex items-center justify-between w-full sm:w-auto gap-3">
                              {/* Actions Left */}
                              <div className="flex gap-2 shrink-0">
                                <motion.button 
                                  whileTap={{ scale: 0.8 }}
                                  whileHover={{ scale: 1.1 }}
                                  onClick={() => toggleSelect(item.id)}
                                  aria-label={item.selected ? `Deselect ${item.name}` : `Select ${item.name}`}
                                  className={cn(
                                    "w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all focus:ring-2 focus:ring-brand-500 outline-none",
                                    item.selected 
                                      ? "bg-slate-900 dark:bg-white border-slate-900 dark:border-white text-white dark:text-slate-900" 
                                      : "border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-400 hover:text-slate-900 dark:hover:text-white"
                                  )}
                                >
                                  <Plus size={16} strokeWidth={3} className={item.selected ? "rotate-45" : ""} />
                                </motion.button>
                                <motion.button 
                                  whileTap={{ scale: 0.8 }}
                                  whileHover={{ scale: 1.1 }}
                                  onClick={() => toggleComplete(item.id)}
                                  aria-label={item.completed ? `Mark ${item.name} as incomplete` : `Mark ${item.name} as complete`}
                                  className={cn(
                                    "w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all focus:ring-2 focus:ring-brand-500 outline-none",
                                    item.completed 
                                      ? "bg-brand-500 border-brand-500 text-white" 
                                      : "border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-brand-500 hover:text-brand-500"
                                  )}
                                >
                                  <CheckCircle2 size={16} strokeWidth={3} />
                                </motion.button>
                              </div>

                              {/* Title (Mobile) */}
                              <div className="flex-1 min-w-0 sm:hidden">
                                <h3 className={cn(
                                  "font-display font-bold text-lg text-slate-800 dark:text-white leading-tight",
                                  item.completed && "text-slate-500 dark:text-slate-600 line-through"
                                )}>
                                  {item.name}
                                </h3>
                              </div>

                              {/* Trash (Mobile) */}
                              <Button 
                                variant="ghost"
                                size="icon"
                                onClick={() => removeItem(item.id)}
                                aria-label={`Remove ${item.name} from list`}
                                className="sm:hidden text-slate-300 dark:text-slate-700 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-500 transition-colors rounded-xl"
                              >
                                <Trash2 size={18} />
                              </Button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
                                <div className="flex flex-col gap-1 min-w-0">
                                  <h3 className={cn(
                                    "hidden sm:block font-display font-bold text-xl text-slate-800 dark:text-white leading-tight",
                                    item.completed && "text-slate-500 dark:text-slate-600 line-through"
                                  )}>
                                    {item.name}
                                  </h3>
                                  {item.address && (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <MapPin size={12} className="text-slate-500 dark:text-slate-400 shrink-0" />
                                      <span className="text-[11px] font-medium text-slate-500">{item.address}</span>
                                      {item.mapsUri && (
                                        <a 
                                          href={item.mapsUri} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-600 dark:text-brand-400 hover:underline whitespace-nowrap ml-1"
                                        >
                                          {t('navigate')} <ExternalLink size={10} />
                                        </a>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 w-full sm:w-auto mt-1 sm:mt-0">
                                  {item.price && (
                                    <div className="flex flex-col items-end">
                                      <div className="flex items-baseline gap-2">
                                        <span className="text-sm sm:text-base font-mono font-bold text-brand-600 dark:text-brand-400">{item.price}</span>
                                        {item.originalPrice && (
                                          <span className="text-[10px] sm:text-xs font-mono text-slate-500 dark:text-slate-400 line-through decoration-slate-300 dark:decoration-slate-600">{item.originalPrice}</span>
                                        )}
                                      </div>
                                      {(item.validFrom || item.validUntil) && (
                                        <span className="text-[9px] font-medium text-amber-600 dark:text-amber-500">
                                          {item.validFrom && item.validUntil ? `Valid ${formatDate(item.validFrom)} - ${formatDate(item.validUntil)}` : item.validFrom ? `Starts ${formatDate(item.validFrom)}` : `Valid until ${formatDate(item.validUntil)}`}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-3 ml-auto sm:ml-0">
                                    {!item.completed && (
                                      <div className="flex items-center glass rounded-xl px-2 py-1 gap-3 border-white/5">
                                        <button 
                                          onClick={() => updateQuantity(item.id, -1)}
                                          aria-label={`Decrease quantity of ${item.name}`}
                                          className="w-5 h-5 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:scale-125 transition-all font-bold focus:ring-2 focus:ring-brand-500 outline-none rounded-md"
                                        >
                                          -
                                        </button>
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 min-w-[14px] text-center" aria-label={`Quantity: ${item.quantity} ${item.unit || ''}`}>{item.quantity}{item.unit ? ` ${item.unit}` : ''}</span>
                                        <button 
                                          onClick={() => updateQuantity(item.id, 1)}
                                          aria-label={`Increase quantity of ${item.name}`}
                                          className="w-5 h-5 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:scale-125 transition-all font-bold focus:ring-2 focus:ring-brand-500 outline-none rounded-md"
                                        >
                                          +
                                        </button>
                                      </div>
                                    )}
                                    {item.completed && (item.quantity > 1 || item.unit) && (
                                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400">×{item.quantity}{item.unit ? ` ${item.unit}` : ''}</span>
                                    )}
                                  </div>
                                </div>
                            </div>

                            {/* Trash (Desktop) */}
                            <Button 
                              variant="ghost"
                              size="icon"
                              onClick={() => removeItem(item.id)}
                              aria-label={`Remove ${item.name} from list`}
                              className="hidden sm:flex text-slate-300 dark:text-slate-700 hover:text-red-500 dark:hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors rounded-xl"
                            >
                              <Trash2 size={20} />
                            </Button>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <HealthProfileView profile={healthProfile} onSave={setHealthProfile} />
            </motion.div>
          )}

          {activeTab === 'scanner' && (
            <motion.div
              key="scanner"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <ScannerView profile={healthProfile} scanTrigger={scanTrigger} />
            </motion.div>
          )}

          {activeTab === 'meal-plan' && (
            <motion.div
              key="meal-plan"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <MealPlanView groceries={groceryList} profile={healthProfile} mealPlan={mealPlan} setMealPlan={setMealPlan} selectedMeal={selectedMeal} setSelectedMeal={setSelectedMeal} expandedDays={expandedDays} setExpandedDays={setExpandedDays} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Live Assistant */}
      <AnimatePresence>
        {isLiveAssistantOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-2xl pointer-events-none flex justify-end"
          >
            <LiveAssistant 
              onClose={() => setIsLiveAssistantOpen(false)}
              postalCode={postalCode}
              onAddItem={(name, category, store, price, quantity, address, mapsUri, distance, originalPrice, validFrom, validUntil, unit) => addToList({ name, category, store, price, quantity, address, mapsUri, distance, originalPrice, validFrom, validUntil, unit })}
              onRemoveItem={removeFromListByName}
              onUpdateItem={updateItemInList}
              onClearList={clearGroceryList}
              userLocation={userLocation}
              groceryList={groceryList}
              healthProfile={healthProfile}
              mealPlan={mealPlan}
              initialVideoEnabled={startWithVideo}
              onScanItem={() => {
                setActiveTab('scanner');
                setScanTrigger(prev => prev + 1);
              }}
              onSearch={(query, results, store) => {
                setSearchQuery(query);
                setSaleResults(results);
                if (store) {
                  const exactStore = filteredStores.map(s => s.name).find(s => s.toLowerCase() === store.toLowerCase());
                  setSelectedStore(exactStore || store);
                }
                setSearchError(results.length === 0 ? "No deals found for this search. Try a different item or store." : null);
                setActiveTab('search');
              }}
              onUpdateProfile={(dietTypes, allergies, goals, dislikedIngredients) => {
                setHealthProfile(prev => ({
                  ...prev,
                  dietTypes: dietTypes !== undefined ? dietTypes : prev.dietTypes,
                  allergies: allergies !== undefined ? allergies : prev.allergies,
                  goals: goals !== undefined ? goals : prev.goals,
                  dislikedIngredients: dislikedIngredients !== undefined ? dislikedIngredients : prev.dislikedIngredients
                }));
              }}
              onGenerateMealPlan={async (days, budget, people, preferences) => {
                if (budget !== undefined && budget < 0) {
                  return "Failed to generate meal plan. The budget cannot be negative.";
                }
                if (groceryList.length === 0 && (!preferences || !preferences.trim())) {
                  return "Failed to generate meal plan. The user's grocery list is empty and no preferences were provided. Please ask the user what kind of meals they want or to add items to their list first.";
                }
                try {
                  const plan = await generateMealPlan(groceryList, healthProfile, days, budget, people, preferences);
                  if (plan) {
                    setMealPlan(plan);
                    setActiveTab('meal-plan');
                    let msg = `Successfully generated a ${days}-day meal plan${people ? ` for ${people} people` : ''}. I've opened the meal plan view for you.`;
                    if (plan.budgetWarning) {
                      msg += ` WARNING: ${plan.budgetWarning}`;
                    } else if (plan.estimatedCost) {
                      msg += ` The estimated cost is $${plan.estimatedCost}.`;
                    }
                    return msg;
                  }
                  return "Failed to generate meal plan.";
                } catch (err) {
                  return "An error occurred while generating the meal plan.";
                }
              }}
              onAddMealToPlan={(dayIndex, type, meal) => {
                let currentPlan = mealPlan;
                if (!currentPlan || currentPlan.days.length === 0) {
                  // Create a default 7-day meal plan starting from today
                  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                  const todayIndex = new Date().getDay();
                  const days = Array.from({ length: 7 }, (_, i) => daysOfWeek[(todayIndex + i) % 7]);
                  currentPlan = {
                    days: days.map(day => ({ day }))
                  };
                }
                
                if (dayIndex < 0) {
                  dayIndex = 0;
                } else if (dayIndex >= currentPlan.days.length) {
                  dayIndex = currentPlan.days.length - 1;
                }
                
                const updatedPlan = { ...currentPlan };
                updatedPlan.days = [...currentPlan.days];
                updatedPlan.days[dayIndex] = { ...updatedPlan.days[dayIndex] };
                updatedPlan.days[dayIndex][type] = meal;
                
                setMealPlan(updatedPlan);
                setActiveTab('meal-plan');
                return `Successfully added ${meal.name} to day ${dayIndex + 1} for ${type}.`;
              }}
              onRemoveMealFromPlan={(dayIndex, type) => {
                if (!mealPlan) return "No meal plan exists.";
                if (dayIndex < 0 || dayIndex >= mealPlan.days.length) return "Invalid day index.";
                const updatedPlan = { ...mealPlan };
                delete updatedPlan.days[dayIndex][type];
                setMealPlan(updatedPlan);
                return `Successfully removed meal from day ${dayIndex + 1} for ${type}.`;
              }}
              onUpdateMealInPlan={(dayIndex, type, mealUpdates) => {
                if (!mealPlan) return "No meal plan exists.";
                if (dayIndex < 0 || dayIndex >= mealPlan.days.length) return "Invalid day index.";
                const existingMeal = mealPlan.days[dayIndex][type];
                if (!existingMeal) return "No meal exists at that slot to update.";
                const updatedPlan = { ...mealPlan };
                updatedPlan.days[dayIndex][type] = { ...existingMeal, ...mealUpdates };
                setMealPlan(updatedPlan);
                return `Successfully updated meal on day ${dayIndex + 1} for ${type}.`;
              }}
              onClearMealPlan={() => {
                setMealPlan(null);
                return "Successfully cleared the meal plan.";
              }}
              onToggleDayExpansion={(dayIndex, expand) => {
                setExpandedDays(prev => ({ ...prev, [dayIndex]: expand }));
                return `Successfully ${expand ? 'expanded' : 'collapsed'} day ${dayIndex + 1}.`;
              }}
              onOpenMeal={(dayIndex, type) => {
                if (mealPlan && mealPlan.days && mealPlan.days[dayIndex] && mealPlan.days[dayIndex][type]) {
                  setSelectedMeal({ dayIndex, type, meal: mealPlan.days[dayIndex][type]! });
                  setActiveTab('meal-plan');
                  return "Meal opened successfully.";
                }
                return "Meal not found.";
              }}
              onNavigateTab={(tabName) => {
                const validTabs: Tab[] = ['search', 'scanner', 'meal-plan', 'profile', 'list'];
                if (validTabs.includes(tabName as Tab)) {
                  setActiveTab(tabName as Tab);
                }
              }}
              onSetSearchQuery={(query) => {
                setSearchQuery(query);
              }}
              onSetSearchFilters={(store, category) => {
                if (store !== undefined) {
                  const exactStore = store ? filteredStores.map(s => s.name).find(s => s.toLowerCase() === store.toLowerCase()) : undefined;
                  setSelectedStore(exactStore || (store || undefined));
                }
                if (category !== undefined) {
                  const exactCategory = category ? categories.find(c => c.toLowerCase() === category.toLowerCase()) : undefined;
                  setSelectedCategory(exactCategory || (category || undefined));
                }
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button for Voice Assistant */}
      <AnimatePresence>
        {!isLiveAssistantOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-2xl pointer-events-none flex justify-end"
          >
            <button
              onClick={() => setIsLiveAssistantOpen(true)}
              aria-label={t('voice_assistant')}
              className="pointer-events-auto relative w-16 h-16 bg-brand-500 text-white rounded-full shadow-[0_8px_30px_rgba(34,197,94,0.4)] flex items-center justify-center hover:bg-brand-600 transition-colors focus:ring-4 focus:ring-brand-500/30 outline-none group"
            >
              <div className="absolute inset-0 bg-brand-400 rounded-full animate-ping opacity-20" />
              <Mic size={28} className="relative z-10 group-hover:scale-110 transition-transform" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <nav role="navigation" aria-label="Main navigation" className="fixed bottom-0 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 w-full sm:w-[95%] max-w-2xl">
        <BottomNavigation
          value={activeTab}
          onChange={(event, newValue) => {
            setActiveTab(newValue);
          }}
          showLabels
          className="glass sm:rounded-[2.5rem] p-2 flex items-center justify-between shadow-[0_-10px_40px_rgba(0,0,0,0.1)] sm:shadow-[0_20px_50px_rgba(0,0,0,0.3)] border-t sm:border border-white/10 overflow-x-auto scrollbar-hide !bg-white/90 dark:!bg-[#0f172a]/90 backdrop-blur-xl"
          sx={{
            height: '80px',
            '& .MuiBottomNavigationAction-root': {
              color: 'var(--nav-text, #64748b)',
              minWidth: '60px',
              padding: '8px 0 12px 0',
              borderRadius: '24px',
              transition: 'all 0.3s cubic-bezier(0.2, 0, 0, 1)',
              '& .MuiBottomNavigationAction-label': {
                fontSize: '11px',
                fontWeight: '600',
                letterSpacing: '0.02em',
                marginTop: '4px',
                opacity: 0.8,
                transition: 'all 0.3s cubic-bezier(0.2, 0, 0, 1)',
              },
              '&.Mui-selected': {
                color: '#16a34a', // emerald-600
                '& .MuiBottomNavigationAction-label': {
                  fontSize: '12px',
                  fontWeight: '700',
                  opacity: 1,
                },
                '& svg': {
                  backgroundColor: '#dcfce7', // emerald-100
                  color: '#166534', // emerald-800
                  padding: '4px 16px',
                  borderRadius: '16px',
                  boxSizing: 'content-box',
                  transition: 'all 0.3s cubic-bezier(0.2, 0, 0, 1)',
                }
              },
              '&:hover:not(.Mui-selected)': {
                color: 'var(--nav-hover-text, #334155)',
                '& svg': {
                  backgroundColor: 'var(--nav-hover-bg, rgba(0, 0, 0, 0.05))',
                  padding: '4px 16px',
                  borderRadius: '16px',
                  boxSizing: 'content-box',
                }
              }
            }
          }}
        >
          <BottomNavigationAction label={t('tab_profile')} value="profile" icon={<User size={20} strokeWidth={activeTab === 'profile' ? 2.5 : 2} />} />
          <BottomNavigationAction label={t('tab_search')} value="search" icon={<Search size={20} strokeWidth={activeTab === 'search' ? 2.5 : 2} />} />
          <BottomNavigationAction label={t('tab_scan')} value="scanner" icon={<Camera size={20} strokeWidth={activeTab === 'scanner' ? 2.5 : 2} />} />
          <BottomNavigationAction label={t('tab_meals')} value="meal-plan" icon={<Calendar size={20} strokeWidth={activeTab === 'meal-plan' ? 2.5 : 2} />} />
          <BottomNavigationAction 
            label={t('tab_list')} 
            value="list" 
            icon={
              <div className="relative">
                {groceryList.length > 0 && activeTab !== 'list' && (
                  <div className="absolute -top-2 -right-3 bg-brand-500 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-white dark:border-slate-900 shadow-sm" aria-hidden="true">
                    {groceryList.length}
                  </div>
                )}
                <ShoppingCart size={20} strokeWidth={activeTab === 'list' ? 2.5 : 2} />
              </div>
            } 
          />
        </BottomNavigation>
      </nav>

      {/* Footer Info */}
      <footer className="max-w-md mx-auto px-6 pt-4 pb-32 text-center space-y-4">
        <div className="flex items-center justify-center gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-500">
          <button className="hover:text-brand-600 transition-colors">Help</button>
          <div className="w-1 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
          <button className="hover:text-brand-600 transition-colors">Privacy</button>
          <div className="w-1 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
          <button className="hover:text-brand-600 transition-colors">Terms</button>
        </div>
        <p className="text-[10px] text-slate-600 dark:text-slate-500 font-medium">
          &copy; {new Date().getFullYear()} Chanoch. AI-powered grocery deals.
        </p>
      </footer>

      {/* Info Modal */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setShowInfo(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass max-w-sm w-full p-8 rounded-[2.5rem] space-y-6 relative border-white/20 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowInfo(false)}
                className="absolute top-6 right-6 text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
              
              <div className="space-y-4">
                <div className="w-16 h-16 bg-brand-500/10 rounded-3xl flex items-center justify-center text-brand-600">
                  <Tag size={32} />
                </div>
                <h3 className="text-2xl font-display font-bold text-slate-800 dark:text-white tracking-tight">About Chanoch</h3>
                <div className="space-y-3 text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                  <p>
                    Chanoch uses AI to help you find the best grocery deals across the city.
                  </p>
                  <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl text-amber-700 dark:text-amber-400 text-xs italic">
                    Note: The AI searches the web for actual current flyer prices. However, store prices may change or vary by location. Always verify deals at the store.
                  </div>
                  <p>
                    Built for shoppers who want to save time and money.
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setShowInfo(false)}
                className="w-full py-4 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl transition-all shadow-lg shadow-brand-500/25 active:scale-[0.98]"
              >
                Got it!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-24 left-1/2 z-50 bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10"
          >
            <CheckCircle2 size={18} className="text-emerald-400" />
            <span className="text-sm font-bold tracking-tight">{t('list_copied')}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
