import fs from 'fs';

const translations = {
  en: { meal_cravings_short: "Any specific cravings?" },
  zh: { meal_cravings_short: "有什么特别想吃的吗？" },
  es: { meal_cravings_short: "¿Algún antojo específico?" },
  fr: { meal_cravings_short: "Des envies spécifiques ?" },
  'fr-CA': { meal_cravings_short: "Des envies spécifiques ?" },
  pt: { meal_cravings_short: "Algum desejo específico?" },
  hi: { meal_cravings_short: "कोई विशेष लालसा?" },
  ar: { meal_cravings_short: "أي رغبات معينة؟" },
  pnb: { meal_cravings_short: "کوئی خاص خواہش؟" }
};

let content = fs.readFileSync('src/i18n/config.ts', 'utf8');

for (const [lang, keys] of Object.entries(translations)) {
  const langKey = lang === 'fr-CA' ? '"fr-CA"' : lang;
  const regex = new RegExp(`(${langKey}:\\s*{\\s*translation:\\s*{[\\s\\S]*?)(    },\\n  },)`);
  
  const match = content.match(regex);
  if (match) {
    const newKeys = Object.entries(keys).map(([k, v]) => `      ${k}: "${v}",`).join('\n');
    content = content.replace(regex, `$1${newKeys}\n$2`);
  } else {
    // try end of file for pnb
    const regexEnd = new RegExp(`(${langKey}:\\s*{\\s*translation:\\s*{[\\s\\S]*?)(    }\\n  }\\n};)`);
    const matchEnd = content.match(regexEnd);
    if (matchEnd) {
      const newKeys = Object.entries(keys).map(([k, v]) => `      ${k}: "${v}",`).join('\n');
      content = content.replace(regexEnd, `$1${newKeys}\n$2`);
    } else {
      console.log("Could not find", langKey);
    }
  }
}

fs.writeFileSync('src/i18n/config.ts', content);
console.log("Done");
