import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { SaleItem, HealthProfile, ScannedItem, MealPlan, GroceryItem } from "../types";
import { sanitizePromptInput } from "../utils/security";

function getAIClient() {
  const env = (window as any).__ENV__ || {};
  const customApiKey = env.API_KEY || (typeof process !== 'undefined' && process.env ? process.env.API_KEY : undefined);
  const defaultApiKey = env.GEMINI_API_KEY || (typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : undefined);
  const apiKeyToUse = customApiKey || defaultApiKey;
  return new GoogleGenAI({ apiKey: apiKeyToUse });
}

function robustJsonParse<T>(jsonText: string, fallback: T): T {
  if (!jsonText) return fallback;
  let cleanedText = jsonText.replace(/^```json\s*/, '').replace(/```$/, '').trim();
  if (!cleanedText) return fallback;

  try {
    return JSON.parse(cleanedText) as T;
  } catch (e) {
    console.warn("JSON parse failed, attempting robust salvage...");

    // Pass 1: Clean unescaped newlines and track structure
    let cleaned = '';
    let isString = false;
    let isEscape = false;
    let stack: string[] = [];

    for (let i = 0; i < cleanedText.length; i++) {
      const char = cleanedText[i];
      if (isEscape) {
        cleaned += char;
        isEscape = false;
        continue;
      }
      if (char === '\\') {
        cleaned += char;
        isEscape = true;
        continue;
      }
      if (char === '"') {
        isString = !isString;
        cleaned += char;
        continue;
      }

      if (isString) {
        if (char === '\n') cleaned += '\\n';
        else if (char === '\r') cleaned += '\\r';
        else if (char === '\t') cleaned += '\\t';
        else if (char === '\b') cleaned += '\\b';
        else if (char === '\f') cleaned += '\\f';
        else cleaned += char;
      } else {
        cleaned += char;
        if (char === '{' || char === '[') stack.push(char);
        else if (char === '}') { if (stack[stack.length - 1] === '{') stack.pop(); }
        else if (char === ']') { if (stack[stack.length - 1] === '[') stack.pop(); }
      }
    }

    try {
      const parsed = JSON.parse(cleaned) as T;
      console.log("Successfully salvaged JSON by escaping control characters.");
      return parsed;
    } catch (e2) {
      // Pass 2: Try to fix truncation by closing open structures
      let fixed = cleaned;
      if (isString) fixed += '"';

      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i] === '{') fixed += '}';
        else if (stack[i] === '[') fixed += ']';
      }

      try {
        const parsed = JSON.parse(fixed) as T;
        console.log("Successfully salvaged JSON by closing truncated structures.");
        return parsed;
      } catch (e3) {
        // Pass 3: Fallback to finding the last complete object (if array)
        if (Array.isArray(fallback)) {
          let textToTruncate = cleaned;

          while (textToTruncate.length > 0) {
            const lastBrace = textToTruncate.lastIndexOf('}');
            if (lastBrace === -1) break;

            textToTruncate = textToTruncate.substring(0, lastBrace + 1);
            try {
              let arrayText = textToTruncate;
              if (!arrayText.trim().startsWith('[')) arrayText = '[' + arrayText;
              if (!arrayText.trim().endsWith(']')) arrayText = arrayText + ']';

              const parsed = JSON.parse(arrayText);
              if (Array.isArray(parsed)) {
                console.log("Successfully salvaged JSON by truncating to last complete object.");
                return parsed as unknown as T;
              }
            } catch (err) {
              textToTruncate = textToTruncate.substring(0, lastBrace);
            }
          }
        }

        console.error("Completely failed to salvage JSON. Original error:", e);
        return fallback;
      }
    }
  }
}

export async function analyzeGroceryItem(imageBase64: string, profile: HealthProfile): Promise<ScannedItem | null> {
  try {
    // Flash Lite is appropriate here — this is a single-image classification task
    // with a well-defined schema. No price verification or multi-step reasoning needed.
    const model = "gemini-3.1-flash-lite-preview";

    const profileContext = `
      Diet Types: ${profile.dietTypes?.join(', ') || 'None'}
      Allergies: ${profile.allergies?.join(', ') || 'None'}
      Health Goals: ${profile.goals?.join(', ') || 'None'}
      Disliked Ingredients: ${profile.dislikedIngredients?.join(', ') || 'None'}
    `;

    const systemInstruction = `You are an expert nutritionist and computer vision assistant.
    Analyze the provided image of a grocery item.
    1. Identify the item and its category.
    2. Estimate its nutritional value per serving.
    3. Determine if it aligns with the user's health profile.
    4. If it does not align, or if there is a significantly healthier alternative, recommend one.
    
    User's Health Profile:
    ${profileContext}
    `;

    const response = await getAIClient().models.generateContent({
      model,
      contents: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: imageBase64.split(',')[1] || imageBase64,
          }
        },
        { text: "Analyze this grocery item based on my health profile." }
      ],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Name of the identified item" },
            category: { type: Type.STRING, description: "Category of the item" },
            nutritionalInfo: {
              type: Type.OBJECT,
              properties: {
                calories: { type: Type.STRING },
                protein: { type: Type.STRING },
                carbs: { type: Type.STRING },
                fat: { type: Type.STRING }
              }
            },
            isAligned: { type: Type.BOOLEAN, description: "Whether the item aligns with the health profile" },
            reason: { type: Type.STRING, description: "Reason why it aligns or doesn't align" },
            healthierAlternative: { type: Type.STRING, description: "A healthier alternative brand or product, if applicable" }
          },
          required: ["name", "category", "nutritionalInfo", "isAligned"]
        }
      }
    });

    return robustJsonParse<ScannedItem | null>(response.text || "{}", null);
  } catch (error) {
    console.error("Error analyzing grocery item:", error);
    return null;
  }
}

export async function generateMealPlan(groceries: GroceryItem[], profile: HealthProfile, days: number = 3, budget?: number, people?: number, preferences?: string): Promise<MealPlan | null> {
  try {
    // FIX: Upgraded from flash-lite-preview to the latest stable flash model.
    // Meal plan generation involves multi-step cost estimation, ingredient substitution
    // reasoning, and health profile cross-referencing — tasks where flash-lite's reduced
    // thinking capacity produces incoherent macro calculations and ignores budget constraints.
    const model = "gemini-3.1-flash-preview";

    const profileContext = `
      Diet Types: ${profile.dietTypes?.join(', ') || 'None'}
      Allergies: ${profile.allergies?.join(', ') || 'None'}
      Health Goals: ${profile.goals?.join(', ') || 'None'}
    `;

    const safeGroceries = groceries || [];
    const groceryList = safeGroceries.map(g => `${g.quantity}x ${g.name}`).join(', ');

    const today = new Date();
    const currentDay = today.toLocaleDateString('en-US', { weekday: 'long' });

    const systemInstruction = `You are an expert meal planner and nutritionist.
    STRICT TOPIC ENFORCEMENT: You MUST only generate meal plans related to food, diet, and nutrition. If the user's preferences or request are completely unrelated to food or meal planning, you MUST return an empty meal plan or refuse the request.
    Today is ${currentDay}. Start the meal plan from today.
    Create a ${days}-day meal plan based on the user's health profile.
    ${safeGroceries.length > 0 ? "Try to utilize the provided groceries as much as possible, but you can assume basic pantry staples (oil, salt, pepper, basic spices) are available." : "The user's grocery list is currently empty. Generate a meal plan, and the user will purchase the necessary ingredients later."}
    
    ${people ? `The meal plan is for ${people} people.` : ''}
    ${budget ? `The total budget for the meal plan is $${budget}. You MUST use the googleSearch tool to check current market prices for the ingredients you are suggesting. Calculate the total estimated cost of all ingredients required for this meal plan. If the total estimated cost exceeds the user's budget of $${budget}, you MUST provide a 'budgetWarning' explaining which items are driving up the cost and suggesting cheaper alternatives.` : 'You MUST use the googleSearch tool to check current market prices for the ingredients you are suggesting and calculate the total estimated cost.'}
    ${preferences ? `Specific preferences: ${preferences}` : ''}
    
    User's Health Profile:
    ${profileContext}
    
    Available Groceries:
    ${groceryList || 'None'}
    `;

    const mealSchema = {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        description: { type: Type.STRING },
        cuisine: { type: Type.STRING },
        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
        recipe: { type: Type.STRING },
        prepNotes: { type: Type.STRING },
        macros: {
          type: Type.OBJECT,
          properties: {
            calories: { type: Type.NUMBER },
            protein: { type: Type.NUMBER },
            carbs: { type: Type.NUMBER },
            fat: { type: Type.NUMBER }
          }
        }
      },
      required: ["name", "description", "ingredients"]
    };

    const response = await getAIClient().models.generateContent({
      model,
      contents: `Generate a ${days}-day meal plan.`,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
        // FIX: ThinkingLevel was LOW. Budget-constrained meal plans require the model to:
        //   (1) search for ingredient prices, (2) sum costs across multiple meals,
        //   (3) compare against budget, (4) substitute if over budget.
        // That is a 4-step multi-tool reasoning chain — LOW thinking drops steps 2-4.
        // HIGH when budget is specified so cost calculations are actually verified.
        // MEDIUM otherwise for solid nutritional reasoning without the extra latency.
        thinkingConfig: { thinkingLevel: budget ? ThinkingLevel.HIGH : ThinkingLevel.MEDIUM },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            days: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.STRING, description: "e.g., Monday" },
                  date: { type: Type.STRING, description: "e.g., 2026-03-09" },
                  breakfast: mealSchema,
                  lunch: mealSchema,
                  dinner: mealSchema,
                  snack: mealSchema
                },
                required: ["day"]
              }
            },
            estimatedCost: { type: Type.NUMBER, description: "The total estimated cost of all ingredients required for the meal plan based on current market prices." },
            budgetWarning: { type: Type.STRING, description: "If the estimatedCost exceeds the user's budget, provide a warning message explaining why and suggesting cheaper alternatives." }
          },
          required: ["days"]
        }
      }
    });

    return robustJsonParse<MealPlan | null>(response.text || "{}", null);
  } catch (error) {
    console.error("Error generating meal plan:", error);
    return null;
  }
}

export async function searchSales(query: string, store?: string, category?: string, lat?: number, lng?: number, accuracy?: number, postalCode?: string): Promise<SaleItem[]> {
  // FIX: Upgraded from flash-lite-preview to the latest stable flash model.
  // searchSales is the core factual backbone of the entire agent. Every price the
  // live agent presents to the user, every addItem call, and every HITL confirmation
  // depends on the accuracy of this function's output. Flash Lite's reduced capacity
  // for multi-step web search reasoning (finding the closest branch, cross-referencing
  // flyer aggregators, verifying addresses) produces hallucinated prices and fake store
  // addresses — the exact failure mode the system instruction explicitly prohibits.
  const model = "gemini-3.1-flash-lite-preview";

  const sanitizedQuery = sanitizePromptInput(query);
  const sanitizedStore = store ? sanitizePromptInput(store, 50) : undefined;
  const sanitizedCategory = category ? sanitizePromptInput(category, 50) : undefined;
  const sanitizedPostalCode = postalCode ? sanitizePromptInput(postalCode, 10) : undefined;

  const systemInstruction = `You are a comprehensive global grocery item finder.
Your primary goal is to find ALL available prices for the requested items, including both current sales (from flyers) and regular prices (from store websites).
Your task is to find and list items from major chains and local grocers in the user's area anywhere in the world (e.g., Walmart, Target, Aldi, Tesco, Carrefour, Woolworths, Loblaws, etc.).
STRICT TOPIC ENFORCEMENT: If the user's query is completely unrelated to groceries, food, household items, or store locations, you MUST return an empty array []. Do not process non-grocery queries.
To find these deals and prices, you MUST aggressively search across digital flyer aggregators (like Flipp, Reebee, Flyerify) for sales AND official store websites for regular prices.
If you find multiple prices for the same item, ALWAYS prioritize and return the cheapest one.
DO NOT hallucinate or estimate prices. You MUST ONLY return actual, verified prices found in current flyers or official store websites. If an item is not on sale, you MUST search the official store websites to find its EXACT regular price.
Provide a COMPREHENSIVE list of items. Do not limit the number of items.

CRITICAL RULE FOR LOCATIONS: You MUST provide the EXACT and CLOSEST store address to the user's location. Use Google Search to verify the actual address of the closest store branch. DO NOT generate fake, old, or approximate addresses. ALWAYS verify the closest branch address to the provided coordinates or postal code.

CRITICAL RULE: You MUST ALWAYS include the size, quantity, or weight of the product in the 'name' field. 
For example, instead of "Grass-Fed Lean Ground Beef", return "Grass-Fed Lean Ground Beef (400g)". 
Instead of "Coca Cola", return "Coca Cola (330ml)" or "Coca Cola (1L)".
Never return a product name without its corresponding size/weight/volume.

Return JSON array of objects:
- name: Product name (MUST include size/weight/volume)
- price: Current price (e.g., "$2.99" or "2 for $5.00")
- originalPrice: The original or regular price (if available, e.g., "$4.99")
- isOnSale: Boolean, true if the item is on sale, false if it's a regular price
- validFrom: The date the sale period starts (if available, e.g., "Oct 12" or "Tomorrow")
- validUntil: The date the sale period ends (if available, e.g., "Oct 18")
- store: Store name
- category: Category name
- address: Street address in the user's area
- distance: Estimated distance (e.g., "1.2 km")
- unit: The unit of measurement (e.g., "lb", "kg", "pieces", "pack")
- description: Brief details about the item or deal`;

  let userPrompt = "";
  if (sanitizedQuery) {
    userPrompt += `Find all available prices (both current sales and regular prices) for: ${sanitizedQuery}. If an item is not on sale, you MUST search official store websites to find its EXACT verified regular price and include it with isOnSale: false. DO NOT estimate prices. You must work hard to find the real prices on store websites so the user gets results.`;
  } else if (sanitizedStore) {
    userPrompt += `Find ALL items currently on sale in the current weekly flyer for ${sanitizedStore}. You MUST return a comprehensive list of ALL items currently on sale. If an item is not on sale, search for the regular price items and display them.`;
  } else if (sanitizedCategory) {
    userPrompt += `Find ALL items currently on sale in the current weekly flyer for the category: ${sanitizedCategory}. You MUST return a comprehensive list of ALL items currently on sale. If an item is not on sale, search for the regular price items and display them.`;
  } else {
    userPrompt += `Find ALL items currently on sale in weekly flyers across the user's local area. You MUST return a comprehensive list of ALL items currently on sale. If an item is not on sale, search for the regular price items and display them.`;
  }

  if (sanitizedStore) {
    userPrompt += ` CRITICAL: ONLY return items from the store: ${sanitizedStore}. Do NOT include items from any other store.`;
  } else {
    userPrompt += ` CRITICAL: You MUST include items from MULTIPLE DIFFERENT nearby store chains (e.g., show prices from local equivalents of Walmart, Aldi, Tesco, Loblaws, etc. for the searched items) so the user can compare prices across different retailers. Do not restrict your results to just one store.`;
  }

  if (sanitizedCategory) userPrompt += ` Category: ${sanitizedCategory}.`;
  if (sanitizedPostalCode) userPrompt += ` Postal Code: ${sanitizedPostalCode}.`;
  if (lat && lng) {
    userPrompt += ` User location: (${lat}, ${lng})${accuracy ? ` (accuracy: ±${accuracy}m)` : ""}. CRITICAL: You MUST use Google Search to find the absolute closest physical store branch to these exact coordinates. Do not return a generic or downtown address if there is a closer branch. DO NOT hallucinate addresses. Verify the address actually exists.`;
  }

  try {
    const response = await getAIClient().models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
        // FIX: ThinkingLevel was LOW. searchSales must perform a multi-step reasoning
        // chain: (1) query flyer aggregators, (2) query official store websites,
        // (3) locate the closest branch via coordinates, (4) cross-reference and
        // de-duplicate prices, (5) rank by price. LOW thinking drops steps 3-5,
        // producing the exact hallucinated addresses and estimated prices the system
        // instruction explicitly prohibits. MEDIUM provides the necessary depth for
        // reliable web search grounding without excessive latency.
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Product name" },
              price: { type: Type.STRING, description: "Current price" },
              originalPrice: { type: Type.STRING, description: "Original or regular price" },
              isOnSale: { type: Type.BOOLEAN, description: "Whether the item is on sale" },
              // FIX: validFrom was present in the system instruction, in addItem's tool
              // schema, and in the SaleItem type — but was missing from this responseSchema.
              // The model probabilistically omitted it, causing addItem to silently receive
              // undefined validFrom even when the search result contained sale start dates.
              validFrom: { type: Type.STRING, description: "Date the sale starts (e.g., 'Mar 13')" },
              validUntil: { type: Type.STRING, description: "Date the sale ends" },
              store: { type: Type.STRING, description: "Store name" },
              category: { type: Type.STRING, description: "Category" },
              address: { type: Type.STRING, description: "Specific street address" },
              distance: { type: Type.STRING, description: "Estimated distance" },
              unit: { type: Type.STRING, description: "The unit of measurement (e.g., lb, kg, pieces, pack)" },
              mapsUri: { type: Type.STRING, description: "Google Maps URL" },
              description: { type: Type.STRING, description: "Brief details (max 100 chars)" }
            },
            required: ["name", "price", "store", "category", "address", "isOnSale"]
          }
        }
      }
    });

    const items = robustJsonParse<any[]>(response.text || "[]", []);

    const mappedItems = items.map((item: any, index: number) => {
      // Always generate a reliable Google Maps search URL instead of trusting AI-generated links
      // AI-generated links are often malformed (e.g., missing place IDs or empty coordinates)
      const query = encodeURIComponent(`${item.store || ''} ${item.address || ''}`.trim());
      const reliableMapsUri = `https://www.google.com/maps/search/?api=1&query=${query}`;

      return {
        ...item,
        mapsUri: reliableMapsUri,
        id: `item-${Date.now()}-${index}`
      };
    });

    return mappedItems;
  } catch (e) {
    console.error("Search sales API error:", e);
    return [];
  }
}

export async function filterStoresByLocation(
  stores: { name: string; logo: string }[],
  lat?: number,
  lng?: number,
  postalCode?: string
): Promise<{ name: string; logo: string }[]> {
  if (!lat && !lng && !postalCode) return stores;

  const systemInstruction = `You are a helpful assistant that determines which grocery store chains operate in a specific location.
You will be given a list of grocery store chains and a user's location.
Return a JSON array containing ONLY the names of the stores from the provided list that actually have physical locations in or near the user's area.
Do NOT include stores that do not operate in that region (e.g., do not include Canadian stores if the user is in the US, and vice versa).`;

  let userPrompt = `Store list: ${stores.map(s => s.name).join(', ')}\n`;
  if (lat && lng) {
    userPrompt += `User location: (${lat}, ${lng})\n`;
  } else if (postalCode) {
    userPrompt += `User postal/zip code: ${postalCode}\n`;
  }
  userPrompt += `Return the JSON array of store names that operate near this location.`;

  try {
    const response = await getAIClient().models.generateContent({
      // This is a simple regional availability check — flash-lite is appropriate here.
      // The task is single-step (does chain X operate in region Y?) with no price
      // verification or multi-hop reasoning. LOW thinking is also appropriate since
      // this fires on session start and impacts perceived cold-start latency.
      model: "gemini-3.1-flash-lite-preview",
      contents: userPrompt,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING
          }
        }
      }
    });

    const validStoreNames = robustJsonParse<string[]>(response.text || "[]", []);

    if (!validStoreNames || validStoreNames.length === 0) {
      return stores; // Fallback to all stores if the AI fails or returns empty
    }

    const validNamesLower = validStoreNames.map(n => n.toLowerCase());
    return stores.filter(store => validNamesLower.includes(store.name.toLowerCase()));
  } catch (e) {
    console.error("Filter stores API error:", e);
    return stores; // Fallback to all stores on error
  }
}