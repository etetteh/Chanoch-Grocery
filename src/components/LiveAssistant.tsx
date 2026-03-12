import React, { useEffect, useRef, useState } from 'react';
import { Mic, X, Loader2, Camera, CameraOff, Minimize2, Maximize2, AlertCircle, Monitor, SwitchCamera } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTranslation } from 'react-i18next';
import { connectToLive, LiveSession } from '../services/liveApi';
import { searchSales, generateImage } from '../services/gemini';
import { Button } from './ui/button';
import { SpeedDial } from './ui/speed-dial';
import { CircularProgress } from '@mui/material';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Props {
  onClose: () => void;
  onAddItem: (name: string, category: string, store?: string, price?: string, quantity?: number, address?: string, mapsUri?: string, distance?: string, originalPrice?: string, validFrom?: string, validUntil?: string, unit?: string) => void;
  onRemoveItem: (name: string) => void;
  onUpdateItem: (originalName: string, updates: { name?: string, quantity?: number, store?: string, price?: string }) => void;
  onClearList: () => void;
  userLocation: { lat: number; lng: number; accuracy?: number } | null;
  groceryList: any[];
  healthProfile: any;
  mealPlan: any;
  initialVideoEnabled?: boolean;
  onUpdateProfile?: (dietTypes?: string[], allergies?: string[], goals?: string[], dislikedIngredients?: string[]) => void;
  onGenerateMealPlan?: (days: number, budget?: number, people?: number, preferences?: string) => Promise<string>;
  onAddMealToPlan?: (dayIndex: number, type: 'breakfast' | 'lunch' | 'dinner' | 'snack', meal: any) => string;
  onRemoveMealFromPlan?: (dayIndex: number, type: 'breakfast' | 'lunch' | 'dinner' | 'snack') => string;
  onUpdateMealInPlan?: (dayIndex: number, type: 'breakfast' | 'lunch' | 'dinner' | 'snack', mealUpdates: any) => string;
  onToggleDayExpansion?: (dayIndex: number, expand: boolean) => string;
  onClearMealPlan?: () => string;
  onOpenMeal?: (dayIndex: number, type: 'breakfast' | 'lunch' | 'dinner' | 'snack') => string;
  onSearch?: (query: string, results: any[], store?: string) => void;
  onNavigateTab?: (tabName: string) => void;
  onSetSearchQuery?: (query: string) => void;
  onSetSearchFilters?: (store?: string, category?: string) => void;
  onScanItem?: () => void;
  postalCode?: string;
}

export default function LiveAssistant({ onClose, onAddItem, onRemoveItem, onUpdateItem, onClearList, userLocation, groceryList, healthProfile, mealPlan, initialVideoEnabled = false, onUpdateProfile, onGenerateMealPlan, onAddMealToPlan, onRemoveMealFromPlan, onUpdateMealInPlan, onToggleDayExpansion, onClearMealPlan, onOpenMeal, onSearch, onNavigateTab, onSetSearchQuery, onSetSearchFilters, onScanItem, postalCode }: Props) {
  const { t, i18n } = useTranslation();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(initialVideoEnabled);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [transcription, setTranscription] = useState<{ text: string; isUser: boolean } | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [highlights, setHighlights] = useState<{x: number, y: number, label?: string, id: number}[]>([]);
  const sessionRef = useRef<LiveSession | null>(null);
  
  // Use refs for callbacks to avoid stale closures in the live session
  const callbacksRef = useRef({ 
    onAddItem, onRemoveItem, onUpdateItem, onClearList, onUpdateProfile, onGenerateMealPlan, onAddMealToPlan, onRemoveMealFromPlan, onUpdateMealInPlan, onToggleDayExpansion, onClearMealPlan, onSearch, onSetSearchQuery, onSetSearchFilters, onScanItem,
    onOpenMeal: (dayIndex: number, type: 'breakfast' | 'lunch' | 'dinner' | 'snack') => {
      setIsMinimized(true);
      return onOpenMeal ? onOpenMeal(dayIndex, type) : "Failed to open meal";
    },
    onNavigateTab: (tabName: string) => {
      setIsMinimized(true);
      if (onNavigateTab) onNavigateTab(tabName);
    },
    onCloseAssistant: () => onClose(),
    onSetAppLanguage: (lang: string) => i18n.changeLanguage(lang),
    onScrollScreen: (direction: 'up' | 'down') => {
      window.scrollBy({ top: direction === 'up' ? -500 : 500, behavior: 'smooth' });
    },
    onHighlightObject: (normalizedX: number, normalizedY: number, label?: string) => {
      const id = Date.now();
      setHighlights(prev => [...prev, { x: normalizedX, y: normalizedY, label, id }]);
      // Auto-remove highlight after 4 seconds
      setTimeout(() => {
        setHighlights(prev => prev.filter(h => h.id !== id));
      }, 4000);
    }
  });
  useEffect(() => {
    callbacksRef.current = { 
      onAddItem, onRemoveItem, onUpdateItem, onClearList, onUpdateProfile, onGenerateMealPlan, onAddMealToPlan, onRemoveMealFromPlan, onUpdateMealInPlan, onToggleDayExpansion, onClearMealPlan, onSearch, onSetSearchQuery, onSetSearchFilters, onScanItem,
      onOpenMeal: (dayIndex: number, type: 'breakfast' | 'lunch' | 'dinner' | 'snack') => {
        setIsMinimized(true);
        return onOpenMeal ? onOpenMeal(dayIndex, type) : "Failed to open meal";
      },
      onNavigateTab: (tabName: string) => {
        setIsMinimized(true);
        if (onNavigateTab) onNavigateTab(tabName);
      },
      onCloseAssistant: () => onClose(),
      onSetAppLanguage: (lang: string) => i18n.changeLanguage(lang),
      onScrollScreen: (direction: 'up' | 'down') => {
        window.scrollBy({ top: direction === 'up' ? -500 : 500, behavior: 'smooth' });
      },
      onHighlightObject: (normalizedX: number, normalizedY: number, label?: string) => {
        const id = Date.now();
        setHighlights(prev => [...prev, { x: normalizedX, y: normalizedY, label, id }]);
        setTimeout(() => {
          setHighlights(prev => prev.filter(h => h.id !== id));
        }, 4000);
      }
    };
  }, [onAddItem, onRemoveItem, onUpdateItem, onClearList, onUpdateProfile, onGenerateMealPlan, onAddMealToPlan, onRemoveMealFromPlan, onUpdateMealInPlan, onToggleDayExpansion, onClearMealPlan, onOpenMeal, onSearch, onNavigateTab, onSetSearchQuery, onSetSearchFilters, onClose, i18n]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueue = useRef<string[]>([]);
  const isPlaying = useRef(false);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const isMountedRef = useRef(true);
  const isVideoIntendedRef = useRef(initialVideoEnabled);
  const facingModeRef = useRef<'environment' | 'user'>('environment');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const frameIntervalRef = useRef<number | null>(null);

  const hasGreetedRef = useRef(false);

  useEffect(() => {
    if (isConnected && !hasGreetedRef.current && sessionRef.current) {
      hasGreetedRef.current = true;
      sessionRef.current.sendClientContent({
        turns: [{
          role: "user",
          parts: [{ text: "Hello Chanoch! Please introduce yourself as my personal grocery assistant." }]
        }],
        turnComplete: true
      });
    }
  }, [isConnected]);

  const startSession = async () => {
    setIsConnecting(true);
    try {
      // Cleanup previous session if it exists
      if (sessionRef.current) {
        sessionRef.current.close();
        sessionRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
      }

      // Setup microphone first to get permissions
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      streamRef.current = stream;

      const sessionPromise = connectToLive({
        onAudio: (base64) => {
          audioQueue.current.push(base64);
          if (!isPlaying.current) playNextInQueue();
        },
        onInterrupted: () => {
          audioQueue.current = [];
          isPlaying.current = false;
          if (currentAudioSourceRef.current) {
            currentAudioSourceRef.current.onended = null;
            try {
              currentAudioSourceRef.current.stop();
            } catch (e) {
              // Ignore if already stopped
            }
            currentAudioSourceRef.current = null;
          }
        },
        onTranscription: (text, isUser) => setTranscription({ text, isUser }),
        onAddItem: (name, category, store, price, quantity, address, mapsUri, distance, originalPrice, validFrom, validUntil, unit) => callbacksRef.current.onAddItem(name, category, store, price, quantity, address, mapsUri, distance, originalPrice, validFrom, validUntil, unit),
        onRemoveItem: (name) => callbacksRef.current.onRemoveItem(name),
        onUpdateItem: (originalName, updates) => callbacksRef.current.onUpdateItem(originalName, updates),
        onClearList: () => callbacksRef.current.onClearList(),
        onSearchSales: async (query, store) => {
          try {
            const results = await searchSales(query, store, undefined, userLocation?.lat, userLocation?.lng, userLocation?.accuracy, postalCode);
            if (callbacksRef.current.onSearch) {
              callbacksRef.current.onSearch(query, results, store);
            }
            if (results.length === 0) return t('no_results');
            return results.map(r => `[DEAL] Item: ${r.name} | Store: ${r.store} | Price: ${r.price} | Original Price: ${r.originalPrice || 'N/A'} | Valid Until: ${r.validUntil || 'N/A'} | Distance: ${r.distance || 'nearby'} | Address: ${r.address} | Maps: ${r.mapsUri}`).join("\n");
          } catch (error) {
            console.error("Live search failed:", error);
            return "I'm sorry, I encountered an error while searching for deals. Please try again in a moment.";
          }
        },
        onSearchAndAddMultipleItems: async (items) => {
          try {
            let addedCount = 0;
            
            // Helper function to process items with concurrency limit
            const processItems = async (itemsList: string[], concurrency: number) => {
              const results: any[] = [];
              const executing = new Set<Promise<void>>();
              
              for (const item of itemsList) {
                const p = Promise.resolve().then(async () => {
                  try {
                    const searchResults = await searchSales(item, undefined, undefined, userLocation?.lat, userLocation?.lng, userLocation?.accuracy, postalCode);
                    if (searchResults && searchResults.length > 0) {
                      const bestResult = searchResults[0];
                      callbacksRef.current.onAddItem(
                        bestResult.name,
                        bestResult.category,
                        bestResult.store,
                        bestResult.price,
                        1,
                        bestResult.address,
                        bestResult.mapsUri,
                        bestResult.distance,
                        bestResult.originalPrice,
                        bestResult.validFrom,
                        bestResult.validUntil,
                        bestResult.unit
                      );
                      addedCount++;
                    }
                  } catch (e) {
                    console.error(`Failed to search and add ${item}:`, e);
                  }
                });
                
                results.push(p);
                executing.add(p);
                
                const clean = p.then(() => executing.delete(p));
                if (executing.size >= concurrency) {
                  await Promise.race(executing);
                }
              }
              return Promise.all(results);
            };

            await processItems(items, 3); // Concurrency limit of 3
            
            return `Successfully found and added ${addedCount} out of ${items.length} items to the shopping list.`;
          } catch (error) {
            console.error("Live search and add multiple failed:", error);
            return "Failed to search and add multiple items.";
          }
        },
        onGenerateImage: async (prompt) => {
          setIsGeneratingImage(true);
          try {
            const imageBase64 = await generateImage(prompt);
            if (imageBase64) {
              setGeneratedImage(imageBase64);
              return "Image generated successfully";
            }
            return "Failed to generate image";
          } catch (err) {
            console.error("Image generation failed:", err);
            return "Failed to generate image";
          } finally {
            setIsGeneratingImage(false);
          }
        },
        onUpdateProfile: (dietTypes, allergies, goals, dislikedIngredients) => {
          if (callbacksRef.current.onUpdateProfile) {
            callbacksRef.current.onUpdateProfile(dietTypes, allergies, goals, dislikedIngredients);
          }
        },
        onGenerateMealPlan: async (days, budget, people, preferences) => {
          if (callbacksRef.current.onGenerateMealPlan) {
            return await callbacksRef.current.onGenerateMealPlan(days, budget, people, preferences);
          }
          return "Meal plan generation not available.";
        },
        onAddMealToPlan: async (dayIndex, type, meal) => {
          if (callbacksRef.current.onAddMealToPlan) {
            return await callbacksRef.current.onAddMealToPlan(dayIndex, type, meal);
          }
          return "Adding meal to plan not available.";
        },
        onRemoveMealFromPlan: async (dayIndex, type) => {
          if (callbacksRef.current.onRemoveMealFromPlan) {
            return await callbacksRef.current.onRemoveMealFromPlan(dayIndex, type);
          }
          return "Removing meal from plan not available.";
        },
        onUpdateMealInPlan: async (dayIndex, type, mealUpdates) => {
          if (callbacksRef.current.onUpdateMealInPlan) {
            return await callbacksRef.current.onUpdateMealInPlan(dayIndex, type, mealUpdates);
          }
          return "Updating meal in plan not available.";
        },
        onToggleDayExpansion: async (dayIndex, expand) => {
          if (callbacksRef.current.onToggleDayExpansion) {
            return await callbacksRef.current.onToggleDayExpansion(dayIndex, expand);
          }
          return "Toggling day expansion not available.";
        },
        onClearMealPlan: async () => {
          if (callbacksRef.current.onClearMealPlan) {
            return await callbacksRef.current.onClearMealPlan();
          }
          return "Clearing meal plan not available.";
        },
        onNavigateTab: (tabName) => {
          if (callbacksRef.current.onNavigateTab) {
            callbacksRef.current.onNavigateTab(tabName);
          }
        },
        onSetSearchQuery: (query) => {
          if (callbacksRef.current.onSetSearchQuery) {
            callbacksRef.current.onSetSearchQuery(query);
          }
        },
        onSetSearchFilters: (store, category) => {
          if (callbacksRef.current.onSetSearchFilters) {
            callbacksRef.current.onSetSearchFilters(store, category);
          }
        },
        onScanItem: () => {
          if (callbacksRef.current.onScanItem) {
            callbacksRef.current.onScanItem();
          }
        },
        onSetAppLanguage: (languageCode) => {
          if (callbacksRef.current.onSetAppLanguage) {
            callbacksRef.current.onSetAppLanguage(languageCode);
          }
        },
        onScrollScreen: (direction) => {
          if (callbacksRef.current.onScrollScreen) {
            callbacksRef.current.onScrollScreen(direction);
          }
        },
        onHighlightObject: (normalizedX, normalizedY, label) => {
          if (callbacksRef.current.onHighlightObject) {
            callbacksRef.current.onHighlightObject(normalizedX, normalizedY, label);
          }
        },
        onSetCameraState: (enabled) => {
          if (enabled) {
            startVideo();
          } else {
            stopVideo();
          }
        },
        onClose: () => {
          if (isMountedRef.current) {
            setIsConnected(false);
            setConnectionError("Session closed. Reconnecting automatically...");
            setTimeout(() => {
              if (isMountedRef.current) {
                startSession();
              }
            }, 1500);
          }
        },
        onError: (err) => {
          if (isMountedRef.current) {
            setIsConnected(false);
            const msg = err.message || String(err);
            if (msg.includes("Deadline expired") || msg.includes("DEADLINE_EXCEEDED") || msg.includes("timeout") || msg.includes("1000")) {
              setConnectionError("Session ended. Reconnecting automatically...");
              setTimeout(() => {
                if (isMountedRef.current) {
                  startSession();
                }
              }, 1500);
            } else {
              setConnectionError(`Live session error: ${msg}`);
            }
          }
        }
      }, userLocation, groceryList, healthProfile, i18n.language, mealPlan);

      sessionPromiseRef.current = sessionPromise;
      const session = await sessionPromise;
      
      if (!isMountedRef.current) {
        session.close();
        return;
      }

      sessionRef.current = session;
      setIsConnected(true);
      
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        const base64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
        session.sendRealtimeInput({
          media: { data: base64, mimeType: 'audio/pcm;rate=16000' }
        });
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

    } catch (error: any) {
      if (isMountedRef.current) {
        console.warn("Failed to start live session:", error.message || error);
        setConnectionError(error.message || String(error));
      }
    } finally {
      if (isMountedRef.current) {
        setIsConnecting(false);
      }
    }
  };

  const playNextInQueue = async () => {
    if (audioQueue.current.length === 0 || !audioContextRef.current) {
      isPlaying.current = false;
      return;
    }

    isPlaying.current = true;
    const base64 = audioQueue.current.shift()!;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const pcm = new Int16Array(bytes.buffer);
    
    const floatData = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) floatData[i] = pcm[i] / 0x7FFF;

    const buffer = audioContextRef.current.createBuffer(1, floatData.length, 24000);
    buffer.getChannelData(0).set(floatData);
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      currentAudioSourceRef.current = null;
      playNextInQueue();
    };
    currentAudioSourceRef.current = source;
    source.start();
  };

  useEffect(() => {
    isMountedRef.current = true;
    // No automatic startSession() here - wait for user to click initialize button

    return () => {
      isMountedRef.current = false;
      if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => session.close()).catch(() => {});
      }
      sessionRef.current?.close();
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioContextRef.current?.close();
      processorRef.current?.disconnect();
      stopVideo();
    };
  }, []);

  const startVideo = async () => {
    try {
      stopMediaTracks(); // Stop any existing stream
      setIsVideoEnabled(true);
      isVideoIntendedRef.current = true;
      setIsScreenSharing(false);
      
      let stream: MediaStream;
      const currentFacingMode = facingModeRef.current;
      
      // Add a timeout to getUserMedia to prevent hanging
      const streamPromise = navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: currentFacingMode } 
      }).catch(async (e) => {
        if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
          throw e; // Don't retry if permission was denied
        }
        // Fallback to any available camera if environment facing is not supported
        return await navigator.mediaDevices.getUserMedia({ video: true });
      });

      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Camera request timed out after 15 seconds")), 15000)
      );

      stream = await Promise.race([streamPromise, timeoutPromise]);
      
      if (!isMountedRef.current || !isVideoIntendedRef.current) {
        // Component unmounted or video disabled while waiting for camera, stop it immediately
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      
      videoStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.warn("Video play failed:", e));
      }
      
      // Start capturing frames
      frameIntervalRef.current = window.setInterval(() => {
        if (!videoRef.current || !canvasRef.current || !sessionRef.current || !isConnected) return;
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        
        if (context && video.videoWidth > 0 && video.videoHeight > 0) {
          // Scale down to max 640px to save bandwidth and improve latency
          const MAX_DIMENSION = 640;
          let width = video.videoWidth;
          let height = video.videoHeight;
          
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            if (width > height) {
              height = Math.round((height * MAX_DIMENSION) / width);
              width = MAX_DIMENSION;
            } else {
              width = Math.round((width * MAX_DIMENSION) / height);
              height = MAX_DIMENSION;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          context.drawImage(video, 0, 0, width, height);
          
          const base64Data = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
          sessionRef.current.sendRealtimeInput({
            media: { data: base64Data, mimeType: 'image/jpeg' }
          });
        }
      }, 1000); // 1 frame per second to avoid overwhelming the model and causing latency
    } catch (error: any) {
      console.warn("Failed to start video:", error.message || error);
      setIsVideoEnabled(false);
      setVideoError("Camera access denied.");
      setTimeout(() => setVideoError(null), 3000);
    }
  };

  const stopMediaTracks = () => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(t => t.stop());
      videoStreamRef.current = null;
    }
  };

  const stopVideo = () => {
    stopMediaTracks();
    setIsVideoEnabled(false);
    isVideoIntendedRef.current = false;
    setIsScreenSharing(false);
  };

  const toggleCamera = () => {
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    facingModeRef.current = newMode;
    setFacingMode(newMode);
    if (isVideoIntendedRef.current) {
      startVideo();
    }
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      
      stopMediaTracks(); // Stop any existing video stream
      setIsScreenSharing(true);
      setIsVideoEnabled(false);
      
      videoStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.warn("Video play failed:", e));
      }
      setVideoError(null);

      // Handle user stopping screen share from browser UI
      stream.getVideoTracks()[0].onended = () => {
        stopVideo();
      };

      // Start capturing frames
      frameIntervalRef.current = window.setInterval(() => {
        if (!videoRef.current || !canvasRef.current || !sessionRef.current || !isConnected) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        
        if (context && video.videoWidth > 0 && video.videoHeight > 0) {
          // Scale down to max 640px to save bandwidth and improve latency
          const MAX_DIMENSION = 640;
          let width = video.videoWidth;
          let height = video.videoHeight;
          
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            if (width > height) {
              height = Math.round((height * MAX_DIMENSION) / width);
              width = MAX_DIMENSION;
            } else {
              width = Math.round((width * MAX_DIMENSION) / height);
              height = MAX_DIMENSION;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          context.drawImage(video, 0, 0, width, height);
          
          const base64Data = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
          sessionRef.current.sendRealtimeInput({
            media: { data: base64Data, mimeType: 'image/jpeg' }
          });
        }
      }, 1000);
    } catch (error: any) {
      console.warn("Failed to start screen share:", error.message || error);
      setIsScreenSharing(false);
      setVideoError("Screen share access denied.");
      setTimeout(() => setVideoError(null), 3000);
    }
  };

  const hasStartedVideoRef = useRef(false);

  useEffect(() => {
    if (isConnected && initialVideoEnabled && !hasStartedVideoRef.current) {
      hasStartedVideoRef.current = true;
      startVideo();
    }
  }, [isConnected, initialVideoEnabled]);

  useEffect(() => {
    if (sessionRef.current && isConnected) {
      const listContext = groceryList.length > 0 
        ? `The user's current shopping list has been updated. It now contains: ${groceryList.map(i => `${i.quantity || 1}x ${i.name} from ${i.store || 'any store'}`).join(', ')}.`
        : "The user's shopping list is now empty.";
      
      // Update session with new list context via clientContent
      sessionRef.current.sendClientContent({
        turns: [
          {
            role: "user",
            parts: [{ text: `SYSTEM UPDATE: ${listContext}` }]
          }
        ],
        turnComplete: true
      });
    }
  }, [groceryList, isConnected]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 40, maxWidth: isMinimized ? 260 : 400 }}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        y: 0,
        height: isMinimized ? 64 : 600,
        width: '100%',
        maxWidth: isMinimized ? 260 : 400,
        borderRadius: isMinimized ? 32 : 40
      }}
      exit={{ opacity: 0, scale: 0.9, y: 40, maxWidth: isMinimized ? 260 : 400 }}
      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-assistant-title"
      className={cn(
        "relative bg-black text-white flex flex-col overflow-hidden shadow-2xl shadow-brand-500/20 border border-white/10 pointer-events-auto",
        !isMinimized && "max-h-[70vh]"
      )}
    >
      {/* Video Background (Astra Immersive View) */}
      {isVideoEnabled && (
        <>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className={`absolute inset-0 w-full h-full object-cover z-0 ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} 
          />
          {/* Viewfinder Overlay */}
          <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center p-8">
            <div className="w-full h-full max-w-sm max-h-[60vh] border-2 border-white/20 rounded-[2rem] relative">
              {/* Corner Accents */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-brand-500 rounded-tl-[2rem]" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-brand-500 rounded-tr-[2rem]" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-brand-500 rounded-bl-[2rem]" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-brand-500 rounded-br-[2rem]" />
              
              {/* Scanning Line */}
              <motion.div 
                animate={{ y: ['0%', '100%', '0%'] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-brand-500 to-transparent opacity-50 shadow-[0_0_15px_rgba(34,197,94,0.8)]"
              />
            </div>
          </div>

          {/* Highlights Overlay */}
          <div className="absolute inset-0 pointer-events-none z-20">
            <AnimatePresence>
              {highlights.map(h => (
                <motion.div
                  key={h.id}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.5 }}
                  transition={{ type: "spring", bounce: 0.5 }}
                  className="absolute flex flex-col items-center justify-center transform -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
                >
                  <div className="w-16 h-16 rounded-full border-4 border-brand-500 shadow-[0_0_20px_rgba(34,197,94,0.8)] animate-pulse" />
                  {h.label && (
                    <div className="mt-2 bg-black/80 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase border border-brand-500/50 shadow-lg whitespace-nowrap">
                      {h.label}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Atmospheric Background (when video is off) */}
      {!isVideoEnabled && (
        <>
          <div className="absolute inset-0 atmosphere pointer-events-none z-0" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,197,94,0.05),transparent_70%)] pointer-events-none z-0" />
          {/* Animated Glow Orbs */}
          <div className="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none z-0">
            <motion.div 
              animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3], x: [0, 20, 0], y: [0, -20, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-brand-500 rounded-full blur-[120px]" 
            />
            <motion.div 
              animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2], x: [0, -30, 0], y: [0, 30, 0] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-blue-500 rounded-full blur-[120px]" 
            />
          </div>
        </>
      )}

      {/* Hidden canvas element for frame capture */}
      <canvas ref={canvasRef} className="absolute w-1 h-1 opacity-0 pointer-events-none z-0" />

      {/* Top Bar Overlay */}
      <AnimatePresence>
        {!isMinimized && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-30 bg-gradient-to-b from-black/80 via-black/40 to-transparent pb-12 pointer-events-none"
          >
            <div className="flex flex-col gap-2 pointer-events-auto">
              <SpeedDial
                direction="down"
                align="left"
                mainIcon={<Camera size={24} />}
                activeIcon={<X size={24} />}
                buttonClassName={cn(
                  "w-12 h-12 shadow-2xl",
                  isVideoEnabled || isScreenSharing
                    ? "bg-emerald-500 text-white hover:bg-emerald-600"
                    : "bg-white/10 text-white hover:bg-white/20 backdrop-blur-md"
                )}
                actions={[
                  {
                    name: isVideoEnabled ? 'Vision Active' : 'Enable Camera',
                    icon: isVideoEnabled ? <Camera size={18} className="text-emerald-400" /> : <CameraOff size={18} />,
                    active: isVideoEnabled,
                    className: isVideoEnabled 
                      ? "!bg-emerald-500/20 !text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:!bg-emerald-500/30 backdrop-blur-md" 
                      : "!bg-white/10 !text-white hover:!bg-white/20 backdrop-blur-md",
                    onClick: () => {
                      if (isVideoEnabled) stopVideo();
                      else startVideo();
                    }
                  },
                  {
                    name: isScreenSharing ? 'Screen Active' : 'Share Screen',
                    icon: <Monitor size={18} className={isScreenSharing ? "text-blue-400" : ""} />,
                    active: isScreenSharing,
                    className: isScreenSharing 
                      ? "!bg-blue-500/20 !text-blue-100 shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:!bg-blue-500/30 backdrop-blur-md" 
                      : "!bg-white/10 !text-white hover:!bg-white/20 backdrop-blur-md",
                    onClick: () => {
                      if (isScreenSharing) stopVideo();
                      else startScreenShare();
                    }
                  }
                ]}
              />
              
              <AnimatePresence>
                {videoError && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-red-500/20 border border-red-500/30 text-red-200 text-[10px] font-bold px-3 py-1.5 rounded-xl backdrop-blur-md"
                  >
                    {videoError}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
              {isVideoEnabled && (
                <Button 
                  variant="outline"
                  size="icon"
                  onClick={toggleCamera}
                  aria-label="Switch Camera"
                  className="w-12 h-12 bg-black/40 hover:bg-black/60 hover:scale-110 border-white/20 rounded-full transition-all active:scale-90 backdrop-blur-md outline-none text-white shadow-lg"
                >
                  <SwitchCamera size={20} />
                </Button>
              )}
              <Button 
                variant="outline"
                size="icon"
                onClick={() => setIsMinimized(true)}
                aria-label="Minimize voice assistant"
                className="w-12 h-12 bg-black/40 hover:bg-black/60 hover:scale-110 border-white/20 rounded-full transition-all active:scale-90 backdrop-blur-md outline-none text-white shadow-lg"
              >
                <Minimize2 size={20} />
              </Button>
              <Button 
                variant="outline"
                size="icon"
                onClick={onClose}
                aria-label="Close voice assistant"
                className="w-12 h-12 bg-black/40 hover:bg-black/60 hover:scale-110 border-white/20 rounded-full transition-all active:scale-90 backdrop-blur-md outline-none text-white shadow-lg"
              >
                <X size={20} />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <AnimatePresence>
        {!isMinimized && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-20 flex-1 flex flex-col justify-end p-6 pb-10 pointer-events-none"
          >
            {!hasStarted ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-8 pointer-events-auto">
                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 bg-brand-500/10 blur-3xl rounded-full scale-150" />
                  <div className="w-24 h-24 bg-brand-500/20 rounded-full flex items-center justify-center border border-brand-500/30 relative z-10">
                    <Mic className="w-10 h-10 text-brand-500" />
                  </div>
                </div>
                <div className="text-center space-y-4">
                  <h2 className="font-display font-medium text-2xl tracking-tight text-white">{t('voice_ready')}</h2>
                  <p className="text-white/60 text-sm max-w-[280px] mx-auto">Chanoch is ready to help you find the best deals in your area. Click below to start the live session.</p>
                  <Button 
                    onClick={() => {
                      setHasStarted(true);
                      startSession();
                    }}
                    className="px-8 h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold shadow-xl shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-2 mx-auto"
                  >
                    Initialize Chanoch
                  </Button>
                </div>
              </div>
            ) : isConnecting ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-8">
                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full scale-150 animate-pulse" />
                  <CircularProgress size={64} sx={{ color: '#10b981' }} className="relative z-10" />
                </div>
                <div className="text-center space-y-2">
                  <h2 className="font-display font-medium text-xl tracking-tight text-white">{t('voice_initializing')}</h2>
                  <p className="text-emerald-400/60 text-xs font-mono uppercase tracking-[0.2em] animate-pulse">{t('voice_neural_link')}</p>
                </div>
              </div>
            ) : connectionError ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-8 pointer-events-auto">
                <div className="bg-red-500/20 text-red-200 p-6 rounded-2xl border border-red-500/30 max-w-sm text-center backdrop-blur-md">
                  <AlertCircle className="w-10 h-10 mx-auto mb-4 text-red-400" />
                  <h3 className="text-lg font-bold mb-2">Connection Failed</h3>
                  <p className="text-sm opacity-80 mb-6">{connectionError}</p>
                  <div className="flex gap-3 justify-center">
                    <Button 
                      onClick={() => {
                        setConnectionError(null);
                        startSession();
                      }}
                      className="px-6 h-10 bg-emerald-500/30 hover:bg-emerald-500/50 hover:scale-105 active:scale-95 text-emerald-200 rounded-full font-medium transition-all"
                    >
                      Retry
                    </Button>
                    <Button 
                      variant="ghost"
                      onClick={onClose}
                      className="px-6 h-10 bg-white/10 hover:bg-white/20 hover:scale-105 active:scale-95 rounded-full font-medium transition-all text-white"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center w-full space-y-6">
                
                {/* Transcription Area (Astra style) */}
                <div className="w-full max-w-sm bg-black/60 backdrop-blur-xl rounded-3xl p-6 border border-white/10 shadow-2xl pointer-events-auto relative overflow-hidden">
                  {/* Subtle gradient top border */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
                  
                  <div className="space-y-3 text-center">
                    {transcription && (
                      <div className="flex items-center justify-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full animate-pulse", transcription.isUser ? "bg-brand-400" : "bg-blue-400")} />
                        <p className={cn(
                          "text-[10px] font-mono font-bold uppercase tracking-[0.2em]",
                          transcription.isUser ? "text-brand-400" : "text-blue-400"
                        )}>
                          {transcription.isUser ? "You" : "Chanoch"}
                        </p>
                      </div>
                    )}
                    <p className="text-white text-lg font-medium leading-relaxed min-h-[3rem] flex items-center justify-center">
                      {transcription?.text || (isVideoEnabled ? "I'm looking through your camera. Show me a product or flyer!" : "I'm listening. What are you looking for today?")}
                    </p>
                  </div>
                </div>

                {/* Generated Image Display */}
                <AnimatePresence>
                  {(generatedImage || isGeneratingImage) && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 20 }}
                      className="w-full max-w-sm bg-black/60 backdrop-blur-xl rounded-3xl p-4 border border-white/10 shadow-2xl pointer-events-auto relative overflow-hidden"
                    >
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-bold uppercase tracking-widest text-brand-400">Generated Image</span>
                        {generatedImage && (
                          <Button 
                            variant="ghost"
                            size="icon"
                            onClick={() => setGeneratedImage(null)}
                            className="w-6 h-6 bg-white/10 hover:bg-white/20 hover:scale-110 active:scale-90 rounded-full transition-all text-white"
                          >
                            <X size={14} />
                          </Button>
                        )}
                      </div>
                      <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-white/5 flex items-center justify-center">
                        {isGeneratingImage ? (
                          <div className="flex flex-col items-center gap-3">
                            <CircularProgress size={32} sx={{ color: '#10b981' }} />
                            <span className="text-xs text-emerald-400 font-medium animate-pulse">Generating...</span>
                          </div>
                        ) : generatedImage ? (
                          <img src={generatedImage} alt="Generated meal" className="w-full h-full object-cover" />
                        ) : null}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Astra Glowing Orb / Waveform */}
                <div className="relative flex items-center justify-center h-32 w-full pointer-events-auto">
                  {/* Outer Glow */}
                  <motion.div 
                    animate={{ 
                      scale: [1, 1.2, 1],
                      opacity: [0.4, 0.8, 0.4]
                    }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute w-32 h-32 bg-gradient-to-tr from-brand-500/40 to-blue-500/40 blur-2xl rounded-full"
                  />
                  
                  {/* Inner Orb */}
                  <motion.div
                    animate={{ 
                      scale: [1, 1.05, 1],
                    }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    className="relative w-20 h-20 rounded-full bg-gradient-to-tr from-brand-400 to-blue-500 shadow-[0_0_40px_rgba(34,197,94,0.6)] flex items-center justify-center border border-white/20 overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-white/20 mix-blend-overlay rounded-full animate-[spin_4s_linear_infinite]" />
                    
                    {/* Audio Waveform inside the orb */}
                    <div className="flex gap-1 items-center justify-center z-10">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <motion.div
                          key={i}
                          animate={{ 
                            height: [8, 24, 12, 32, 16][i],
                          }}
                          transition={{ 
                            repeat: Infinity, 
                            duration: 0.5 + i * 0.1,
                            repeatType: "reverse",
                            ease: "easeInOut"
                          }}
                          className="w-1 bg-white rounded-full"
                        />
                      ))}
                    </div>
                  </motion.div>
                </div>
                
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Minimized View */}
      <AnimatePresence>
        {isMinimized && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-between px-4 pointer-events-auto"
          >
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center w-10 h-10">
                <div className="absolute inset-0 bg-brand-500/20 blur-xl rounded-full animate-pulse" />
                <div className="w-10 h-10 bg-brand-500 rounded-full flex items-center justify-center relative z-10 shadow-lg shadow-brand-500/50">
                  <Mic size={20} className="text-white" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white">Live Assistant</span>
                <span className="text-xs text-brand-200 truncate max-w-[80px]">
                  {transcription ? transcription.text : "Listening..."}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost"
                size="icon"
                onClick={() => setIsMinimized(false)}
                className="w-8 h-8 bg-white/10 hover:bg-white/20 hover:scale-110 active:scale-90 rounded-full transition-all text-white"
              >
                <Maximize2 size={16} />
              </Button>
              <Button 
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="w-8 h-8 bg-red-500/20 hover:bg-red-500/40 hover:scale-110 active:scale-90 rounded-full transition-all text-red-200"
              >
                <X size={16} />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
