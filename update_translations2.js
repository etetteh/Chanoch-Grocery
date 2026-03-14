import fs from 'fs';

const translations = {
  'fr-CA': {
    refresh_location: "Actualiser",
    meal_budget_placeholder: "Budget optionnel (ex. 150)",
    meal_cravings_placeholder: "Des envies spécifiques ou des demandes diététiques ? (ex. 'Je veux beaucoup de pâtes', 'Uniquement des soupers faibles en glucides')",
    share: "Partager",
    clear_all: "Tout effacer",
    cancel: "Annuler"
  }
};

let content = fs.readFileSync('src/i18n/config.ts', 'utf8');

for (const [lang, keys] of Object.entries(translations)) {
  const langKey = '"fr-CA"';
  const regex = new RegExp(`(${langKey}:\\s*{\\s*translation:\\s*{[\\s\\S]*?)(    },\\n  },)`);
  
  const match = content.match(regex);
  if (match) {
    const newKeys = Object.entries(keys).map(([k, v]) => `      ${k}: "${v}",`).join('\n');
    content = content.replace(regex, `$1${newKeys}\n$2`);
  } else {
    console.log("Could not find", langKey);
  }
}

fs.writeFileSync('src/i18n/config.ts', content);
console.log("Done");
